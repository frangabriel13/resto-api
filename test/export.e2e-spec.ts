import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { arDay } from './../src/common/ar-time.js';
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
const HEADER =
  'Nombre;Teléfono;Acepta comunicaciones;Fecha de consentimiento;' +
  'Fecha de revocación;Alta;Salió del club;Ciclo actual;Sellos en el ciclo;' +
  'Sellos totales;Canjes;Último sello;Pieza de origen';

describe('Panel: export de clientes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let ana: ClubMember;
  let beto: ClubMember;
  let owner: string;
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
      ['duena@cafe.com', 'OWNER'],
      ['empleado@cafe.com', 'EMPLOYEE'],
    ]);
    ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafe.merchantId);
    beto = await joinClub(app, sender, '11 4567-8901', 'Beto', cafe.merchantId);
    owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const download = (cookie = owner) =>
    request(app.getHttpServer()).get('/panel/export').set('Cookie', cookie);
  const linesOf = (res: request.Response) =>
    res.text.replace(/^﻿/, '').split('\r\n');
  const addCustomer = async (data: {
    name: string | null;
    phoneE164: string | null;
    deletedAt?: Date;
  }) => {
    const customer = await prisma.customer.create({ data });
    await prisma.membership.create({
      data: {
        merchantId: cafe.merchantId,
        customerId: customer.id,
        currentCycleRewardRuleId: cafe.ruleId,
      },
    });
  };
  const giveStamps = (createdAt: string[]) =>
    prisma.stamp.createMany({
      data: createdAt.map((iso) => ({
        merchantId: cafe.merchantId,
        membershipId: ana.membershipId,
        cycle: 1,
        grantedByStaffId: cafe.staffIds['empleado@cafe.com']!,
        source: 'QR_SCAN' as const,
        idempotencyKey: randomUUID(),
        createdAt: at(iso),
      })),
    });

  it('baja un CSV para Excel con todos los clientes y su consentimiento', async () => {
    const piece = await prisma.piece.create({
      data: {
        merchantId: cafe.merchantId,
        publicCode: 'mostrador123',
        label: 'Mostrador',
      },
    });
    await prisma.membership.update({
      where: { id: ana.membershipId },
      data: {
        joinedAt: at('2026-10-05T14:00:00Z'),
        joinedViaPieceId: piece.id,
        marketingConsent: true,
        marketingConsentAt: at('2026-10-05T15:00:00Z'),
      },
    });
    // El último, a las 23:30 del 6 en hora argentina.
    await giveStamps([
      '2026-10-06T12:00:00Z',
      '2026-10-06T13:00:00Z',
      '2026-10-07T02:30:00Z',
    ]);
    await prisma.membership.update({
      where: { id: beto.membershipId },
      data: {
        joinedAt: at('2026-10-01T12:00:00Z'),
        marketingConsentAt: at('2026-10-01T12:00:00Z'),
        marketingConsentRevokedAt: at('2026-10-10T12:00:00Z'),
        leftAt: at('2026-10-10T12:00:00Z'),
      },
    });

    const res = await download().expect(200);

    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="clubsy-cafe-${arDay(new Date())}.csv"`,
    );
    expect(res.text.startsWith('﻿')).toBe(true);
    expect(linesOf(res)).toEqual([
      HEADER,
      'Beto;011 15-4567-8901;No;2026-10-01 09:00;2026-10-10 09:00;' +
        '2026-10-01 09:00;2026-10-10 09:00;1;0;0;0;;',
      'Ana;011 15-2345-6789;Sí;2026-10-05 12:00;;2026-10-05 11:00;;' +
        '1;3;3;0;2026-10-06 23:30;Mostrador',
    ]);
  });

  it('neutraliza un nombre que Excel tomaría como fórmula y muestra las cuentas borradas', async () => {
    await addCustomer({
      name: '=HYPERLINK("http://x","clic")',
      phoneE164: '+5491156781234',
    });
    await addCustomer({ name: null, phoneE164: null, deletedAt: new Date() });

    const lines = linesOf(await download().expect(200));

    expect(lines).toContainEqual(
      expect.stringMatching(/^"'=HYPERLINK\(""http:\/\/x"",""clic""\)";/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/^\(cuenta borrada\);;No;/),
    );
  });

  it('queda auditado quién exportó y cuántas filas', async () => {
    await download().expect(200);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'merchant.customers_exported' },
    });
    expect(audit).toMatchObject({
      actorId: cafe.staffIds['duena@cafe.com'],
      entityId: cafe.merchantId,
      payload: { rows: 2 },
    });
  });

  it('solo el OWNER, también con el club finalizado', async () => {
    await download(employee).expect(403);
    await prisma.merchant.update({
      where: { id: cafe.merchantId },
      data: { status: 'ENDED' },
    });
    await download().expect(200);
  });
});
