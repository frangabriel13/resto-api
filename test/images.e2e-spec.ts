import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { ErrorReporter } from './../src/common/errors/error-reporter.js';
import { hashPassword } from './../src/common/passwords.js';
import { TenantContext } from './../src/common/tenant/tenant-context.js';
import { IMAGE_STORAGE } from './../src/modules/images/image-storage.js';
import { MAX_IMAGE_BYTES } from './../src/modules/images/image-upload.interceptor.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { createClub, STAFF_PASSWORD } from './helpers/club.js';
import {
  FAKE_IMAGES_URL,
  FakeImageStorage,
  fakePng,
} from './helpers/fake-image-storage.js';
import { loginAdmin, loginStaff } from './helpers/sessions.js';

const ADMIN_PASSWORD = 'clave-de-admin';
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe('Imágenes: logo y portada (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let storage: FakeImageStorage;
  const reported: unknown[] = [];
  let admin: string;
  let cafe: Awaited<ReturnType<typeof createClub>>;

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    storage = new FakeImageStorage();
    reported.length = 0;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IMAGE_STORAGE)
      .useValue(storage)
      .overrideProvider(ErrorReporter)
      .useValue({ report: (error: unknown) => reported.push(error) })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    await prisma.platformAdmin.create({
      data: {
        email: 'admin@fullsync.com',
        name: 'Admin',
        passwordHash: await hashPassword(ADMIN_PASSWORD),
      },
    });
    admin = await loginAdmin(app, 'admin@fullsync.com', ADMIN_PASSWORD);
    cafe = await createClub(prisma, 'cafe', [
      ['duena@cafe.com', 'OWNER'],
      ['empleado@cafe.com', 'EMPLOYEE'],
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  const imagePath = (kind: string, merchantId = cafe.merchantId) =>
    `/admin/merchants/${merchantId}/images/${kind}`;
  const upload = (
    path: string,
    cookie: string,
    file: Buffer,
    filename = 'imagen.png',
  ) =>
    request(app.getHttpServer())
      .put(path)
      .set('Cookie', cookie)
      .attach('file', file, { filename, contentType: 'image/png' });
  const remove = (path: string, cookie: string) =>
    request(app.getHttpServer()).delete(path).set('Cookie', cookie);
  const merchant = () =>
    prisma.merchant.findUniqueOrThrow({ where: { id: cafe.merchantId } });
  const imageUrl = (kind: string, extension = 'png') =>
    new RegExp(
      `^${FAKE_IMAGES_URL}/merchants/${cafe.merchantId}/${kind}-[a-z0-9]{12}\\.${extension}$`,
    );

  describe('admin', () => {
    it('sube el logo y la portada con el tipo detectado, y la pieza los muestra', async () => {
      // El navegador dice SVG: vale lo que hay adentro.
      const logo = await request(app.getHttpServer())
        .put(imagePath('logo'))
        .set('Cookie', admin)
        .attach('file', fakePng(), {
          filename: 'logo.svg',
          contentType: 'image/svg+xml',
        })
        .expect(200);
      const cover = await upload(imagePath('cover'), admin, fakePng()).expect(
        200,
      );

      expect(logo.body.logoUrl).toMatch(imageUrl('logo'));
      expect(cover.body.page.coverUrl).toMatch(imageUrl('cover'));
      expect([...storage.objects.values()].map((o) => o.contentType)).toEqual([
        'image/png',
        'image/png',
      ]);
      const piece = await prisma.piece.create({
        data: {
          merchantId: cafe.merchantId,
          publicCode: 'mostrador123',
          label: 'Mostrador',
        },
      });
      const page = await request(app.getHttpServer())
        .get(`/public/pieces/${piece.publicCode}`)
        .expect(200);
      expect(page.body.merchant).toMatchObject({
        logoUrl: logo.body.logoUrl,
        coverUrl: cover.body.page.coverUrl,
      });

      const audit = await prisma.auditEvent.findMany({
        where: {
          action: { in: ['merchant.updated', 'merchant_page.updated'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((e) => [e.action, e.actorType, e.payload])).toEqual([
        [
          'merchant.updated',
          'PLATFORM_ADMIN',
          { logoUrl: { from: null, to: logo.body.logoUrl } },
        ],
        [
          'merchant_page.updated',
          'PLATFORM_ADMIN',
          { changedFields: ['coverUrl'] },
        ],
      ]);
    });

    it('reemplazar o sacar la imagen borra la anterior del bucket', async () => {
      await upload(imagePath('cover'), admin, fakePng()).expect(200);
      const second = await upload(imagePath('cover'), admin, fakePng());

      expect(storage.keys()).toEqual([
        second.body.page.coverUrl.slice(FAKE_IMAGES_URL.length + 1),
      ]);

      const removed = await remove(imagePath('cover'), admin).expect(200);
      expect(removed.body.page.coverUrl).toBeNull();
      expect(storage.keys()).toEqual([]);
      // Sacarla de nuevo no cambia nada ni audita.
      await remove(imagePath('cover'), admin).expect(200);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'merchant_page.updated' },
        }),
      ).toBe(3);
    });

    it('una imagen que no es del bucket no se toca', async () => {
      await prisma.merchant.update({
        where: { id: cafe.merchantId },
        data: { logoUrl: 'https://cdn.com/logo.png' },
      });

      await upload(imagePath('logo'), admin, fakePng()).expect(200);

      expect(storage.keys()).toHaveLength(1);
      expect(reported).toEqual([]);
    });

    it('rechaza otro tipo, más de 2 MB o ningún archivo, sin guardar nada', async () => {
      const svg = await upload(imagePath('logo'), admin, SVG).expect(415);
      const big = await upload(
        imagePath('logo'),
        admin,
        fakePng(MAX_IMAGE_BYTES + 1),
      ).expect(413);
      const none = await request(app.getHttpServer())
        .put(imagePath('logo'))
        .set('Cookie', admin)
        .field('otro', 'x')
        .expect(400);

      expect([svg.body.code, big.body.code, none.body.code]).toEqual([
        'IMAGE_TYPE_NOT_ALLOWED',
        'IMAGE_TOO_LARGE',
        'VALIDATION_ERROR',
      ]);
      await upload(imagePath('logo'), admin, fakePng(MAX_IMAGE_BYTES)).expect(
        200,
      );
      expect(storage.keys()).toHaveLength(1);
    });

    it('si falla la subida, el comercio queda como estaba', async () => {
      storage.failingPut = true;

      const res = await upload(imagePath('cover'), admin, fakePng()).expect(
        502,
      );

      expect(res.body.code).toBe('IMAGE_UPLOAD_FAILED');
      expect((await merchant()).coverUrl).toBeNull();
    });

    it('si falla el borrado de la vieja, se reporta y la nueva queda', async () => {
      await upload(imagePath('cover'), admin, fakePng()).expect(200);
      storage.failingDelete = true;

      const second = await upload(imagePath('cover'), admin, fakePng()).expect(
        200,
      );

      expect((await merchant()).coverUrl).toBe(second.body.page.coverUrl);
      expect(reported).toHaveLength(1);
    });

    it('archivado, inexistente, otro tipo de imagen o sin sesión de admin', async () => {
      await prisma.merchant.update({
        where: { id: cafe.merchantId },
        data: { status: 'ENDED' },
      });
      await request(app.getHttpServer())
        .post(`/admin/merchants/${cafe.merchantId}/archive`)
        .set('Cookie', admin)
        .expect(200);

      const archived = await upload(imagePath('cover'), admin, fakePng());
      expect(archived.body.code).toBe('MERCHANT_ARCHIVED');
      await upload(imagePath('cover', randomUUID()), admin, fakePng()).expect(
        404,
      );
      await upload(imagePath('banner'), admin, fakePng()).expect(400);
      const owner = await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD);
      await upload(imagePath('cover'), owner.cookie, fakePng()).expect(401);
      expect(storage.keys()).toEqual([]);
    });
  });

  describe('portada desde la configuración del dueño', () => {
    it('el dueño la sube, la reemplaza y la saca', async () => {
      const { cookie } = await loginStaff(
        app,
        'duena@cafe.com',
        STAFF_PASSWORD,
      );

      const first = await upload(
        '/panel/settings/cover',
        cookie,
        fakePng(),
      ).expect(200);
      const second = await upload(
        '/panel/settings/cover',
        cookie,
        fakePng(),
      ).expect(200);

      expect(second.body.page.coverUrl).toMatch(imageUrl('cover'));
      expect(second.body.page.coverUrl).not.toBe(first.body.page.coverUrl);
      expect(storage.keys()).toHaveLength(1);

      await remove('/panel/settings/cover', cookie).expect(200);
      expect((await merchant()).coverUrl).toBeNull();
      expect(storage.keys()).toEqual([]);
      const audit = await prisma.auditEvent.findMany({
        where: { action: 'merchant_page.updated' },
      });
      expect(audit).toHaveLength(3);
      expect(audit[0]).toMatchObject({
        actorType: 'STAFF',
        actorId: cafe.staffIds['duena@cafe.com'],
      });
    });

    it('el EMPLOYEE no puede; con el club pausado no se cambia', async () => {
      const employee = await loginStaff(
        app,
        'empleado@cafe.com',
        STAFF_PASSWORD,
      );
      const owner = await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD);

      await upload('/panel/settings/cover', employee.cookie, fakePng()).expect(
        403,
      );
      await prisma.merchant.update({
        where: { id: cafe.merchantId },
        data: { status: 'PAUSED' },
      });
      const paused = await upload(
        '/panel/settings/cover',
        owner.cookie,
        fakePng(),
      );

      expect(paused.body.code).toBe('MERCHANT_READ_ONLY');
      expect(storage.keys()).toEqual([]);
    });
  });

  it('lo que espera al commit no corre si la transacción del request falla', async () => {
    const tenant = app.get(TenantContext);
    const ran: string[] = [];
    const scope = {
      merchantId: cafe.merchantId,
      merchantStatus: 'ACTIVE' as const,
      stampCooldownMinutes: 60,
      staffUserId: cafe.staffIds['duena@cafe.com']!,
      role: 'OWNER' as const,
    };

    await tenant.run(scope, async () => {
      tenant.afterCommit(async () => void ran.push('confirmada'));
    });
    await expect(
      tenant.run(scope, async () => {
        tenant.afterCommit(async () => void ran.push('fallida'));
        throw new Error('falla');
      }),
    ).rejects.toThrow('falla');

    expect(ran).toEqual(['confirmada']);
  });
});
