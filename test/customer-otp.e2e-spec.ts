import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { sessionCookie } from './helpers/sessions.js';

const PHONE = '+5491123456789';
const MINUTE = 60_000;

describe('Cliente: código por teléfono (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let sender: FakeOtpSender;

  // Una app por test: los límites por IP se cuentan en memoria.
  beforeEach(async () => {
    sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);
  });

  afterEach(async () => {
    await app.close();
  });

  const requestCode = (phone = '11 2345-6789') =>
    request(app.getHttpServer())
      .post('/auth/customer/otp/request')
      .send({ phone });
  const verify = (body: { code: string; name?: string; phone?: string }) =>
    request(app.getHttpServer())
      .post('/auth/customer/otp/verify')
      .send({ phone: '011 15 2345-6789', ...body });
  // Simula que pasó el tiempo desde los pedidos anteriores.
  const ageChallenges = (ms: number) =>
    prisma.$executeRaw`UPDATE otp_challenges SET created_at = created_at - ${ms} * interval '1 millisecond'`;

  it('alta: pide el código, lo verifica con el nombre y queda con sesión', async () => {
    const requested = await requestCode().expect(200);
    expect(requested.body).toEqual({
      expiresInSeconds: 600,
      resendInSeconds: 60,
    });
    expect(sender.sent).toEqual([
      { phone: PHONE, code: expect.stringMatching(/^\d{6}$/) },
    ]);

    const res = await verify({ code: sender.lastCode, name: ' Ana ' }).expect(
      200,
    );

    expect(res.body).toMatchObject({ customer: { name: 'Ana' }, isNew: true });
    expect(sessionCookie(res, 'fs_customer')).toBeTruthy();
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { phoneE164: PHONE },
    });
    expect(customer.id).toBe(res.body.customer.id);
    expect(customer.phoneVerifiedAt).not.toBeNull();
  });

  it('recuperación: el mismo teléfono entra a la misma cuenta, que conserva su nombre', async () => {
    const existing = await prisma.customer.create({
      data: { name: 'Ana', phoneE164: PHONE },
    });
    const newPhone = await requestCode('11 4567-8901').expect(200);
    await ageChallenges(MINUTE);
    const knownPhone = await requestCode().expect(200);
    expect(knownPhone.body).toEqual(newPhone.body);

    const res = await verify({ code: sender.lastCode, name: 'Otro' }).expect(
      200,
    );

    expect(res.body).toEqual({
      customer: { id: existing.id, name: 'Ana' },
      isNew: false,
    });
  });

  it('sin cuenta y sin nombre pide el nombre, sin gastar el código', async () => {
    await requestCode();

    const res = await verify({ code: sender.lastCode }).expect(400);
    expect(res.body.code).toBe('NAME_REQUIRED');

    await verify({ code: sender.lastCode, name: 'Ana' }).expect(200);
  });

  it('cada código incorrecto descuenta un intento hasta bloquear el código', async () => {
    await requestCode();
    const wrong = sender.lastCode === '000000' ? '111111' : '000000';

    for (const remaining of [4, 3, 2, 1, 0]) {
      const res = await verify({ code: wrong }).expect(400);
      expect(res.body).toMatchObject({
        code: 'OTP_INVALID',
        details: { remainingAttempts: remaining },
      });
    }
    const blocked = await verify({ code: sender.lastCode }).expect(429);
    expect(blocked.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('intentos simultáneos no superan el máximo', async () => {
    await requestCode();
    const wrong = sender.lastCode === '000000' ? '111111' : '000000';

    const results = await Promise.all(
      Array.from({ length: 8 }, () => verify({ code: wrong })),
    );

    const codes = results.map((r) => r.body.code);
    expect(codes.filter((c) => c === 'OTP_INVALID')).toHaveLength(5);
    expect(codes.filter((c) => c === 'OTP_TOO_MANY_ATTEMPTS')).toHaveLength(3);
    const challenge = await prisma.otpChallenge.findFirstOrThrow();
    expect(challenge.attempts).toBe(5);
  });

  it('un código vencido o ya usado no sirve', async () => {
    await requestCode();
    await prisma.otpChallenge.updateMany({
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const expired = await verify({ code: sender.lastCode, name: 'Ana' }).expect(
      400,
    );
    expect(expired.body.code).toBe('OTP_EXPIRED');

    await ageChallenges(MINUTE);
    await requestCode();
    await verify({ code: sender.lastCode, name: 'Ana' }).expect(200);
    const reused = await verify({ code: sender.lastCode }).expect(400);
    expect(reused.body.code).toBe('OTP_EXPIRED');
  });

  it('pedir un código nuevo invalida el anterior', async () => {
    await requestCode();
    const first = sender.lastCode;
    await ageChallenges(MINUTE);
    await requestCode();
    const second = sender.lastCode;

    if (first !== second) {
      const res = await verify({ code: first, name: 'Ana' }).expect(400);
      expect(res.body.code).toBe('OTP_INVALID');
    }
    await verify({ code: second, name: 'Ana' }).expect(200);
  });

  it('limita los pedidos por teléfono', async () => {
    await requestCode().expect(200);
    const tooSoon = await requestCode().expect(429);
    expect(tooSoon.body.code).toBe('OTP_RESEND_TOO_SOON');
    expect(tooSoon.body.details.retryAfterSeconds).toBeGreaterThan(55);

    await prisma.otpChallenge.createMany({
      data: [10, 20, 30, 40].map((minutesAgo) => ({
        phoneE164: PHONE,
        codeHash: 'x',
        expiresAt: new Date(),
        createdAt: new Date(Date.now() - minutesAgo * MINUTE),
      })),
    });
    await ageChallenges(MINUTE);
    const limited = await requestCode().expect(429);
    expect(limited.body.code).toBe('OTP_LIMIT_REACHED');
    expect(sender.sent).toHaveLength(1);
  });

  it('si el último código ya se usó, se puede pedir otro sin esperar', async () => {
    await requestCode();
    await verify({ code: sender.lastCode, name: 'Ana' }).expect(200);

    await requestCode().expect(200);
    expect(sender.sent).toHaveLength(2);
  });

  it('el límite por hora cuenta también los códigos ya usados', async () => {
    await prisma.otpChallenge.createMany({
      data: [10, 20, 30, 40, 50].map((minutesAgo) => ({
        phoneE164: PHONE,
        codeHash: 'x',
        expiresAt: new Date(),
        createdAt: new Date(Date.now() - minutesAgo * MINUTE),
        consumedAt: new Date(Date.now() - minutesAgo * MINUTE),
      })),
    });

    const res = await requestCode().expect(429);
    expect(res.body.code).toBe('OTP_LIMIT_REACHED');
  });

  it('rechaza teléfonos que no son celulares argentinos', async () => {
    for (const phone of ['123', '+34 612 345 678', 'abc']) {
      const res = await requestCode(phone).expect(400);
      expect(res.body.details.issues[0].path).toBe('phone');
    }
    expect(sender.sent).toHaveLength(0);
  });
});
