import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { LOCK_WAIT_MS, whileRowLocked } from './helpers/row-lock.js';
import {
  createClub,
  expiredStampToken,
  joinClub,
  STAFF_PASSWORD,
  stampTokenFor,
  type ClubMember,
} from './helpers/club.js';
import { loginStaff } from './helpers/sessions.js';

const PASSWORD = STAFF_PASSWORD;

describe('Sellos por QR (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let sender: FakeOtpSender;
  let cafeId: string;
  let ana: ClubMember;
  let beto: ClubMember;
  let employee: string;

  beforeEach(async () => {
    sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    ({ merchantId: cafeId } = await createClub(prisma, 'cafe', [
      ['empleado@cafe.com', 'EMPLOYEE'],
      ['empleada2@cafe.com', 'EMPLOYEE'],
      ['duena@cafe.com', 'OWNER'],
    ]));
    const heladeria = await createClub(prisma, 'heladeria', [
      ['empleado@heladeria.com', 'EMPLOYEE'],
    ]);
    ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafeId);
    beto = await joinClub(
      app,
      sender,
      '11 4567-8901',
      'Beto',
      heladeria.merchantId,
    );
    employee = (await loginStaff(app, 'empleado@cafe.com', PASSWORD)).cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const tokenFor = (member: ClubMember) => stampTokenFor(app, member);
  const scan = (cookie: string, stampToken: string) =>
    request(app.getHttpServer())
      .post('/panel/scans')
      .set('Cookie', cookie)
      .send({ stampToken });
  const stamp = (
    cookie: string,
    stampToken: string,
    idempotencyKey: string = randomUUID(),
    cooldownOverride?: boolean,
  ) =>
    request(app.getHttpServer())
      .post('/panel/stamps')
      .set('Cookie', cookie)
      .send({ stampToken, idempotencyKey, cooldownOverride });

  describe('token del QR', () => {
    it('el cliente obtiene un token firmado que vence en dos minutos', async () => {
      const res = await request(app.getHttpServer())
        .get(`/me/memberships/${ana.membershipId}/stamp-token`)
        .set('Cookie', ana.cookie)
        .expect(200);

      expect(res.body.token).toMatch(
        new RegExp(`^v1\\.${ana.membershipId}\\.\\d+\\.`),
      );
      expect(res.body.refreshInSeconds).toBe(60);
      const ttl = new Date(res.body.expiresAt).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(110_000);
      expect(ttl).toBeLessThanOrEqual(120_000);
    });

    it('no da el token de la membresía de otro cliente', async () => {
      await request(app.getHttpServer())
        .get(`/me/memberships/${beto.membershipId}/stamp-token`)
        .set('Cookie', ana.cookie)
        .expect(404);
    });
  });

  describe('vista previa del escaneo', () => {
    it('muestra al cliente con el teléfono según el rol, el saldo y el cooldown', async () => {
      const token = await tokenFor(ana);

      const res = await scan(employee, token).expect(200);
      expect(res.body).toEqual({
        membership: {
          id: ana.membershipId,
          customer: { name: 'Ana', phone: '11 ••• 6789' },
          cycle: 1,
          balance: 0,
          stampsRequired: 8,
          remaining: 8,
          canRedeem: false,
          totalStamps: 0,
        },
        cooldown: { active: false, lastStampAt: null, retryAfterSeconds: 0 },
      });

      const owner = (await loginStaff(app, 'duena@cafe.com', PASSWORD)).cookie;
      const asOwner = await scan(owner, token).expect(200);
      expect(asOwner.body.membership.customer.phone).toBe('+5491123456789');
    });

    it('no suma sellos', async () => {
      await scan(employee, await tokenFor(ana)).expect(200);
      expect(await prisma.stamp.count()).toBe(0);
    });
  });

  describe('sumar un sello', () => {
    it('suma el sello, devuelve el saldo y lo audita', async () => {
      const res = await stamp(employee, await tokenFor(ana)).expect(201);

      expect(res.body).toMatchObject({
        stamp: { cycle: 1, source: 'QR_SCAN', cooldownOverride: false },
        membership: { id: ana.membershipId, balance: 1, remaining: 7 },
        replayed: false,
      });
      expect(
        await prisma.auditEvent.findMany({ where: { merchantId: cafeId } }),
      ).toMatchObject([
        {
          action: 'stamp.created',
          entityId: res.body.stamp.id,
          actorType: 'STAFF',
        },
      ]);
      const preview = await scan(employee, await tokenFor(ana)).expect(200);
      expect(preview.body.cooldown).toMatchObject({ active: true });
    });

    it('reintentar con la misma key devuelve el mismo sello, aunque el QR ya venció', async () => {
      const key = randomUUID();
      const first = await stamp(employee, await tokenFor(ana), key).expect(201);

      const retry = await stamp(
        employee,
        expiredStampToken(ana.membershipId),
        key,
      ).expect(201);

      expect(retry.body).toMatchObject({
        replayed: true,
        stamp: { id: first.body.stamp.id },
        membership: { balance: 1 },
      });
      expect(await prisma.stamp.count()).toBe(1);
    });

    it('la misma key para otro cliente da 409', async () => {
      const key = randomUUID();
      await stamp(employee, await tokenFor(ana), key).expect(201);
      const carla = await joinClub(
        app,
        sender,
        '11 3456-7890',
        'Carla',
        cafeId,
      );

      const res = await stamp(employee, await tokenFor(carla), key).expect(409);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('rechaza un QR vencido, adulterado o de otro comercio', async () => {
      const expired = await stamp(
        employee,
        expiredStampToken(ana.membershipId),
      ).expect(400);
      expect(expired.body.code).toBe('STAMP_TOKEN_EXPIRED');

      const token = await tokenFor(ana);
      const tampered = `${token.slice(0, -2)}xx`;
      for (const bad of ['basura', tampered]) {
        const res = await stamp(employee, bad).expect(400);
        expect(res.body.code).toBe('STAMP_TOKEN_INVALID');
      }

      const other = await stamp(employee, await tokenFor(beto)).expect(403);
      expect(other.body.code).toBe('CUSTOMER_OF_OTHER_MERCHANT');
      expect(await prisma.stamp.count()).toBe(0);
    });
  });

  describe('cooldown', () => {
    it('rechaza un segundo sello y, confirmado como otro consumo, lo suma y lo registra', async () => {
      await stamp(employee, await tokenFor(ana)).expect(201);
      const key = randomUUID();
      const token = await tokenFor(ana);

      const blocked = await stamp(employee, token, key).expect(409);
      expect(blocked.body.code).toBe('COOLDOWN_ACTIVE');
      expect(blocked.body.details.retryAfterSeconds).toBeGreaterThan(3500);

      const forced = await stamp(employee, token, key, true).expect(201);
      expect(forced.body).toMatchObject({
        stamp: { cooldownOverride: true },
        membership: { balance: 2 },
      });
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { entityId: forced.body.stamp.id },
      });
      expect(audit.payload).toMatchObject({ cooldownOverride: true });
    });

    it('el override fuera del cooldown no queda registrado como override', async () => {
      const res = await stamp(
        employee,
        await tokenFor(ana),
        randomUUID(),
        true,
      ).expect(201);
      expect(res.body.stamp.cooldownOverride).toBe(false);
    });

    it('dos empleados escaneando a la vez dejan un solo sello', async () => {
      const other = (await loginStaff(app, 'empleada2@cafe.com', PASSWORD))
        .cookie;
      const token = await tokenFor(ana);

      const results = await Promise.all([
        stamp(employee, token),
        stamp(other, token),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.code).toBe(
        'COOLDOWN_ACTIVE',
      );
      expect(await prisma.stamp.count()).toBe(1);
    });
  });

  it('espera el bloqueo de la membresía antes de chequear el cooldown', async () => {
    const token = await tokenFor(ana);
    const staff = await prisma.staffUser.findUniqueOrThrow({
      where: { email: 'empleada2@cafe.com' },
    });
    let pending: Promise<request.Response> | undefined;

    await whileRowLocked('memberships', ana.membershipId, async (tx) => {
      pending = stamp(employee, token).then((res) => res);
      await sleep(LOCK_WAIT_MS);
      await tx.stamp.create({
        data: {
          merchantId: cafeId,
          membershipId: ana.membershipId,
          cycle: 1,
          grantedByStaffId: staff.id,
          source: 'QR_SCAN',
          idempotencyKey: randomUUID(),
        },
      });
    });

    const res = await pending!;
    expect(res.body.code).toBe('COOLDOWN_ACTIVE');
    expect(await prisma.stamp.count()).toBe(1);
  });

  describe('estado del club y de la membresía', () => {
    it('con el club pausado se puede consultar pero no sumar', async () => {
      await prisma.merchant.update({
        where: { id: cafeId },
        data: { status: 'PAUSED' },
      });
      const token = await tokenFor(ana);

      await scan(employee, token).expect(200);
      const res = await stamp(employee, token).expect(409);
      expect(res.body.code).toBe('MERCHANT_READ_ONLY');
    });

    it('a un cliente que salió del club no se le suman sellos', async () => {
      const token = await tokenFor(ana);
      await prisma.membership.update({
        where: { id: ana.membershipId },
        data: { leftAt: new Date() },
      });

      expect((await scan(employee, token).expect(409)).body.code).toBe(
        'MEMBERSHIP_LEFT',
      );
      expect((await stamp(employee, token).expect(409)).body.code).toBe(
        'MEMBERSHIP_LEFT',
      );
    });
  });
});
