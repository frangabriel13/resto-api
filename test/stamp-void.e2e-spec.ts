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
  joinClub,
  STAFF_PASSWORD,
  stampTokenFor,
  type ClubMember,
} from './helpers/club.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { LOCK_WAIT_MS, whileRowLocked } from './helpers/row-lock.js';
import { loginStaff } from './helpers/sessions.js';

const MINUTE = 60_000;

describe('Anular sellos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cafeId: string;
  let staffIds: Record<string, string>;
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
    prisma = moduleRef.get(PrismaAdminService);

    ({ merchantId: cafeId, staffIds } = await createClub(prisma, 'cafe', [
      ['empleado@cafe.com', 'EMPLOYEE'],
      ['empleada2@cafe.com', 'EMPLOYEE'],
      ['duena@cafe.com', 'OWNER'],
    ]));
    ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafeId);
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
    owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const stampByQr = async (cookie = employee) => {
    const stampToken = await stampTokenFor(app, ana);
    const res = await request(app.getHttpServer())
      .post('/panel/stamps')
      .set('Cookie', cookie)
      .send({ stampToken, idempotencyKey: randomUUID() })
      .expect(201);
    return res.body.stamp.id as string;
  };
  const insertStamp = (grantedBy: string, minutesAgo: number, cycle = 1) =>
    prisma.stamp.create({
      data: {
        merchantId: cafeId,
        membershipId: ana.membershipId,
        cycle,
        grantedByStaffId: staffIds[grantedBy]!,
        source: 'QR_SCAN',
        idempotencyKey: randomUUID(),
        createdAt: new Date(Date.now() - minutesAgo * MINUTE),
      },
    });
  const voidStamp = (
    cookie: string,
    id: string,
    reason = 'Me equivoqué de cliente',
  ) =>
    request(app.getHttpServer())
      .post(`/panel/stamps/${id}/void`)
      .set('Cookie', cookie)
      .send({ reason });
  const setStatus = (status: MerchantStatus) =>
    prisma.merchant.update({ where: { id: cafeId }, data: { status } });

  it('el EMPLOYEE anula su propio sello recién dado y se libera el cooldown', async () => {
    const id = await stampByQr();

    const res = await voidStamp(employee, id).expect(200);

    expect(res.body).toMatchObject({
      stamp: { id, voidReason: 'Me equivoqué de cliente' },
      membership: { balance: 0, totalStamps: 0 },
    });
    const stamp = await prisma.stamp.findUniqueOrThrow({ where: { id } });
    expect(stamp).toMatchObject({
      voidedByStaffId: staffIds['empleado@cafe.com'],
      voidReason: 'Me equivoqué de cliente',
    });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'stamp.voided' },
    });
    expect(audit).toMatchObject({
      entityId: id,
      payload: { reason: 'Me equivoqué de cliente' },
    });
    await stampByQr();
  });

  it('el EMPLOYEE no anula pasados los 5 minutos ni un sello de otro', async () => {
    const old = await insertStamp('empleado@cafe.com', 6);
    const others = await insertStamp('empleada2@cafe.com', 1);

    for (const id of [old.id, others.id]) {
      const res = await voidStamp(employee, id).expect(403);
      expect(res.body.code).toBe('VOID_NOT_ALLOWED');
    }
  });

  it('el OWNER anula cualquier sello, sin límite de tiempo', async () => {
    const old = await insertStamp('empleado@cafe.com', 60 * 24 * 10);
    await voidStamp(owner, old.id).expect(200);
  });

  it('no se anula un sello de un ciclo canjeado ni uno ya anulado', async () => {
    const redeemed = await insertStamp('empleado@cafe.com', 60);
    const current = await insertStamp('empleado@cafe.com', 30, 2);
    await prisma.membership.update({
      where: { id: ana.membershipId },
      data: { currentCycle: 2 },
    });

    const closed = await voidStamp(owner, redeemed.id).expect(409);
    expect(closed.body.code).toBe('STAMP_IN_REDEEMED_CYCLE');
    await voidStamp(owner, current.id).expect(200);
    const again = await voidStamp(owner, current.id).expect(409);
    expect(again.body.code).toBe('STAMP_ALREADY_VOIDED');
  });

  it('pide el motivo y no encuentra sellos inexistentes', async () => {
    const id = await stampByQr();
    expect((await voidStamp(employee, id, '').expect(400)).body.code).toBe(
      'VALIDATION_ERROR',
    );
    await voidStamp(employee, randomUUID()).expect(404);
  });

  it('con el club finalizado no se anula; pausado sí', async () => {
    const stamp = await insertStamp('empleado@cafe.com', 10);

    await setStatus('ENDED');
    expect((await voidStamp(owner, stamp.id).expect(409)).body.code).toBe(
      'MERCHANT_READ_ONLY',
    );
    await setStatus('PAUSED');
    await voidStamp(owner, stamp.id).expect(200);
  });

  it('espera el bloqueo de la membresía antes de validar el ciclo', async () => {
    const stamp = await insertStamp('empleado@cafe.com', 10);
    let pending: Promise<request.Response> | undefined;

    await whileRowLocked('memberships', ana.membershipId, async (tx) => {
      pending = voidStamp(owner, stamp.id).then((res) => res);
      await sleep(LOCK_WAIT_MS);
      // Un canje que cierra el ciclo mientras la anulación espera.
      await tx.membership.update({
        where: { id: ana.membershipId },
        data: { currentCycle: 2 },
      });
    });

    const res = await pending!;
    expect(res.body.code).toBe('STAMP_IN_REDEEMED_CYCLE');
  });
});
