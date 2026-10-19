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

const DAY = '2026-10-10';
const at = (iso: string) => new Date(iso);

describe('Panel: actividad (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
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
    prisma = moduleRef.get(PrismaAdminService);

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

  const staffId = (email: string) => cafe.staffIds[email]!;
  const voidedBy = (when: Date, reason = 'Duplicado') => ({
    voidedAt: when,
    voidedByStaffId: staffId('duena@cafe.com'),
    voidReason: reason,
  });
  const stampData = (createdAt: Date) => ({
    merchantId: cafe.merchantId,
    membershipId: ana.membershipId,
    cycle: 1,
    grantedByStaffId: staffId('empleado@cafe.com'),
    source: 'QR_SCAN' as const,
    idempotencyKey: randomUUID(),
    createdAt,
  });
  const activity = (cookie: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get('/panel/activity')
      .query(query)
      .set('Cookie', cookie);
  const typesOf = (res: request.Response) =>
    res.body.items.map((e: { type: string }) => e.type);

  it('muestra los cinco tipos de evento, de lo más nuevo a lo más viejo', async () => {
    await prisma.membership.update({
      where: { id: ana.membershipId },
      data: { joinedAt: at(`${DAY}T12:00:00Z`), currentCycle: 2 },
    });
    await prisma.stamp.create({
      data: {
        ...stampData(at(`${DAY}T13:00:00Z`)),
        source: 'MANUAL',
        ...voidedBy(at(`${DAY}T13:02:00Z`)),
      },
    });
    await prisma.redemption.create({
      data: {
        merchantId: cafe.merchantId,
        membershipId: ana.membershipId,
        cycle: 1,
        rewardRuleId: cafe.ruleId,
        stampsUsed: 8,
        carryOver: 0,
        confirmedByStaffId: staffId('empleado@cafe.com'),
        idempotencyKey: randomUUID(),
        createdAt: at(`${DAY}T14:00:00Z`),
        ...voidedBy(at(`${DAY}T14:05:00Z`), 'Se canjeó por error'),
      },
    });

    const res = await activity(owner, { from: DAY, to: DAY }).expect(200);

    expect(typesOf(res)).toEqual([
      'REDEMPTION_VOIDED',
      'REDEMPTION',
      'STAMP_VOIDED',
      'STAMP',
      'JOINED',
    ]);
    const customer = {
      membershipId: ana.membershipId,
      name: 'Ana',
      phone: '+5491123456789',
    };
    expect(res.body).toMatchObject({
      nextCursor: null,
      items: [
        { by: 'duena', reason: 'Se canjeó por error', customer },
        { by: 'empleado', cycle: 1, rewardDescription: 'Premio', voided: true },
        { by: 'duena', reason: 'Duplicado', at: `${DAY}T13:02:00.000Z` },
        { by: 'empleado', source: 'MANUAL', voided: true },
        { pieceLabel: null, marketingConsent: false, customer },
      ],
    });
  });

  it('el día se corta a la medianoche de Buenos Aires', async () => {
    // 23:30 del 10 y 00:00 del 11, en hora argentina.
    await prisma.stamp.create({ data: stampData(at('2026-10-11T02:30:00Z')) });
    await prisma.stamp.create({ data: stampData(at('2026-10-11T03:00:00Z')) });

    const tenth = await activity(owner, { from: DAY, to: DAY }).expect(200);
    const eleventh = await activity(owner, {
      from: '2026-10-11',
      to: '2026-10-11',
    }).expect(200);

    expect(tenth.body.items.map((e: { at: string }) => e.at)).toEqual([
      '2026-10-11T02:30:00.000Z',
    ]);
    expect(eleventh.body.items.map((e: { at: string }) => e.at)).toEqual([
      '2026-10-11T03:00:00.000Z',
    ]);
  });

  it('sin fechas muestra el día de hoy', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.stamp.create({ data: stampData(yesterday) });

    const res = await activity(owner).expect(200);

    // Solo el alta de Ana, que se unió recién.
    expect(typesOf(res)).toEqual(['JOINED']);
  });

  it('recorre todas las páginas sin repetir ni perder eventos del mismo instante', async () => {
    const same = at(`${DAY}T15:00:00Z`);
    const spread = (i: number) =>
      at(`${DAY}T10:${String(i).padStart(2, '0')}:00Z`);
    await prisma.stamp.createMany({
      data: [
        ...Array.from({ length: 70 }, () => stampData(same)),
        ...Array.from({ length: 50 }, (_, i) => stampData(spread(i))),
      ],
    });
    // Anulaciones en el mismo instante que los sellos: otro tipo, mismo `at`.
    const toVoid = await prisma.stamp.findMany({ take: 10 });
    await prisma.stamp.updateMany({
      where: { id: { in: toVoid.map((s) => s.id) } },
      data: voidedBy(same),
    });

    const seen: { id: string; at: string }[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: Record<string, string> = { from: DAY, to: DAY };
      if (cursor) query.cursor = cursor;
      const res = await activity(employee, query).expect(200);
      seen.push(...res.body.items);
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(130);
    expect(new Set(seen.map((e) => e.id)).size).toBe(130);
    const times = seen.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('el EMPLOYEE ve el teléfono enmascarado', async () => {
    const res = await activity(employee).expect(200);
    expect(res.body.items[0].customer.phone).toBe('11 ••• 6789');
  });

  it('valida las fechas y el cursor', async () => {
    const invalidRanges = [
      { from: '2026-10-11', to: DAY },
      { from: '2025-01-01', to: '2026-10-10' },
    ];
    for (const query of invalidRanges) {
      const res = await activity(owner, query).expect(400);
      expect(res.body.code).toBe('INVALID_DATE_RANGE');
    }
    await activity(owner, { from: '10/10/2026' }).expect(400);
    const badCursor = await activity(owner, { cursor: 'no-es-un-cursor' });
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe('VALIDATION_ERROR');
  });
});
