import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { createOpenApiDocument } from './../src/common/openapi.js';
import { hashPassword } from './../src/common/passwords.js';
import { StaffGuard } from './../src/modules/auth/staff/staff.guard.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { sessionCookie } from './helpers/sessions.js';

@Controller('test-staff')
class TestPanelController {
  @Get('panel')
  @UseGuards(StaffGuard)
  panel() {
    return { ok: true };
  }
}

const PASSWORD = 'clave-correcta';

describe('Login de staff (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;

  // Una app por test: el límite de intentos se cuenta en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestPanelController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    const passwordHash = await hashPassword(PASSWORD);
    const [cafe, heladeria, cerrado] = await Promise.all(
      ['cafe', 'heladeria', 'cerrado'].map((slug) =>
        prisma.merchant.create({ data: { name: slug, slug } }),
      ),
    );
    await prisma.staffUser.create({
      data: {
        email: 'ana@test.com',
        name: 'Ana',
        passwordHash,
        mustChangePassword: false,
        memberships: {
          create: [
            { merchantId: cafe!.id, role: 'OWNER' },
            { merchantId: heladeria!.id, role: 'EMPLOYEE' },
            { merchantId: cerrado!.id, role: 'EMPLOYEE', active: false },
          ],
        },
      },
    });
    await prisma.staffUser.create({
      data: {
        email: 'nuevo@test.com',
        name: 'Nuevo',
        passwordHash,
        memberships: { create: { merchantId: cafe!.id, role: 'EMPLOYEE' } },
      },
    });
    await prisma.staffUser.create({
      data: {
        email: 'baja@test.com',
        name: 'Baja',
        passwordHash,
        mustChangePassword: false,
        memberships: {
          create: { merchantId: cafe!.id, role: 'EMPLOYEE', active: false },
        },
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const login = (email: string, password = PASSWORD) =>
    http().post('/auth/staff/login').send({ email, password });
  const withCookie = (path: string, cookie: string) =>
    http().get(path).set('Cookie', cookie);
  const changePassword = (cookie: string, body: object) =>
    http().post('/auth/staff/password').set('Cookie', cookie).send(body);

  describe('login', () => {
    it('devuelve la cuenta con sus comercios activos y deja la sesión', async () => {
      const cafe = await prisma.merchant.findUniqueOrThrow({
        where: { slug: 'cafe' },
      });
      await prisma.rewardRule.create({
        data: {
          merchantId: cafe.id,
          version: 1,
          stampsRequired: 8,
          rewardDescription: 'Café',
          active: true,
        },
      });

      const res = await login('ana@test.com').expect(200);

      expect(res.body.user).toMatchObject({
        email: 'ana@test.com',
        name: 'Ana',
        mustChangePassword: false,
      });
      expect(res.body.merchants).toMatchObject([
        { slug: 'cafe', role: 'OWNER', status: 'DRAFT', hasActiveRule: true },
        { slug: 'heladeria', role: 'EMPLOYEE', hasActiveRule: false },
      ]);
      const me = await withCookie('/auth/staff/me', sessionCookie(res));
      expect(me.status).toBe(200);
      expect(me.body).toEqual(res.body);
    });

    it('no distingue mayúsculas ni espacios en el email', async () => {
      await login('  ANA@Test.com ').expect(200);
    });

    it('responde igual a un email inexistente y a una contraseña incorrecta', async () => {
      const wrongPassword = await login('ana@test.com', 'otra-clave');
      const unknownEmail = await login('nadie@test.com');

      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    });

    it('rechaza a un usuario dado de baja en todos sus comercios', async () => {
      const res = await login('baja@test.com').expect(403);
      expect(res.body.code).toBe('NO_ACTIVE_MERCHANT');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('limita los intentos por minuto', async () => {
      for (let i = 0; i < 10; i++) {
        await login('ana@test.com', 'otra-clave').expect(401);
      }
      const res = await login('ana@test.com').expect(429);
      expect(res.body.code).toBe('RATE_LIMITED');
    });
  });

  describe('logout', () => {
    it('cierra la sesión', async () => {
      const cookie = sessionCookie(await login('ana@test.com'));

      await http().post('/auth/staff/logout').set('Cookie', cookie).expect(204);

      await withCookie('/auth/staff/me', cookie).expect(401);
    });

    it('sin sesión no falla', async () => {
      await http().post('/auth/staff/logout').expect(204);
    });
  });

  describe('cambio de contraseña obligatorio', () => {
    it('mientras está pendiente solo deja ver la cuenta y cambiarla', async () => {
      const res = await login('nuevo@test.com').expect(200);
      expect(res.body.user.mustChangePassword).toBe(true);
      const cookie = sessionCookie(res);

      const panel = await withCookie('/test-staff/panel', cookie).expect(403);
      expect(panel.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await withCookie('/auth/staff/me', cookie).expect(200);
    });

    it('rechaza una contraseña actual incorrecta o una nueva inválida', async () => {
      const cookie = sessionCookie(await login('nuevo@test.com'));

      const wrong = await changePassword(cookie, {
        currentPassword: 'otra-clave',
        newPassword: 'una-clave-nueva',
      }).expect(400);
      expect(wrong.body.code).toBe('CURRENT_PASSWORD_INCORRECT');

      for (const newPassword of ['corta', PASSWORD]) {
        const invalid = await changePassword(cookie, {
          currentPassword: PASSWORD,
          newPassword,
        }).expect(400);
        expect(invalid.body.code).toBe('VALIDATION_ERROR');
        expect(invalid.body.details.issues[0].path).toBe('newPassword');
      }
    });

    it('al cambiarla se habilita el panel y la contraseña vieja deja de servir', async () => {
      const cookie = sessionCookie(await login('nuevo@test.com'));

      await changePassword(cookie, {
        currentPassword: PASSWORD,
        newPassword: 'una-clave-nueva',
      }).expect(204);

      await withCookie('/test-staff/panel', cookie).expect(200);
      const me = await withCookie('/auth/staff/me', cookie).expect(200);
      expect(me.body.user.mustChangePassword).toBe(false);
      await login('nuevo@test.com').expect(401);
      await login('nuevo@test.com', 'una-clave-nueva').expect(200);
    });

    it('cierra las otras sesiones del usuario', async () => {
      const current = sessionCookie(await login('ana@test.com'));
      const other = sessionCookie(await login('ana@test.com'));

      await changePassword(current, {
        currentPassword: PASSWORD,
        newPassword: 'una-clave-nueva',
      }).expect(204);

      await withCookie('/auth/staff/me', current).expect(200);
      await withCookie('/auth/staff/me', other).expect(401);
    });
  });

  it('publica los endpoints en el OpenAPI', () => {
    const doc = createOpenApiDocument(app);
    expect(doc.paths['/auth/staff/login']?.post?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/LoginBody' },
        },
      },
    });
    expect(doc.components?.schemas).toHaveProperty('StaffAccount');
    expect(doc.components?.schemas).toHaveProperty('ChangeStaffPasswordBody');
  });
});
