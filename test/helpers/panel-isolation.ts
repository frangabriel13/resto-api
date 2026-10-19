import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../../src/app.module.js';
import { OTP_SENDER } from './../../src/modules/auth/customer/otp-sender.js';
import { PrismaAdminService } from './../../src/prisma/prisma-admin.service.js';
import {
  createClub,
  joinClub,
  STAFF_PASSWORD,
  stampTokenFor,
  type ClubMember,
} from './club.js';
import { FakeOtpSender } from './fake-otp-sender.js';
import { loginStaff } from './sessions.js';

type Club = Awaited<ReturnType<typeof createClub>>;

// Staff del comercio A (café) contra los datos del comercio B (heladería), en
// cada endpoint del panel. Al final de cada test, B tiene que seguir igual.
export function describePanelIsolation(mode: string) {
  describe(`Aislamiento del panel entre comercios (${mode})`, () => {
    let app: INestApplication<App>;
    let prisma: PrismaAdminService;
    let cafe: Club;
    let heladeria: Club;
    let ana: ClubMember;
    let beto: ClubMember;
    let betoStampId: string;
    let claraRedemptionId: string;
    let employee: string;
    // Dueña de los dos comercios, con el café seleccionado.
    let owner: string;
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
        ['duena@cafe.com', 'OWNER'],
      ]);
      heladeria = await createClub(prisma, 'heladeria', [
        ['empleado@heladeria.com', 'EMPLOYEE'],
      ]);
      await prisma.staffMembership.create({
        data: {
          staffUserId: cafe.staffIds['duena@cafe.com']!,
          merchantId: heladeria.merchantId,
          role: 'OWNER',
        },
      });

      ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafe.merchantId);
      beto = await joinClub(
        app,
        sender,
        '11 4567-8901',
        'Beto',
        heladeria.merchantId,
      );
      const clara = await joinClub(
        app,
        sender,
        '11 3456-7890',
        'Clara',
        heladeria.merchantId,
      );
      // Tarjeta completa, con el último sello todavía anulable.
      await giveStamps(beto, 8);
      betoStampId = (await prisma.stamp.findFirstOrThrow()).id;
      await giveStamps(clara, 8);
      claraRedemptionId = await redeemDirectly(clara);

      employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
        .cookie;
      owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
      await post(owner, '/auth/staff/select-merchant', {
        merchantId: cafe.merchantId,
      }).expect(200);

      before = await snapshotOfHeladeria();
    });

    afterEach(async () => {
      expect(await snapshotOfHeladeria()).toEqual(before);
      await app.close();
    });

    const giveStamps = (member: ClubMember, count: number) =>
      prisma.stamp.createMany({
        data: Array.from({ length: count }, () => ({
          merchantId: heladeria.merchantId,
          membershipId: member.membershipId,
          cycle: 1,
          grantedByStaffId: heladeria.staffIds['empleado@heladeria.com']!,
          source: 'QR_SCAN' as const,
          idempotencyKey: randomUUID(),
        })),
      });
    const redeemDirectly = async (member: ClubMember) => {
      const redemption = await prisma.redemption.create({
        data: {
          merchantId: heladeria.merchantId,
          membershipId: member.membershipId,
          cycle: 1,
          rewardRuleId: heladeria.ruleId,
          stampsUsed: 8,
          carryOver: 0,
          confirmedByStaffId: heladeria.staffIds['empleado@heladeria.com']!,
          idempotencyKey: randomUUID(),
        },
      });
      await prisma.membership.update({
        where: { id: member.membershipId },
        data: { currentCycle: 2 },
      });
      return redemption.id;
    };
    const snapshotOfHeladeria = async () => {
      const byMerchant = { where: { merchantId: heladeria.merchantId } };
      return {
        merchant: await prisma.merchant.findUnique({
          where: { id: heladeria.merchantId },
        }),
        rules: await prisma.rewardRule.findMany(byMerchant),
        memberships: await prisma.membership.findMany(byMerchant),
        stamps: await prisma.stamp.findMany(byMerchant),
        redemptions: await prisma.redemption.findMany(byMerchant),
        audit: await prisma.auditEvent.count(byMerchant),
      };
    };
    const get = (cookie: string, path: string) =>
      request(app.getHttpServer()).get(path).set('Cookie', cookie);
    const post = (cookie: string, path: string, body: object) =>
      request(app.getHttpServer()).post(path).set('Cookie', cookie).send(body);
    const withKey = (body: object) => ({
      ...body,
      idempotencyKey: randomUUID(),
    });

    it('la búsqueda no encuentra clientes del otro comercio', async () => {
      for (const cookie of [employee, owner]) {
        for (const query of ['Beto', '4567 8901', '11 4567-8901']) {
          const res = await get(cookie, '/panel/customers')
            .query({ query })
            .expect(200);
          expect(res.body).toEqual([]);
        }
      }
    });

    it('no muestra la ficha de un cliente del otro comercio', async () => {
      for (const cookie of [employee, owner]) {
        await get(cookie, `/panel/customers/${beto.membershipId}`).expect(404);
      }
    });

    it('no escanea ni suma sellos a clientes del otro comercio', async () => {
      const stampToken = await stampTokenFor(app, beto);
      for (const cookie of [employee, owner]) {
        const scan = await post(cookie, '/panel/scans', { stampToken });
        expect(scan.body.code).toBe('CUSTOMER_OF_OTHER_MERCHANT');
        const byQr = await post(
          cookie,
          '/panel/stamps',
          withKey({ stampToken }),
        );
        expect(byQr.body.code).toBe('CUSTOMER_OF_OTHER_MERCHANT');
        await post(
          cookie,
          '/panel/stamps',
          withKey({ membershipId: beto.membershipId }),
        ).expect(404);
      }
    });

    it('la idempotencyKey de un sello del otro comercio no devuelve ese sello', async () => {
      const { idempotencyKey } = await prisma.stamp.findUniqueOrThrow({
        where: { id: betoStampId },
      });
      const stampToken = await stampTokenFor(app, ana);

      const res = await post(employee, '/panel/stamps', {
        stampToken,
        idempotencyKey,
      }).expect(201);

      expect(res.body.replayed).toBe(false);
      expect(res.body.stamp.id).not.toBe(betoStampId);
      expect(res.body.membership.id).toBe(ana.membershipId);
    });

    it('no anula sellos del otro comercio', async () => {
      for (const cookie of [employee, owner]) {
        await post(cookie, `/panel/stamps/${betoStampId}/void`, {
          reason: 'Intento',
        }).expect(404);
      }
    });

    it('no canjea ni anula canjes del otro comercio', async () => {
      const stampToken = await stampTokenFor(app, beto);
      for (const cookie of [employee, owner]) {
        const res = await post(
          cookie,
          '/panel/redemptions',
          withKey({ stampToken }),
        );
        expect(res.body.code).toBe('CUSTOMER_OF_OTHER_MERCHANT');
      }
      await post(owner, `/panel/redemptions/${claraRedemptionId}/void`, {
        reason: 'Intento',
      }).expect(404);
    });

    it('las reglas de premio son solo las del propio comercio', async () => {
      const list = await get(owner, '/panel/reward-rules').expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).toEqual([cafe.ruleId]);

      const created = await post(owner, '/panel/reward-rules', {
        stampsRequired: 5,
        rewardDescription: 'Medialuna',
        conditions: null,
      }).expect(201);
      expect(created.body.version).toBe(2);
      const rule = await prisma.rewardRule.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(rule.merchantId).toBe(cafe.merchantId);
    });

    it('no puede elegir un comercio al que no pertenece', async () => {
      await post(employee, '/auth/staff/select-merchant', {
        merchantId: heladeria.merchantId,
      }).expect(403);
    });
  });
}
