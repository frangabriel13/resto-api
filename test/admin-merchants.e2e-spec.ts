import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { loginAdmin, loginStaff } from './helpers/sessions.js';

const PASSWORD = 'clave-de-admin';

describe('Admin: comercios y piezas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cookie: string;

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    await prisma.platformAdmin.create({
      data: {
        email: 'admin@fullsync.com',
        name: 'Admin',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    cookie = await loginAdmin(app, 'admin@fullsync.com', PASSWORD);
  });

  afterEach(async () => {
    await app.close();
  });

  const send = (
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
  ) =>
    request(app.getHttpServer())[method](path).set('Cookie', cookie).send(body);
  const createMerchant = async (body: object = { name: 'Café La Esquina' }) =>
    (await send('post', '/admin/merchants', body).expect(201)).body;
  const addActiveRule = (merchantId: string) =>
    prisma.rewardRule.create({
      data: {
        merchantId,
        version: 1,
        stampsRequired: 8,
        rewardDescription: 'Café',
        active: true,
      },
    });

  describe('comercios', () => {
    it('crea el comercio en preparación, con el slug derivado del nombre', async () => {
      const merchant = await createMerchant();

      expect(merchant).toMatchObject({
        name: 'Café La Esquina',
        slug: 'cafe-la-esquina',
        status: 'DRAFT',
        stampCooldownMinutes: 60,
        logoUrl: null,
      });
      expect(await prisma.auditEvent.findMany()).toMatchObject([
        {
          merchantId: merchant.id,
          actorType: 'PLATFORM_ADMIN',
          action: 'merchant.created',
          entityId: merchant.id,
        },
      ]);
    });

    it('valida los datos y rechaza un slug repetido', async () => {
      for (const body of [
        { name: 'Café', primaryColor: 'rojo' },
        { name: 'Café', logoUrl: 'http://logo.com/a.png' },
        { name: 'Café', slug: 'Con Mayúsculas' },
        { name: 'Café', stampCooldownMinutes: -1 },
        { name: '¡¿?!' },
      ]) {
        const res = await send('post', '/admin/merchants', body).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }

      await createMerchant();
      const repeated = await send('post', '/admin/merchants', {
        name: 'Otro nombre',
        slug: 'cafe-la-esquina',
      }).expect(409);
      expect(repeated.body.code).toBe('SLUG_TAKEN');
    });

    it('lista los comercios con su regla activa y sus dueños', async () => {
      const configured = await createMerchant({ name: 'Configurado' });
      await createMerchant({ name: 'Nuevo' });
      await addActiveRule(configured.id);
      await prisma.staffUser.create({
        data: {
          email: 'duena@test.com',
          name: 'Dueña',
          passwordHash: 'x',
          memberships: { create: { merchantId: configured.id, role: 'OWNER' } },
        },
      });

      const res = await send('get', '/admin/merchants').expect(200);

      expect(res.body).toMatchObject([
        { name: 'Nuevo', hasActiveRule: false, activeOwners: 0 },
        { name: 'Configurado', hasActiveRule: true, activeOwners: 1 },
      ]);
    });

    it('muestra el detalle de un comercio', async () => {
      const merchant = await createMerchant();

      const res = await send('get', `/admin/merchants/${merchant.id}`).expect(
        200,
      );
      expect(res.body).toEqual(merchant);
      await send('get', `/admin/merchants/${randomUUID()}`).expect(404);
      await send('get', '/admin/merchants/no-es-uuid').expect(400);
    });

    it('edita los datos del comercio', async () => {
      const merchant = await createMerchant({
        name: 'Café',
        logoUrl: 'https://logo.com/a.png',
      });

      const res = await send('patch', `/admin/merchants/${merchant.id}`, {
        name: 'Café Nuevo',
        primaryColor: '#112233',
        stampCooldownMinutes: 30,
        logoUrl: null,
      }).expect(200);

      expect(res.body).toMatchObject({
        name: 'Café Nuevo',
        primaryColor: '#112233',
        stampCooldownMinutes: 30,
        logoUrl: null,
        slug: 'cafe',
      });
    });

    it('el slug solo se cambia mientras está en preparación', async () => {
      const merchant = await createMerchant();
      const path = `/admin/merchants/${merchant.id}`;

      await send('patch', path, { slug: 'la-esquina' }).expect(200);
      await addActiveRule(merchant.id);
      await send('patch', path, { status: 'ACTIVE' }).expect(200);

      const res = await send('patch', path, { slug: 'otra' }).expect(409);
      expect(res.body.code).toBe('SLUG_LOCKED');
    });

    it('para activarlo exige una regla de premio activa', async () => {
      const merchant = await createMerchant();
      const path = `/admin/merchants/${merchant.id}`;

      const res = await send('patch', path, { status: 'ACTIVE' }).expect(409);
      expect(res.body.code).toBe('ACTIVE_RULE_REQUIRED');

      await addActiveRule(merchant.id);
      const active = await send('patch', path, { status: 'ACTIVE' }).expect(
        200,
      );
      expect(active.body.status).toBe('ACTIVE');
    });

    it('rechaza las transiciones de estado inválidas', async () => {
      const merchant = await createMerchant();
      const path = `/admin/merchants/${merchant.id}`;
      await addActiveRule(merchant.id);

      const paused = await send('patch', path, { status: 'PAUSED' }).expect(
        409,
      );
      expect(paused.body.code).toBe('INVALID_STATUS_TRANSITION');
      await send('patch', path, { status: 'ACTIVE' }).expect(200);
      await send('patch', path, { status: 'ENDED' }).expect(200);
      await send('patch', path, { status: 'ACTIVE' }).expect(409);

      const audit = await prisma.auditEvent.findMany({
        where: { action: 'merchant.updated' },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((e) => e.payload)).toMatchObject([
        { status: 'ACTIVE', previousStatus: 'DRAFT' },
        { status: 'ENDED', previousStatus: 'ACTIVE' },
      ]);
    });
  });

  describe('piezas', () => {
    it('crea piezas con un código público aleatorio y las lista', async () => {
      const merchant = await createMerchant();
      const path = `/admin/merchants/${merchant.id}/pieces`;

      const first = await send('post', path, { label: 'Mostrador' }).expect(
        201,
      );
      const second = await send('post', path, { label: 'Mesa 1' }).expect(201);

      expect(first.body).toMatchObject({
        label: 'Mostrador',
        type: 'NFC_QR',
        active: true,
      });
      expect(first.body.publicCode).toMatch(/^[2-9a-hj-km-np-z]{12}$/);
      expect(second.body.publicCode).not.toBe(first.body.publicCode);

      const list = await send('get', path).expect(200);
      expect(list.body).toEqual([first.body, second.body]);
      expect(
        await prisma.auditEvent.count({ where: { action: 'piece.created' } }),
      ).toBe(2);
    });

    it('edita el nombre y la desactiva, pero no cambia el código', async () => {
      const merchant = await createMerchant();
      const path = `/admin/merchants/${merchant.id}/pieces`;
      const piece = (await send('post', path, { label: 'Mostrador' })).body;

      const res = await send('patch', `${path}/${piece.id}`, {
        label: 'Caja',
        active: false,
        publicCode: 'otro-codigo',
      }).expect(200);

      expect(res.body).toMatchObject({
        label: 'Caja',
        active: false,
        publicCode: piece.publicCode,
      });
    });

    it('una pieza de otro comercio o un comercio inexistente dan 404', async () => {
      const cafe = await createMerchant({ name: 'Café' });
      const heladeria = await createMerchant({ name: 'Heladería' });
      const piece = (
        await send('post', `/admin/merchants/${cafe.id}/pieces`, {
          label: 'Mostrador',
        })
      ).body;

      await send(
        'patch',
        `/admin/merchants/${heladeria.id}/pieces/${piece.id}`,
        { label: 'Robada' },
      ).expect(404);
      await send('get', `/admin/merchants/${randomUUID()}/pieces`).expect(404);
      await send('post', `/admin/merchants/${randomUUID()}/pieces`, {
        label: 'X',
      }).expect(404);
    });
  });

  it('sin sesión de admin no entra', async () => {
    const merchant = await prisma.merchant.create({
      data: { name: 'Café', slug: 'cafe' },
    });
    await prisma.staffUser.create({
      data: {
        email: 'duena@cafe.com',
        name: 'Dueña',
        passwordHash: await hashPassword(PASSWORD),
        mustChangePassword: false,
        memberships: { create: { merchantId: merchant.id, role: 'OWNER' } },
      },
    });
    const staff = await loginStaff(app, 'duena@cafe.com', PASSWORD);

    await request(app.getHttpServer()).get('/admin/merchants').expect(401);
    await request(app.getHttpServer())
      .get('/admin/merchants')
      .set('Cookie', staff.cookie)
      .expect(401);
  });
});
