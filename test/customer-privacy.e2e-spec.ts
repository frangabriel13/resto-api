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
import { loginCustomer, loginStaff } from './helpers/sessions.js';

const ANA_PHONE = '11 2345-6789';

describe('Cliente: salir del club y borrar la cuenta (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let sender: FakeOtpSender;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let heladeria: Awaited<ReturnType<typeof createClub>>;
  let ana: ClubMember;
  let anaHeladeria: ClubMember;
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

    cafe = await createClub(prisma, 'cafe', [
      ['empleado@cafe.com', 'EMPLOYEE'],
    ]);
    heladeria = await createClub(prisma, 'heladeria', []);
    ana = await joinClub(app, sender, ANA_PHONE, 'Ana', cafe.merchantId);
    anaHeladeria = await joinClub(
      app,
      sender,
      ANA_PHONE,
      'Ana',
      heladeria.merchantId,
    );
    await asAna('patch', `/me/memberships/${ana.membershipId}/consent`)
      .send({ marketingConsent: true })
      .expect(200);
    await prisma.stamp.createMany({
      data: [1, 2].map(() => ({
        merchantId: cafe.merchantId,
        membershipId: ana.membershipId,
        cycle: 1,
        grantedByStaffId: cafe.staffIds['empleado@cafe.com']!,
        source: 'QR_SCAN' as const,
        idempotencyKey: randomUUID(),
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })),
    });
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  function asAna(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
    return request(app.getHttpServer())[method](path).set('Cookie', ana.cookie);
  }
  const membershipOf = (member: ClubMember) =>
    prisma.membership.findUniqueOrThrow({ where: { id: member.membershipId } });
  const panel = (method: 'get' | 'post', path: string) =>
    request(app.getHttpServer())[method](path).set('Cookie', employee);

  describe('salir del club', () => {
    it('deja de verlo, revoca el consentimiento y conserva los sellos', async () => {
      const stampToken = await stampTokenFor(app, ana);

      await asAna('delete', `/me/memberships/${ana.membershipId}`).expect(204);

      const clubs = await asAna('get', '/me/memberships').expect(200);
      expect(clubs.body.map((m: { id: string }) => m.id)).toEqual([
        anaHeladeria.membershipId,
      ]);
      await asAna('get', `/me/memberships/${ana.membershipId}`).expect(404);
      const membership = await membershipOf(ana);
      expect(membership).toMatchObject({ marketingConsent: false });
      expect(membership.leftAt).not.toBeNull();
      expect(membership.marketingConsentRevokedAt).toEqual(membership.leftAt);
      expect(
        await prisma.stamp.count({ where: { membershipId: ana.membershipId } }),
      ).toBe(2);

      const search = await panel('get', '/panel/customers')
        .query({ query: 'Ana' })
        .expect(200);
      expect(search.body).toEqual([]);
      const stamp = await panel('post', '/panel/stamps').send({
        stampToken,
        idempotencyKey: randomUUID(),
      });
      expect(stamp.body.code).toBe('MEMBERSHIP_LEFT');
    });

    it('al volver recupera el ciclo y los sellos, sin consentimiento', async () => {
      await asAna('delete', `/me/memberships/${ana.membershipId}`).expect(204);
      await asAna('delete', `/me/memberships/${ana.membershipId}`).expect(204);

      const back = await asAna('post', '/me/memberships')
        .send({ merchantId: cafe.merchantId })
        .expect(200);

      expect(back.body.membership.id).toBe(ana.membershipId);
      const card = await asAna(
        'get',
        `/me/memberships/${ana.membershipId}`,
      ).expect(200);
      expect(card.body).toMatchObject({ balance: 2, marketingConsent: false });
    });
  });

  describe('borrar la cuenta', () => {
    it('anonimiza al cliente, lo saca de sus clubes y cierra todas sus sesiones', async () => {
      const other = await loginCustomer(app, sender, ANA_PHONE, 'Ana');

      const res = await asAna('delete', '/me').expect(204);

      expect(res.headers['set-cookie']?.[0]).toMatch(/^fs_customer=;/);
      for (const cookie of [ana.cookie, other.cookie]) {
        await request(app.getHttpServer())
          .get('/me')
          .set('Cookie', cookie)
          .expect(401);
      }
      expect(
        await prisma.customer.findUniqueOrThrow({
          where: { id: ana.customerId },
        }),
      ).toMatchObject({ name: null, phoneE164: null, phoneVerifiedAt: null });
      for (const member of [ana, anaHeladeria]) {
        const membership = await membershipOf(member);
        expect(membership.leftAt).not.toBeNull();
        expect(membership.marketingConsent).toBe(false);
      }
      expect(await prisma.otpChallenge.count()).toBe(0);
    });

    it('los sellos quedan para el comercio, sin datos personales', async () => {
      await asAna('delete', '/me').expect(204);

      expect(
        await prisma.stamp.count({ where: { membershipId: ana.membershipId } }),
      ).toBe(2);
      const detail = await panel(
        'get',
        `/panel/customers/${ana.membershipId}`,
      ).expect(200);
      expect(detail.body.membership.customer).toEqual({
        name: null,
        phone: null,
      });
    });

    it('el mismo teléfono puede crear una cuenta nueva, vacía', async () => {
      await asAna('delete', '/me').expect(204);

      const again = await loginCustomer(app, sender, ANA_PHONE, 'Ana otra vez');

      expect(again.body).toMatchObject({ isNew: true });
      expect(again.body.customer.id).not.toBe(ana.customerId);
      const clubs = await request(app.getHttpServer())
        .get('/me/memberships')
        .set('Cookie', again.cookie)
        .expect(200);
      expect(clubs.body).toEqual([]);
    });
  });
});
