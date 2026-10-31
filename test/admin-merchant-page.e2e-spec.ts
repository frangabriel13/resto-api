import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { loginAdmin } from './helpers/sessions.js';

const PASSWORD = 'clave-de-admin';
const PAGE = {
  wifi: { security: 'WPA', ssid: 'Cafe Clientes', password: 'clave1234' },
  instagramUsername: '@CafeEsquina',
  tiktokUsername: '@cafe.esquina',
  whatsappPhone: '11 2345-6789',
  facebookUrl: 'https://www.facebook.com/cafeesquina',
};

describe('Admin: página del comercio (e2e)', () => {
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

  const send = (method: 'post' | 'patch', path: string, body: object) =>
    request(app.getHttpServer())[method](path).set('Cookie', cookie).send(body);
  const createMerchant = async (page?: object) =>
    (await send('post', '/admin/merchants', { name: 'Café', page }).expect(201))
      .body;
  const pageAudits = () =>
    prisma.auditEvent.findMany({
      where: { action: 'merchant_page.updated' },
      orderBy: { createdAt: 'asc' },
    });

  it('crea el comercio con su página, normalizada', async () => {
    const merchant = await createMerchant(PAGE);

    expect(merchant.page).toEqual({
      coverUrl: null,
      wifi: { ssid: 'Cafe Clientes', password: 'clave1234', security: 'WPA' },
      instagramUsername: 'cafeesquina',
      tiktokUsername: 'cafe.esquina',
      whatsappPhone: '+5491123456789',
      facebookUrl: 'https://www.facebook.com/cafeesquina',
    });
    const created = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'merchant.created' },
    });
    expect(created.payload).toMatchObject({
      pageFields: [
        'wifi',
        'instagramUsername',
        'tiktokUsername',
        'whatsappPhone',
        'facebookUrl',
      ],
    });
    expect(JSON.stringify(created.payload)).not.toMatch(/clave1234|2345/);
  });

  it('edita la página por partes y audita solo qué campos cambiaron', async () => {
    const merchant = await createMerchant(PAGE);
    const path = `/admin/merchants/${merchant.id}`;

    const res = await send('patch', path, {
      page: {
        wifi: { security: 'NONE', ssid: 'Cafe Libre' },
        facebookUrl: null,
      },
    }).expect(200);
    await send('patch', path, {
      page: { instagramUsername: 'cafeesquina' },
    }).expect(200);

    expect(res.body.page).toMatchObject({
      wifi: { ssid: 'Cafe Libre', password: null, security: 'NONE' },
      instagramUsername: 'cafeesquina',
      facebookUrl: null,
    });
    const events = await pageAudits();
    expect(events.map((e) => e.payload)).toEqual([
      { changedFields: ['wifi', 'facebookUrl'] },
    ]);
    expect(events[0]).toMatchObject({ actorType: 'PLATFORM_ADMIN' });
    expect(
      await prisma.auditEvent.count({ where: { action: 'merchant.updated' } }),
    ).toBe(0);
  });

  it('borrar el Wi-Fi deja vacíos sus tres campos', async () => {
    const merchant = await createMerchant(PAGE);

    await send('patch', `/admin/merchants/${merchant.id}`, {
      page: { wifi: null },
    }).expect(200);

    expect(
      await prisma.merchant.findUniqueOrThrow({ where: { id: merchant.id } }),
    ).toMatchObject({ wifiSsid: null, wifiPassword: null, wifiSecurity: null });
  });

  it('valida la página', async () => {
    for (const page of [
      { wifi: { security: 'WPA', ssid: 'Cafe', password: 'corta' } },
      { wifi: { security: 'NONE', ssid: 'Cafe', password: 'clave1234' } },
      { facebookUrl: 'https://fb.com/cafe' },
      { whatsappPhone: '1234' },
      { coverUrl: 'https://img.com/portada.png' },
    ]) {
      const res = await send('post', '/admin/merchants', {
        name: 'Café',
        page,
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.merchant.count()).toBe(0);
  });

  it('archivado no se edita la página', async () => {
    const merchant = await createMerchant();
    await send('post', `/admin/merchants/${merchant.id}/archive`, {}).expect(
      200,
    );

    const res = await send('patch', `/admin/merchants/${merchant.id}`, {
      page: { tiktokUsername: 'cafe' },
    }).expect(409);
    expect(res.body.code).toBe('MERCHANT_ARCHIVED');
  });
});
