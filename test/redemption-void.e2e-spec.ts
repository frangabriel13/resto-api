import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createClub,
  joinClub,
  STAFF_PASSWORD,
  stampTokenFor,
  type ClubMember,
} from './helpers/club.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { LOCK_WAIT_MS, whileRowLocked } from './helpers/row-lock.js';
import { loginStaff } from './helpers/sessions.js';

describe('Anular canjes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let ana: ClubMember;
  let employee: string;
  let owner: string;

  beforeEach(async () => {
    const sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    cafe = await createClub(prisma, 'cafe', [
      ['empleado@cafe.com', 'EMPLOYEE'],
      ['duena@cafe.com', 'OWNER'],
    ]);
    ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafe.merchantId);
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
    owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const employeeId = () => cafe.staffIds['empleado@cafe.com']!;
  const stampData = (cycle: number) => ({
    merchantId: cafe.merchantId,
    membershipId: ana.membershipId,
    cycle,
    grantedByStaffId: employeeId(),
    source: 'QR_SCAN' as const,
    idempotencyKey: randomUUID(),
  });
  const giveStamps = (count: number, cycle = 1) =>
    prisma.stamp.createMany({
      data: Array.from({ length: count }, () => stampData(cycle)),
    });
  const redeem = async (expected = 201) => {
    const stampToken = await stampTokenFor(app, ana);
    const res = await request(app.getHttpServer())
      .post('/panel/redemptions')
      .set('Cookie', employee)
      .send({ stampToken, idempotencyKey: randomUUID() })
      .expect(expected);
    return res.body.redemption?.id as string;
  };
  const voidRedemption = (cookie: string, id: string) =>
    request(app.getHttpServer())
      .post(`/panel/redemptions/${id}/void`)
      .set('Cookie', cookie)
      .send({ reason: 'Se canjeó por error' });
  const detail = (cookie: string) =>
    request(app.getHttpServer())
      .get(`/panel/customers/${ana.membershipId}`)
      .set('Cookie', cookie)
      .expect(200);
  const setStatus = (status: MerchantStatus) =>
    prisma.merchant.update({
      where: { id: cafe.merchantId },
      data: { status },
    });

  it('el OWNER anula y la membresía vuelve al ciclo y la regla del canje', async () => {
    await giveStamps(9);
    await prisma.rewardRule.update({
      where: { id: cafe.ruleId },
      data: { active: false },
    });
    await prisma.rewardRule.create({
      data: {
        merchantId: cafe.merchantId,
        version: 2,
        stampsRequired: 5,
        rewardDescription: 'Medialuna',
        active: true,
      },
    });
    const id = await redeem();

    const res = await voidRedemption(owner, id).expect(200);

    expect(res.body).toMatchObject({
      redemption: { id, voidReason: 'Se canjeó por error' },
      membership: { cycle: 1, balance: 9, stampsRequired: 8, canRedeem: true },
    });
    expect(
      await prisma.membership.findUniqueOrThrow({
        where: { id: ana.membershipId },
      }),
    ).toMatchObject({ currentCycle: 1, currentCycleRewardRuleId: cafe.ruleId });
    expect(
      await prisma.redemption.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ voidedByStaffId: cafe.staffIds['duena@cafe.com'] });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'redemption.voided' },
    });
    expect(audit).toMatchObject({
      entityId: id,
      payload: { cycle: 1, reason: 'Se canjeó por error' },
    });
    await redeem();
  });

  it('el EMPLOYEE no anula canjes', async () => {
    await giveStamps(8);
    const id = await redeem();
    const res = await voidRedemption(employee, id).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('no anula dos veces ni un canje que no es el último', async () => {
    await giveStamps(8);
    const first = await redeem();
    await giveStamps(8, 2);
    const second = await redeem();

    const notLast = await voidRedemption(owner, first).expect(409);
    expect(notLast.body.code).toBe('REDEMPTION_NOT_LAST');
    await voidRedemption(owner, second).expect(200);
    const again = await voidRedemption(owner, second).expect(409);
    expect(again.body.code).toBe('REDEMPTION_ALREADY_VOIDED');
  });

  it('con sellos en el ciclo nuevo pide anularlos primero', async () => {
    await giveStamps(8);
    const id = await redeem();
    const stamp = await prisma.stamp.create({ data: stampData(2) });

    const blocked = await voidRedemption(owner, id).expect(409);
    expect(blocked.body).toMatchObject({
      code: 'NEW_CYCLE_HAS_STAMPS',
      details: { stamps: 1 },
    });

    await request(app.getHttpServer())
      .post(`/panel/stamps/${stamp.id}/void`)
      .set('Cookie', owner)
      .send({ reason: 'Para anular el canje' })
      .expect(200);
    await voidRedemption(owner, id).expect(200);
  });

  it('con el club finalizado no se anula; pausado sí', async () => {
    await giveStamps(8);
    const id = await redeem();

    await setStatus('ENDED');
    expect((await voidRedemption(owner, id).expect(409)).body.code).toBe(
      'MERCHANT_READ_ONLY',
    );
    await setStatus('PAUSED');
    await voidRedemption(owner, id).expect(200);
  });

  it('no encuentra canjes de otro comercio', async () => {
    const heladeria = await createClub(prisma, 'heladeria', [
      ['empleado@heladeria.com', 'EMPLOYEE'],
    ]);
    const customer = await prisma.customer.create({
      data: { name: 'Beto', phoneE164: '+5491145678901' },
    });
    const membership = await prisma.membership.create({
      data: {
        merchantId: heladeria.merchantId,
        customerId: customer.id,
        currentCycle: 2,
        currentCycleRewardRuleId: heladeria.ruleId,
      },
    });
    const other = await prisma.redemption.create({
      data: {
        merchantId: heladeria.merchantId,
        membershipId: membership.id,
        cycle: 1,
        rewardRuleId: heladeria.ruleId,
        stampsUsed: 8,
        carryOver: 0,
        confirmedByStaffId: heladeria.staffIds['empleado@heladeria.com']!,
        idempotencyKey: randomUUID(),
      },
    });

    await voidRedemption(owner, other.id).expect(404);
    await voidRedemption(owner, randomUUID()).expect(404);
    expect(
      (await prisma.redemption.findUniqueOrThrow({ where: { id: other.id } }))
        .voidedAt,
    ).toBeNull();
  });

  it('la ficha dice si el canje se puede anular', async () => {
    await giveStamps(8);
    await redeem();
    const canVoid = async (cookie: string) =>
      (await detail(cookie)).body.history.find(
        (entry: { type: string }) => entry.type === 'REDEMPTION',
      ).canVoid;

    expect(await canVoid(owner)).toBe(true);
    expect(await canVoid(employee)).toBe(false);
    await prisma.stamp.create({ data: stampData(2) });
    expect(await canVoid(owner)).toBe(false);
  });

  it('espera el bloqueo de la membresía antes de contar los sellos del ciclo nuevo', async () => {
    await giveStamps(8);
    const id = await redeem();
    let pending: Promise<request.Response> | undefined;

    await whileRowLocked('memberships', ana.membershipId, async (tx) => {
      pending = voidRedemption(owner, id).then((res) => res);
      await sleep(LOCK_WAIT_MS);
      // Un sello del ciclo nuevo que entra mientras la anulación espera.
      await tx.stamp.create({ data: stampData(2) });
    });

    const res = await pending!;
    expect(res.body.code).toBe('NEW_CYCLE_HAS_STAMPS');
  });
});
