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
  stampTokenFor,
  type ClubMember,
} from './helpers/club.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { loginStaff } from './helpers/sessions.js';

const MINUTE = 60_000;

describe('Panel: búsqueda, ficha y sello manual (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let ana: ClubMember;
  let anaMaria: ClubMember;
  let anaHeladeria: ClubMember;
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
      ['empleada2@cafe.com', 'EMPLOYEE'],
      ['duena@cafe.com', 'OWNER'],
    ]);
    const heladeria = await createClub(prisma, 'heladeria', [
      ['empleado@heladeria.com', 'EMPLOYEE'],
    ]);
    ana = await joinClub(
      app,
      sender,
      '11 2345-6789',
      'Ana Gómez',
      cafe.merchantId,
    );
    anaMaria = await joinClub(
      app,
      sender,
      '11 4567-8901',
      'Ana María',
      cafe.merchantId,
    );
    anaHeladeria = await joinClub(
      app,
      sender,
      '11 3456-7890',
      'Ana Heladera',
      heladeria.merchantId,
    );
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
    owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const search = (cookie: string, query: string) =>
    request(app.getHttpServer())
      .get('/panel/customers')
      .query({ query })
      .set('Cookie', cookie);
  const detail = (cookie: string, membershipId: string) =>
    request(app.getHttpServer())
      .get(`/panel/customers/${membershipId}`)
      .set('Cookie', cookie);
  const manualStamp = (cookie: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/panel/stamps')
      .set('Cookie', cookie)
      .send({ idempotencyKey: randomUUID(), ...body });
  const names = (res: request.Response) =>
    res.body.map((m: { customer: { name: string } }) => m.customer.name);

  describe('búsqueda', () => {
    it('por nombre, sin distinguir mayúsculas y solo del propio comercio', async () => {
      const res = await search(employee, 'ana').expect(200);
      expect(names(res)).toEqual(['Ana Gómez', 'Ana María']);
    });

    it('por teléfono, completo o parcial', async () => {
      expect(names(await search(employee, '2345 6789').expect(200))).toEqual([
        'Ana Gómez',
      ]);
      expect(
        names(await search(employee, '011 15 2345-6789').expect(200)),
      ).toEqual(['Ana Gómez']);
    });

    it('no incluye a quienes salieron del club', async () => {
      await prisma.membership.update({
        where: { id: anaMaria.membershipId },
        data: { leftAt: new Date() },
      });
      expect(names(await search(employee, 'ana').expect(200))).toEqual([
        'Ana Gómez',
      ]);
    });

    it('muestra el teléfono enmascarado al EMPLOYEE y completo al OWNER', async () => {
      const asEmployee = await search(employee, 'Gómez').expect(200);
      expect(asEmployee.body[0].customer.phone).toBe('11 ••• 6789');
      const asOwner = await search(owner, 'Gómez').expect(200);
      expect(asOwner.body[0].customer.phone).toBe('+5491123456789');
    });

    it('pide al menos dos caracteres', async () => {
      await search(employee, 'a').expect(400);
    });
  });

  describe('ficha', () => {
    it('muestra el historial con quién dio cada sello y qué puede anular cada uno', async () => {
      const own = await prisma.stamp.create({
        data: {
          merchantId: cafe.merchantId,
          membershipId: ana.membershipId,
          cycle: 1,
          grantedByStaffId: cafe.staffIds['empleado@cafe.com']!,
          source: 'QR_SCAN',
          idempotencyKey: randomUUID(),
          createdAt: new Date(Date.now() - 2 * MINUTE),
        },
      });
      const others = await prisma.stamp.create({
        data: {
          merchantId: cafe.merchantId,
          membershipId: ana.membershipId,
          cycle: 1,
          grantedByStaffId: cafe.staffIds['empleada2@cafe.com']!,
          source: 'MANUAL',
          idempotencyKey: randomUUID(),
          createdAt: new Date(Date.now() - 90 * MINUTE),
          voidedAt: new Date(Date.now() - 80 * MINUTE),
          voidedByStaffId: cafe.staffIds['duena@cafe.com']!,
          voidReason: 'Duplicado',
        },
      });

      const res = await detail(employee, ana.membershipId).expect(200);

      expect(res.body).toMatchObject({
        membership: { id: ana.membershipId, balance: 1 },
        leftAt: null,
        marketingConsent: false,
        cooldown: { active: true },
        history: [
          {
            type: 'STAMP',
            id: own.id,
            grantedBy: 'empleado',
            voided: null,
            canVoid: true,
          },
          {
            type: 'STAMP',
            id: others.id,
            source: 'MANUAL',
            grantedBy: 'empleada2',
            voided: { by: 'duena', reason: 'Duplicado' },
            canVoid: false,
          },
        ],
      });
      const asOwner = await detail(owner, ana.membershipId).expect(200);
      expect(asOwner.body.history[0].canVoid).toBe(true);
    });

    it('no muestra la ficha de un cliente de otro comercio', async () => {
      await detail(employee, anaHeladeria.membershipId).expect(404);
    });
  });

  describe('sello manual', () => {
    it('suma un sello con origen manual y respeta el cooldown', async () => {
      const res = await manualStamp(employee, {
        membershipId: ana.membershipId,
      }).expect(201);
      expect(res.body).toMatchObject({
        stamp: { source: 'MANUAL' },
        membership: { balance: 1 },
      });

      const blocked = await manualStamp(employee, {
        membershipId: ana.membershipId,
      }).expect(409);
      expect(blocked.body.code).toBe('COOLDOWN_ACTIVE');
    });

    it('no suma a un cliente de otro comercio', async () => {
      const res = await manualStamp(employee, {
        membershipId: anaHeladeria.membershipId,
      }).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('no acepta QR y membresía a la vez', async () => {
      await manualStamp(employee, {
        membershipId: ana.membershipId,
        stampToken: await stampTokenFor(app, ana),
      }).expect(400);
      expect(await prisma.stamp.count()).toBe(0);
    });
  });
});
