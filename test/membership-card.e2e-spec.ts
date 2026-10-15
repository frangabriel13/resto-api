import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { loginCustomer } from './helpers/sessions.js';

const HOUR = 60 * 60 * 1000;

describe('Cliente: tarjeta (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sender: FakeOtpSender;
  let merchantId: string;
  let ruleV1: string;
  let staffId: string;

  beforeEach(async () => {
    sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const merchant = await prisma.merchant.create({
      data: {
        name: 'Café',
        slug: 'cafe',
        status: 'ACTIVE',
        googleReviewUrl: 'https://g.page/r/cafe',
      },
    });
    merchantId = merchant.id;
    ruleV1 = (
      await prisma.rewardRule.create({
        data: {
          merchantId,
          version: 1,
          stampsRequired: 8,
          rewardDescription: 'Café gratis',
          conditions: 'Lunes a viernes',
          active: true,
        },
      })
    ).id;
    staffId = (
      await prisma.staffUser.create({
        data: {
          email: 'empleado@cafe.com',
          name: 'Empleado',
          passwordHash: 'x',
          memberships: { create: { merchantId, role: 'EMPLOYEE' } },
        },
      })
    ).id;
  });

  afterEach(async () => {
    await app.close();
  });

  const joinAs = async (phone: string, name: string) => {
    const { cookie } = await loginCustomer(app, sender, phone, name);
    const res = await request(app.getHttpServer())
      .post('/me/memberships')
      .set('Cookie', cookie)
      .send({ merchantId })
      .expect(200);
    return { cookie, membershipId: res.body.membership.id as string };
  };
  const card = (cookie: string, id: string) =>
    request(app.getHttpServer())
      .get(`/me/memberships/${id}`)
      .set('Cookie', cookie);
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR);
  const stamp = (
    membershipId: string,
    cycle: number,
    hoursAgo: number,
    voided = false,
  ) => ({
    merchantId,
    membershipId,
    cycle,
    grantedByStaffId: staffId,
    source: 'QR_SCAN' as const,
    idempotencyKey: randomUUID(),
    createdAt: at(hoursAgo),
    ...(voided && { voidedAt: at(hoursAgo - 0.1), voidedByStaffId: staffId }),
  });

  it('muestra saldo, regla del ciclo, regla siguiente e historial', async () => {
    const ana = await joinAs('11 2345-6789', 'Ana');
    const id = ana.membershipId;
    // 9 sellos en el ciclo 1, canje (sobra 1) y un sello válido y otro anulado en el 2.
    await prisma.stamp.createMany({
      data: Array.from({ length: 9 }, (_, i) => stamp(id, 1, 100 - i)),
    });
    const redemption = await prisma.redemption.create({
      data: {
        merchantId,
        membershipId: id,
        cycle: 1,
        rewardRuleId: ruleV1,
        stampsUsed: 8,
        carryOver: 1,
        confirmedByStaffId: staffId,
        idempotencyKey: randomUUID(),
        createdAt: at(50),
      },
    });
    await prisma.stamp.createMany({
      data: [stamp(id, 2, 10), stamp(id, 2, 5, true)],
    });
    await prisma.membership.update({
      where: { id },
      data: { currentCycle: 2 },
    });
    await prisma.rewardRule.update({
      where: { id: ruleV1 },
      data: { active: false },
    });
    await prisma.rewardRule.create({
      data: {
        merchantId,
        version: 2,
        stampsRequired: 10,
        rewardDescription: 'Medialunas',
        active: true,
      },
    });
    const stampsBefore = await prisma.stamp.count();

    const res = await card(ana.cookie, id).expect(200);

    expect(res.body).toMatchObject({
      id,
      merchant: {
        name: 'Café',
        googleReviewUrl: 'https://g.page/r/cafe',
        status: 'ACTIVE',
      },
      cycleRule: {
        stampsRequired: 8,
        rewardDescription: 'Café gratis',
        conditions: 'Lunes a viernes',
      },
      nextCycleRule: { stampsRequired: 10, rewardDescription: 'Medialunas' },
      cycle: 2,
      cycleStamps: 1,
      carryOver: 1,
      balance: 2,
      remaining: 6,
      canRedeem: false,
      totalStamps: 10,
    });
    const history = res.body.history;
    expect(history).toHaveLength(12);
    expect(history.slice(0, 3)).toMatchObject([
      { type: 'STAMP', cycle: 2, voided: true },
      { type: 'STAMP', cycle: 2, voided: false },
      {
        type: 'REDEMPTION',
        id: redemption.id,
        cycle: 1,
        rewardDescription: 'Café gratis',
      },
    ]);
    expect(await prisma.stamp.count()).toBe(stampsBefore);
  });

  it('sin cambios de regla no muestra regla siguiente', async () => {
    const ana = await joinAs('11 2345-6789', 'Ana');
    const res = await card(ana.cookie, ana.membershipId).expect(200);
    expect(res.body).toMatchObject({
      nextCycleRule: null,
      balance: 0,
      history: [],
    });
  });

  it('no muestra la tarjeta de otro cliente ni la de un club que dejó', async () => {
    const ana = await joinAs('11 2345-6789', 'Ana');
    const beto = await joinAs('11 4567-8901', 'Beto');

    await card(ana.cookie, beto.membershipId).expect(404);
    await card(ana.cookie, randomUUID()).expect(404);
    await prisma.membership.update({
      where: { id: ana.membershipId },
      data: { leftAt: new Date() },
    });
    await card(ana.cookie, ana.membershipId).expect(404);
  });
});
