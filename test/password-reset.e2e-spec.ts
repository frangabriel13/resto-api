import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { EMAIL_SENDER } from './../src/modules/email/email-sender.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { createClub, STAFF_PASSWORD } from './helpers/club.js';
import { FakeEmailSender } from './helpers/fake-email-sender.js';
import { loginStaff } from './helpers/sessions.js';

const NEW_PASSWORD = 'una-clave-nueva';

describe('Recuperar la contraseña del dueño (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let emails: FakeEmailSender;
  let cafe: Awaited<ReturnType<typeof createClub>>;

  beforeEach(async () => {
    emails = new FakeEmailSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emails)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    cafe = await createClub(prisma, 'cafe', [
      ['duena@cafe.com', 'OWNER'],
      ['empleado@cafe.com', 'EMPLOYEE'],
      ['exdueno@cafe.com', 'OWNER'],
    ]);
    await prisma.staffMembership.updateMany({
      where: { staffUserId: cafe.staffIds['exdueno@cafe.com'] },
      data: { active: false },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const requestReset = (email: string) =>
    http().post('/auth/staff/password-reset/request').send({ email });
  const confirm = (token: string, newPassword = NEW_PASSWORD) =>
    http()
      .post('/auth/staff/password-reset/confirm')
      .send({ token, newPassword });
  const login = (email: string, password: string) =>
    http().post('/auth/staff/login').send({ email, password });
  const backdateTokens = () =>
    prisma.$executeRaw`UPDATE password_reset_tokens SET created_at = created_at - interval '2 minutes'`;

  it('el dueño recibe el link y elige una contraseña nueva; sus sesiones se cierran', async () => {
    const { cookie } = await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD);

    await requestReset('Duena@Cafe.com').expect(204);
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0]).toMatchObject({
      to: 'duena@cafe.com',
      subject: 'Restablecé tu contraseña de Clubsy',
    });
    expect(emails.sent[0]!.text).toContain(
      'http://localhost:3000/panel/restablecer?token=',
    );

    await confirm(emails.lastResetToken).expect(204);

    await http().get('/auth/staff/me').set('Cookie', cookie).expect(401);
    await login('duena@cafe.com', STAFF_PASSWORD).expect(401);
    await login('duena@cafe.com', NEW_PASSWORD).expect(200);
  });

  it('responde igual y no manda nada a un email inexistente, de un empleado o de un dueño dado de baja', async () => {
    for (const email of [
      'nadie@cafe.com',
      'empleado@cafe.com',
      'exdueno@cafe.com',
    ]) {
      const res = await requestReset(email).expect(204);
      expect(res.body).toEqual({});
    }
    expect(emails.sent).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('un pedido nuevo antes de un minuto no manda otro mail; después sí, y el anterior deja de valer', async () => {
    await requestReset('duena@cafe.com').expect(204);
    const first = emails.lastResetToken;
    await requestReset('duena@cafe.com').expect(204);
    expect(emails.sent).toHaveLength(1);

    await backdateTokens();
    await requestReset('duena@cafe.com').expect(204);
    expect(emails.sent).toHaveLength(2);

    const old = await confirm(first).expect(400);
    expect(old.body.code).toBe('RESET_TOKEN_INVALID');
    await confirm(emails.lastResetToken).expect(204);
  });

  it('el link no sirve dos veces ni vencido', async () => {
    await requestReset('duena@cafe.com').expect(204);
    const token = emails.lastResetToken;
    await confirm(token).expect(204);
    expect((await confirm(token).expect(400)).body.code).toBe(
      'RESET_TOKEN_INVALID',
    );

    await backdateTokens();
    await requestReset('duena@cafe.com').expect(204);
    await prisma.passwordResetToken.updateMany({
      where: { consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await confirm(emails.lastResetToken).expect(400)).body.code).toBe(
      'RESET_TOKEN_INVALID',
    );
    await confirm('token-inventado').expect(400);
  });

  it('le saca el cambio obligatorio de contraseña', async () => {
    await prisma.staffUser.update({
      where: { email: 'duena@cafe.com' },
      data: { mustChangePassword: true },
    });
    await requestReset('duena@cafe.com').expect(204);
    await confirm(emails.lastResetToken).expect(204);

    const res = await login('duena@cafe.com', NEW_PASSWORD).expect(200);
    expect(res.body.user.mustChangePassword).toBe(false);
  });

  it('valida la contraseña nueva sin gastar el link', async () => {
    await requestReset('duena@cafe.com').expect(204);
    const short = await confirm(emails.lastResetToken, 'corta').expect(400);
    expect(short.body.code).toBe('VALIDATION_ERROR');
    await confirm(emails.lastResetToken).expect(204);
  });

  it('limita los pedidos por IP', async () => {
    for (let i = 0; i < 5; i++) {
      await requestReset(`nadie${i}@cafe.com`).expect(204);
    }
    await requestReset('duena@cafe.com').expect(429);
  });
});
