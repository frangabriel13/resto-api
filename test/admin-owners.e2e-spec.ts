import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { loginAdmin, loginStaff } from './helpers/sessions.js';

const PASSWORD = 'clave-de-admin';

describe('Admin: alta del dueño (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let merchantId: string;

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    await prisma.platformAdmin.create({
      data: {
        email: 'admin@fullsync.com',
        name: 'Admin',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    cookie = await loginAdmin(app, 'admin@fullsync.com', PASSWORD);
    merchantId = (
      await prisma.merchant.create({ data: { name: 'Café', slug: 'cafe' } })
    ).id;
  });

  afterEach(async () => {
    await app.close();
  });

  const createOwner = (body: object, id = merchantId) =>
    request(app.getHttpServer())
      .post(`/admin/merchants/${id}/owner`)
      .set('Cookie', cookie)
      .send(body);

  it('crea al dueño con una contraseña temporal que tiene que cambiar', async () => {
    const res = await createOwner({
      email: ' Duena@Cafe.com ',
      name: 'Dueña',
    }).expect(201);

    expect(res.body).toMatchObject({
      email: 'duena@cafe.com',
      name: 'Dueña',
      newUser: true,
    });
    expect(res.body.temporaryPassword).toHaveLength(16);

    const login = await loginStaff(
      app,
      'duena@cafe.com',
      res.body.temporaryPassword,
    );
    expect(login.body).toMatchObject({
      user: { mustChangePassword: true },
      merchants: [{ id: merchantId, role: 'OWNER' }],
      selectedMerchantId: merchantId,
    });
    expect(await prisma.auditEvent.findMany()).toMatchObject([
      {
        merchantId,
        actorType: 'PLATFORM_ADMIN',
        action: 'staff.created',
        entityId: res.body.staffUserId,
        payload: { role: 'OWNER', newUser: true },
      },
    ]);
  });

  it('a un usuario que ya existe le suma el comercio y conserva su contraseña', async () => {
    const other = await prisma.merchant.create({
      data: { name: 'Heladería', slug: 'heladeria' },
    });
    await prisma.staffUser.create({
      data: {
        email: 'duena@cafe.com',
        name: 'Dueña',
        passwordHash: await hashPassword('su-clave'),
        mustChangePassword: false,
        memberships: { create: { merchantId: other.id, role: 'OWNER' } },
      },
    });

    const res = await createOwner({
      email: 'duena@cafe.com',
      name: 'Otro nombre',
    }).expect(201);

    expect(res.body).toMatchObject({
      name: 'Dueña',
      newUser: false,
      temporaryPassword: null,
    });
    const login = await loginStaff(app, 'duena@cafe.com', 'su-clave');
    expect(login.body.merchants).toHaveLength(2);
  });

  it('rechaza a alguien que ya forma parte del comercio', async () => {
    await createOwner({ email: 'duena@cafe.com', name: 'Dueña' }).expect(201);

    const res = await createOwner({
      email: 'duena@cafe.com',
      name: 'Dueña',
    }).expect(409);
    expect(res.body.code).toBe('STAFF_ALREADY_IN_MERCHANT');
  });

  it('valida los datos y el comercio', async () => {
    await createOwner({ email: 'no-es-email', name: 'X' }).expect(400);
    await createOwner({ email: 'a@b.com', name: '' }).expect(400);
    await createOwner({ email: 'a@b.com', name: 'X' }, randomUUID()).expect(
      404,
    );
    expect(await prisma.staffUser.count()).toBe(0);
  });
});
