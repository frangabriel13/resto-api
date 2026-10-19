import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
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
import { loginStaff } from './helpers/sessions.js';

// El circuito del hito 6 por la API: sellos con el QR de la tarjeta, canje y
// ciclo nuevo, visto desde el panel y desde la tarjeta del cliente.
describe('Hito 6: sellos, canje y ciclo nuevo (e2e)', () => {
  let app: INestApplication<App>;
  let ana: ClubMember;
  let employee: string;

  beforeEach(async () => {
    const sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    const prisma = moduleRef.get(PrismaService);

    const cafe = await createClub(prisma, 'cafe', [
      ['empleado@cafe.com', 'EMPLOYEE'],
    ]);
    // Sin cooldown, para sumar varios sellos seguidos.
    await prisma.merchant.update({
      where: { id: cafe.merchantId },
      data: { stampCooldownMinutes: 0 },
    });
    ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafe.merchantId);
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const scanAnd = async (path: string, status: number) => {
    const stampToken = await stampTokenFor(app, ana);
    return request(app.getHttpServer())
      .post(path)
      .set('Cookie', employee)
      .send({ stampToken, idempotencyKey: randomUUID() })
      .expect(status);
  };
  const card = async () =>
    (
      await request(app.getHttpServer())
        .get(`/me/memberships/${ana.membershipId}`)
        .set('Cookie', ana.cookie)
        .expect(200)
    ).body;

  it('nueve consumos, canje del premio y el sobrante en el ciclo nuevo', async () => {
    for (let i = 0; i < 9; i++) {
      await scanAnd('/panel/stamps', 201);
    }
    expect(await card()).toMatchObject({
      cycle: 1,
      balance: 9,
      remaining: 0,
      canRedeem: true,
    });

    const preview = await scanAnd('/panel/scans', 200);
    expect(preview.body.membership.canRedeem).toBe(true);

    const redeemed = await scanAnd('/panel/redemptions', 201);
    expect(redeemed.body).toMatchObject({
      redemption: { cycle: 1, stampsUsed: 8, carryOver: 1 },
      membership: { cycle: 2, balance: 1, remaining: 7, canRedeem: false },
    });

    const after = await card();
    expect(after).toMatchObject({
      cycle: 2,
      cycleStamps: 0,
      carryOver: 1,
      balance: 1,
      remaining: 7,
      canRedeem: false,
      totalStamps: 9,
    });
    expect(after.history).toHaveLength(10);
    expect(after.history[0]).toMatchObject({
      type: 'REDEMPTION',
      cycle: 1,
      voided: false,
      rewardDescription: 'Premio',
    });

    await scanAnd('/panel/stamps', 201);
    expect(await card()).toMatchObject({
      cycle: 2,
      cycleStamps: 1,
      balance: 2,
      totalStamps: 10,
    });
  });
});
