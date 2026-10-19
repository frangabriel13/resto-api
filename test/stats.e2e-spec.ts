import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import {
  createClub,
  joinClub,
  STAFF_PASSWORD,
  type ClubMember,
} from './helpers/club.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { loginStaff } from './helpers/sessions.js';

const at = (iso: string) => new Date(iso);

describe('Panel: estadísticas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let ana: ClubMember;
  let beto: ClubMember;
  let clara: ClubMember;
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

    cafe = await createClub(prisma, 'cafe', [
      ['empleado@cafe.com', 'EMPLOYEE'],
      ['duena@cafe.com', 'OWNER'],
    ]);
    const join = (phone: string, name: string) =>
      joinClub(app, sender, phone, name, cafe.merchantId);
    ana = await join('11 2345-6789', 'Ana');
    beto = await join('11 4567-8901', 'Beto');
    clara = await join('11 3456-7890', 'Clara');
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
    owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const voided = (when: string) => ({
    voidedAt: at(when),
    voidedByStaffId: cafe.staffIds['duena@cafe.com']!,
    voidReason: 'Error',
  });
  const stamp = (member: ClubMember, createdAt: string, extra = {}) =>
    prisma.stamp.create({
      data: {
        merchantId: cafe.merchantId,
        membershipId: member.membershipId,
        cycle: 1,
        grantedByStaffId: cafe.staffIds['empleado@cafe.com']!,
        source: 'QR_SCAN',
        idempotencyKey: randomUUID(),
        createdAt: at(createdAt),
        ...extra,
      },
    });
  const redemption = (member: ClubMember, createdAt: string, extra = {}) =>
    prisma.redemption.create({
      data: {
        merchantId: cafe.merchantId,
        membershipId: member.membershipId,
        cycle: 1,
        rewardRuleId: cafe.ruleId,
        stampsUsed: 8,
        carryOver: 0,
        confirmedByStaffId: cafe.staffIds['empleado@cafe.com']!,
        idempotencyKey: randomUUID(),
        createdAt: at(createdAt),
        ...extra,
      },
    });
  const updateMembership = (member: ClubMember, data: object) =>
    prisma.membership.update({ where: { id: member.membershipId }, data });
  const stats = (cookie: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get('/panel/stats')
      .query(query)
      .set('Cookie', cookie);

  it('cuenta el club y lo que pasó en el período, día por día', async () => {
    // Ana: un sello en cada ciclo, con un canje en el medio.
    await updateMembership(ana, {
      joinedAt: at('2026-10-05T15:00:00Z'),
      currentCycle: 2,
    });
    await stamp(ana, '2026-10-06T12:00:00Z', { source: 'MANUAL' });
    await redemption(ana, '2026-10-06T13:00:00Z');
    await stamp(ana, '2026-10-07T12:00:00Z', {
      cycle: 2,
      cooldownOverride: true,
    });
    // Beto: se unió a las 23:30 del 9 (hora AR), con consentimiento.
    await updateMembership(beto, {
      joinedAt: at('2026-10-10T02:30:00Z'),
      marketingConsent: true,
      marketingConsentAt: at('2026-10-10T02:30:00Z'),
    });
    await stamp(beto, '2026-10-08T12:00:00Z');
    // Sello de antes del período, anulado dentro.
    await stamp(beto, '2026-09-30T12:00:00Z', voided('2026-10-08T13:00:00Z'));
    // Sello del período, anulado después.
    await stamp(beto, '2026-10-09T12:00:00Z', voided('2026-10-12T12:00:00Z'));
    // Clara: salió del club; su canje anulado cuenta igual en el período.
    await updateMembership(clara, {
      joinedAt: at('2026-09-01T12:00:00Z'),
      leftAt: at('2026-10-11T12:00:00Z'),
    });
    for (const day of ['02', '03', '04']) {
      await stamp(clara, `2026-09-${day}T12:00:00Z`);
    }
    await redemption(
      clara,
      '2026-09-15T12:00:00Z',
      voided('2026-10-10T12:00:00Z'),
    );

    const res = await stats(owner, {
      from: '2026-10-05',
      to: '2026-10-10',
    }).expect(200);

    expect(res.body).toEqual({
      range: { from: '2026-10-05', to: '2026-10-10' },
      members: { active: 2, returning: 1, marketingConsent: 1 },
      period: {
        joined: 2,
        stamps: 3,
        manualStamps: 1,
        cooldownOverrides: 1,
        redemptions: 1,
        voidedStamps: 1,
        voidedRedemptions: 1,
      },
      daily: [
        { day: '2026-10-05', joined: 1, stamps: 0, redemptions: 0 },
        { day: '2026-10-06', joined: 0, stamps: 1, redemptions: 1 },
        { day: '2026-10-07', joined: 0, stamps: 1, redemptions: 0 },
        { day: '2026-10-08', joined: 0, stamps: 1, redemptions: 0 },
        { day: '2026-10-09', joined: 1, stamps: 0, redemptions: 0 },
        { day: '2026-10-10', joined: 0, stamps: 0, redemptions: 0 },
      ],
    });
  });

  it('sin fechas toma los últimos 30 días hasta hoy, también para el EMPLOYEE', async () => {
    const res = await stats(employee).expect(200);

    expect(res.body.daily).toHaveLength(30);
    expect(res.body.range.to).toBe(res.body.daily.at(-1).day);
    // Los tres se unieron recién.
    expect(res.body.daily.at(-1).joined).toBe(3);
    expect(res.body.period.joined).toBe(3);
  });

  it('valida el rango', async () => {
    const res = await stats(owner, { from: '2026-10-11', to: '2026-10-10' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_DATE_RANGE');
  });
});
