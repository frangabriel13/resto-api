import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../../src/app.module.js';
import { OTP_SENDER } from './../../src/modules/auth/customer/otp-sender.js';
import { PrismaAdminService } from './../../src/prisma/prisma-admin.service.js';
import { createClub, joinClub, type ClubMember } from './club.js';
import { FakeOtpSender } from './fake-otp-sender.js';

type Club = Awaited<ReturnType<typeof createClub>>;

// Ana contra los datos de Beto, que está en el mismo café y también en una
// heladería. Al final de cada test, lo de Beto tiene que seguir igual.
export function describeCustomerIsolation(mode: string) {
  describe(`Aislamiento entre clientes (${mode})`, () => {
    let app: INestApplication<App>;
    let prisma: PrismaAdminService;
    let cafe: Club;
    let heladeria: Club;
    let ana: ClubMember;
    let beto: ClubMember;
    let betoHeladeria: ClubMember;
    let before: unknown;

    beforeEach(async () => {
      const sender = new FakeOtpSender();
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(OTP_SENDER)
        .useValue(sender)
        .compile();
      app = moduleRef.createNestApplication({ logger: false });
      await app.init();
      prisma = moduleRef.get(PrismaAdminService);

      cafe = await createClub(prisma, 'cafe', [
        ['empleado@cafe.com', 'EMPLOYEE'],
      ]);
      heladeria = await createClub(prisma, 'heladeria', [
        ['empleado@heladeria.com', 'EMPLOYEE'],
      ]);
      ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafe.merchantId);
      beto = await joinClub(
        app,
        sender,
        '11 4567-8901',
        'Beto',
        cafe.merchantId,
      );
      betoHeladeria = await joinClub(
        app,
        sender,
        '11 4567-8901',
        'Beto',
        heladeria.merchantId,
      );
      await giveStamps(ana, 1);
      await giveStamps(beto, 3);

      before = await snapshotOfBeto();
    });

    afterEach(async () => {
      expect(await snapshotOfBeto()).toEqual(before);
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
    const snapshotOfBeto = async () => ({
      customer: await prisma.customer.findUnique({
        where: { id: beto.customerId },
      }),
      memberships: await prisma.membership.findMany({
        where: { customerId: beto.customerId },
        orderBy: { id: 'asc' },
      }),
      stamps: await prisma.stamp.count({
        where: { membership: { customerId: beto.customerId } },
      }),
    });
    const asAna = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
      request(app.getHttpServer())[method](path).set('Cookie', ana.cookie);

    it('su cuenta es la suya y solo cambia la suya', async () => {
      const me = await asAna('get', '/me').expect(200);
      expect(me.body.name).toBe('Ana');
      await asAna('patch', '/me').send({ name: 'Ana María' }).expect(200);
    });

    it('lista solo sus clubes', async () => {
      const res = await asAna('get', '/me/memberships').expect(200);
      expect(res.body.map((m: { id: string }) => m.id)).toEqual([
        ana.membershipId,
      ]);
    });

    it('no ve la tarjeta ni el QR de otro cliente', async () => {
      for (const { membershipId } of [beto, betoHeladeria]) {
        await asAna('get', `/me/memberships/${membershipId}`).expect(404);
        await asAna(
          'get',
          `/me/memberships/${membershipId}/stamp-token`,
        ).expect(404);
      }
    });

    it('no cambia el consentimiento de otro cliente', async () => {
      for (const { membershipId } of [beto, betoHeladeria]) {
        await asAna('patch', `/me/memberships/${membershipId}/consent`)
          .send({ marketingConsent: true })
          .expect(404);
      }
    });

    it('unirse a un club donde está otro cliente crea su propia membresía', async () => {
      const again = await asAna('post', '/me/memberships')
        .send({ merchantId: cafe.merchantId })
        .expect(200);
      expect(again.body).toMatchObject({
        isNew: false,
        membership: { id: ana.membershipId },
      });

      const joined = await asAna('post', '/me/memberships')
        .send({ merchantId: heladeria.merchantId })
        .expect(200);
      expect(joined.body.isNew).toBe(true);
      expect(joined.body.membership.id).not.toBe(betoHeladeria.membershipId);
    });

    it('no saca del club a otro cliente', async () => {
      for (const { membershipId } of [beto, betoHeladeria]) {
        await asAna('delete', `/me/memberships/${membershipId}`).expect(404);
      }
    });

    it('borrar su cuenta no toca la de otro cliente', async () => {
      await asAna('delete', '/me').expect(204);
    });

    it('su tarjeta no incluye sellos de otros clientes del mismo comercio', async () => {
      const res = await asAna(
        'get',
        `/me/memberships/${ana.membershipId}`,
      ).expect(200);
      expect(res.body).toMatchObject({ totalStamps: 1, balance: 1 });
      expect(res.body.history).toHaveLength(1);
    });
  });
}
