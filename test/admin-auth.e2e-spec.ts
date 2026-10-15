import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import { AdminOnly } from './../src/modules/auth/admin/admin-only.decorator.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { loginStaff, sessionCookie } from './helpers/sessions.js';

@Controller('test-admin')
@AdminOnly()
class TestAdminController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

const PASSWORD = 'clave-de-admin';

describe('Login de PlatformAdmin (e2e)', () => {
  let app: INestApplication<App>;

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestAdminController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    const prisma = moduleRef.get(PrismaService);
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.platformAdmin.create({
      data: { email: 'ana@fullsync.com', name: 'Ana', passwordHash },
    });
    const merchant = await prisma.merchant.create({
      data: { name: 'Café', slug: 'cafe' },
    });
    await prisma.staffUser.create({
      data: {
        email: 'ana@fullsync.com',
        name: 'Ana',
        passwordHash,
        mustChangePassword: false,
        memberships: { create: { merchantId: merchant.id, role: 'OWNER' } },
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const login = (email: string, password = PASSWORD) =>
    http().post('/auth/admin/login').send({ email, password });
  const get = (path: string, cookie: string) =>
    http().get(path).set('Cookie', cookie);

  it('entra, deja la sesión y devuelve la cuenta', async () => {
    const res = await login(' ANA@fullsync.com ').expect(200);
    expect(res.body).toMatchObject({ email: 'ana@fullsync.com', name: 'Ana' });

    const cookie = sessionCookie(res, 'fs_admin');
    const me = await get('/auth/admin/me', cookie).expect(200);
    expect(me.body).toEqual(res.body);
    await get('/test-admin/ping', cookie).expect(200);
  });

  it('responde igual a un email inexistente y a una contraseña incorrecta', async () => {
    const wrongPassword = await login('ana@fullsync.com', 'otra').expect(401);
    const unknownEmail = await login('nadie@fullsync.com').expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('limita los intentos por minuto', async () => {
    for (let i = 0; i < 10; i++) {
      await login('ana@fullsync.com', 'otra').expect(401);
    }
    const res = await login('ana@fullsync.com').expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  it('cerrar sesión la invalida', async () => {
    const cookie = sessionCookie(await login('ana@fullsync.com'), 'fs_admin');
    await http().post('/auth/admin/logout').set('Cookie', cookie).expect(204);
    await get('/auth/admin/me', cookie).expect(401);
  });

  it('las sesiones de staff y de admin no se cruzan', async () => {
    const staff = await loginStaff(app, 'ana@fullsync.com', PASSWORD);
    const admin = sessionCookie(await login('ana@fullsync.com'), 'fs_admin');

    await get('/test-admin/ping', staff.cookie).expect(401);
    await get('/auth/staff/me', admin).expect(401);
  });
});
