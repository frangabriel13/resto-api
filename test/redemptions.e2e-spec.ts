import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import {
  createClub,
  expiredStampToken,
  joinClub,
  STAFF_PASSWORD,
  stampTokenFor,
  type ClubMember,
} from './helpers/club.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { LOCK_WAIT_MS, whileRowLocked } from './helpers/row-lock.js';
import { loginStaff } from './helpers/sessions.js';

describe('Canjes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let ana: ClubMember;
  let beto: ClubMember;
  let anaHeladeria: ClubMember;
  let employee: string;

  beforeEach(async () => {
    const sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    cafe = await createClub(prisma, 'cafe', [
      ['empleado@cafe.com', 'EMPLOYEE'],
      ['empleada2@cafe.com', 'EMPLOYEE'],
    ]);
    const heladeria = await createClub(prisma, 'heladeria', []);
    ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafe.merchantId);
    beto = await joinClub(app, sender, '11 4567-8901', 'Beto', cafe.merchantId);
    anaHeladeria = await joinClub(
      app,
      sender,
      '11 2345-6789',
      'Ana',
      heladeria.merchantId,
    );
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const giveStamps = (member: ClubMember, count: number) =>
    prisma.stamp.createMany({
      data: Array.from({ length: count }, () => ({
        merchantId: cafe.merchantId,
        membershipId: member.membershipId,
        cycle: 1,
        grantedByStaffId: cafe.staffIds['empleado@cafe.com']!,
        source: 'QR_SCAN' as const,
        idempotencyKey: randomUUID(),
      })),
    });
  const redeemWith = (
    stampToken: string,
    idempotencyKey: string = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post('/panel/redemptions')
      .set('Cookie', employee)
      .send({ stampToken, idempotencyKey });
  const redeem = async (
    member: ClubMember,
    status: number,
    idempotencyKey?: string,
  ) =>
    redeemWith(await stampTokenFor(app, member), idempotencyKey).expect(status);
  const setStatus = (status: MerchantStatus) =>
    prisma.merchant.update({
      where: { id: cafe.merchantId },
      data: { status },
    });
  const membershipOf = (member: ClubMember) =>
    prisma.membership.findUniqueOrThrow({ where: { id: member.membershipId } });

  it('canjea, pasa el sobrante al ciclo nuevo y lo ata a la regla vigente', async () => {
    await giveStamps(ana, 9);
    await prisma.rewardRule.update({
      where: { id: cafe.ruleId },
      data: { active: false },
    });
    const newRule = await prisma.rewardRule.create({
      data: {
        merchantId: cafe.merchantId,
        version: 2,
        stampsRequired: 5,
        rewardDescription: 'Medialuna',
        active: true,
      },
    });

    const res = await redeem(ana, 201);

    expect(res.body).toMatchObject({
      redemption: {
        cycle: 1,
        stampsUsed: 8,
        carryOver: 1,
        rewardDescription: 'Premio',
      },
      membership: { cycle: 2, balance: 1, stampsRequired: 5, remaining: 4 },
      replayed: false,
    });
    expect(await membershipOf(ana)).toMatchObject({
      currentCycle: 2,
      currentCycleRewardRuleId: newRule.id,
    });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'redemption.created' },
    });
    expect(audit).toMatchObject({
      entityId: res.body.redemption.id,
      actorId: cafe.staffIds['empleado@cafe.com'],
      payload: { cycle: 1, stampsUsed: 8, carryOver: 1 },
    });
  });

  it('rechaza el canje si el saldo no alcanza (los anulados no cuentan)', async () => {
    await giveStamps(ana, 8);
    const stamp = await prisma.stamp.findFirstOrThrow();
    await prisma.stamp.update({
      where: { id: stamp.id },
      data: {
        voidedAt: new Date(),
        voidedByStaffId: cafe.staffIds['empleado@cafe.com']!,
        voidReason: 'Error',
      },
    });

    const res = await redeem(ana, 409);

    expect(res.body).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      details: { balance: 7, stampsRequired: 8 },
    });
    expect(await prisma.redemption.count()).toBe(0);
    expect((await membershipOf(ana)).currentCycle).toBe(1);
  });

  it('un reintento con la misma key devuelve el mismo canje', async () => {
    await giveStamps(ana, 8);
    await giveStamps(beto, 8);
    const key = randomUUID();

    const first = await redeem(ana, 201, key);
    const retry = await redeem(ana, 201, key);

    expect(retry.body.replayed).toBe(true);
    expect(retry.body.redemption.id).toBe(first.body.redemption.id);
    expect(retry.body.membership.cycle).toBe(2);
    expect(await prisma.redemption.count()).toBe(1);

    const reused = await redeem(beto, 409, key);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('exige un QR válido, vigente y del propio comercio', async () => {
    await giveStamps(ana, 8);

    const invalid = await redeemWith('v1.no-es-un-token').expect(400);
    expect(invalid.body.code).toBe('STAMP_TOKEN_INVALID');
    const expired = await redeemWith(
      expiredStampToken(ana.membershipId),
    ).expect(400);
    expect(expired.body.code).toBe('STAMP_TOKEN_EXPIRED');
    const other = await redeem(anaHeladeria, 403);
    expect(other.body.code).toBe('CUSTOMER_OF_OTHER_MERCHANT');
    expect(await prisma.redemption.count()).toBe(0);
  });

  it('no se canjea buscando al cliente, sin QR', async () => {
    await giveStamps(ana, 8);
    const res = await request(app.getHttpServer())
      .post('/panel/redemptions')
      .set('Cookie', employee)
      .send({ membershipId: ana.membershipId, idempotencyKey: randomUUID() })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('con el club pausado se canjea; finalizado, no', async () => {
    await giveStamps(ana, 8);
    await giveStamps(beto, 8);

    await setStatus('PAUSED');
    await redeem(ana, 201);
    await setStatus('ENDED');
    const ended = await redeem(beto, 409);
    expect(ended.body.code).toBe('MERCHANT_READ_ONLY');
  });

  it('no canjea a un cliente que salió del club', async () => {
    await giveStamps(ana, 8);
    const stampToken = await stampTokenFor(app, ana);
    await prisma.membership.update({
      where: { id: ana.membershipId },
      data: { leftAt: new Date() },
    });

    const res = await redeemWith(stampToken).expect(409);
    expect(res.body.code).toBe('MEMBERSHIP_LEFT');
  });

  // Prueba de humo: el bloqueo lo cubre el test determinista de abajo.
  it('dos empleados canjeando la misma tarjeta a la vez dejan un solo canje', async () => {
    await giveStamps(ana, 8);
    const other = (await loginStaff(app, 'empleada2@cafe.com', STAFF_PASSWORD))
      .cookie;
    const stampToken = await stampTokenFor(app, ana);
    const redeemAs = (cookie: string) =>
      request(app.getHttpServer())
        .post('/panel/redemptions')
        .set('Cookie', cookie)
        .send({ stampToken, idempotencyKey: randomUUID() });

    const results = await Promise.all([redeemAs(employee), redeemAs(other)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe(
      'INSUFFICIENT_BALANCE',
    );
    expect(await prisma.redemption.count()).toBe(1);
  });

  it('espera el bloqueo de la membresía antes de calcular el saldo', async () => {
    await giveStamps(ana, 8);
    const stampToken = await stampTokenFor(app, ana);
    const stamp = await prisma.stamp.findFirstOrThrow();
    let pending: Promise<request.Response> | undefined;

    await whileRowLocked('memberships', ana.membershipId, async (tx) => {
      pending = redeemWith(stampToken).then((res) => res);
      await sleep(LOCK_WAIT_MS);
      // Una anulación que baja el saldo mientras el canje espera.
      await tx.stamp.update({
        where: { id: stamp.id },
        data: {
          voidedAt: new Date(),
          voidedByStaffId: cafe.staffIds['empleado@cafe.com']!,
          voidReason: 'Error',
        },
      });
    });

    const res = await pending!;
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });
});
