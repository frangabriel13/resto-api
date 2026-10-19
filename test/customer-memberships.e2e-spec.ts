import { setTimeout as sleep } from 'node:timers/promises';
import { Controller, Get, INestApplication, Param, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { CustomerContext } from './../src/common/customer-scope/customer-context.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import { CustomerRoute } from './../src/modules/auth/customer/customer-route.decorator.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { LOCK_WAIT_MS, whileRowLocked } from './helpers/row-lock.js';
import { loginCustomer } from './helpers/sessions.js';

@Controller('test-customer-scope')
@CustomerRoute()
class TestCustomerScopeController {
  constructor(private readonly customer: CustomerContext) {}

  @Get('setting')
  async setting() {
    const [row] = await this.customer.db.$queryRaw<{ setting: string }[]>`
      SELECT current_setting('app.customer_id', true) AS setting`;
    return { setting: row?.setting };
  }

  @Get('memberships/:id')
  async membership(@Param('id') id: string) {
    return {
      membership: await this.customer.db.membership.findUnique({
        where: { id },
      }),
    };
  }

  @Get('stamps')
  stamps() {
    return this.customer.db.stamp.findMany();
  }

  @Get('staff')
  staff() {
    return this.customer.db.staffUser.findMany();
  }

  @Post('pieces/:id')
  renamePiece(@Param('id') id: string) {
    return this.customer.db.piece.update({
      where: { id },
      data: { label: 'X' },
    });
  }
}

type Club = {
  merchantId: string;
  ruleId: string;
  pieceCode: string;
  pieceId: string;
};

describe('Cliente: perfil y clubes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let sender: FakeOtpSender;
  let cafe: Club;
  let heladeria: Club;
  let staffId: string;
  let ana: { id: string; cookie: string };

  beforeEach(async () => {
    sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestCustomerScopeController],
    })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    cafe = await createClub('cafe', 'mostrador123');
    heladeria = await createClub('heladeria', 'helado123456');
    staffId = (
      await prisma.staffUser.create({
        data: {
          email: 'empleado@cafe.com',
          name: 'Empleado',
          passwordHash: 'x',
          memberships: {
            create: { merchantId: cafe.merchantId, role: 'EMPLOYEE' },
          },
        },
      })
    ).id;
    ana = await login('11 2345-6789', 'Ana');
  });

  afterEach(async () => {
    await app.close();
  });

  const createClub = async (slug: string, pieceCode: string): Promise<Club> => {
    const merchant = await prisma.merchant.create({
      data: { name: slug, slug, status: 'ACTIVE' },
    });
    const rule = await prisma.rewardRule.create({
      data: {
        merchantId: merchant.id,
        version: 1,
        stampsRequired: 8,
        rewardDescription: 'Premio',
        active: true,
      },
    });
    const piece = await prisma.piece.create({
      data: {
        merchantId: merchant.id,
        publicCode: pieceCode,
        label: 'Mostrador',
      },
    });
    return {
      merchantId: merchant.id,
      ruleId: rule.id,
      pieceCode,
      pieceId: piece.id,
    };
  };
  const login = async (phone: string, name: string) => {
    const { body, cookie } = await loginCustomer(app, sender, phone, name);
    return { id: body.customer.id as string, cookie };
  };
  const send = (
    method: 'get' | 'post' | 'patch',
    path: string,
    cookie: string,
    body?: object,
  ) =>
    request(app.getHttpServer())[method](path).set('Cookie', cookie).send(body);
  const join = (cookie: string, body: object) =>
    send('post', '/me/memberships', cookie, body);
  const addStamps = (membershipId: string, merchantId: string, count: number) =>
    prisma.stamp.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        merchantId,
        membershipId,
        cycle: 1,
        grantedByStaffId: staffId,
        source: 'QR_SCAN' as const,
        idempotencyKey: `${membershipId}-${i}`,
      })),
    });
  const setStatus = (merchantId: string, status: MerchantStatus) =>
    prisma.merchant.update({ where: { id: merchantId }, data: { status } });

  describe('perfil', () => {
    it('muestra y edita el nombre', async () => {
      const me = await send('get', '/me', ana.cookie).expect(200);
      expect(me.body).toEqual({
        id: ana.id,
        name: 'Ana',
        phoneE164: '+5491123456789',
      });

      const updated = await send('patch', '/me', ana.cookie, {
        name: ' Ana María ',
      }).expect(200);
      expect(updated.body.name).toBe('Ana María');
      await send('patch', '/me', ana.cookie, { name: '' }).expect(400);
      await request(app.getHttpServer()).get('/me').expect(401);
    });
  });

  describe('unirse a un club', () => {
    it('se une a un club activo, sin consentimiento de marketing por defecto', async () => {
      const res = await join(ana.cookie, {
        merchantId: cafe.merchantId,
        pieceCode: cafe.pieceCode,
      }).expect(200);

      expect(res.body).toMatchObject({
        isNew: true,
        membership: {
          merchant: { id: cafe.merchantId, status: 'ACTIVE' },
          cycle: 1,
          balance: 0,
          stampsRequired: 8,
          remaining: 8,
          canRedeem: false,
          marketingConsent: false,
        },
      });
      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: res.body.membership.id },
      });
      expect(membership).toMatchObject({
        joinedViaPieceId: cafe.pieceId,
        currentCycleRewardRuleId: cafe.ruleId,
        marketingConsentAt: null,
      });
    });

    it('con consentimiento lo registra con la fecha', async () => {
      const res = await join(ana.cookie, {
        merchantId: cafe.merchantId,
        marketingConsent: true,
      }).expect(200);

      expect(res.body.membership.marketingConsent).toBe(true);
      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: res.body.membership.id },
      });
      expect(membership.marketingConsentAt).not.toBeNull();
    });

    it('unirse otra vez devuelve la misma membresía sin cambiar el consentimiento', async () => {
      const first = await join(ana.cookie, { merchantId: cafe.merchantId });
      const again = await join(ana.cookie, {
        merchantId: cafe.merchantId,
        marketingConsent: true,
      }).expect(200);

      expect(again.body).toMatchObject({
        isNew: false,
        membership: { id: first.body.membership.id, marketingConsent: false },
      });
    });

    it('pedidos simultáneos crean una sola membresía', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          join(ana.cookie, { merchantId: cafe.merchantId }),
        ),
      );

      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.filter((r) => r.body.isNew)).toHaveLength(1);
      expect(await prisma.membership.count()).toBe(1);
    });

    it('espera el bloqueo del cliente antes de buscar su membresía', async () => {
      let pending: Promise<request.Response> | undefined;

      await whileRowLocked('customers', ana.id, async (tx) => {
        pending = join(ana.cookie, { merchantId: cafe.merchantId }).then(
          (res) => res,
        );
        await sleep(LOCK_WAIT_MS);
        await tx.membership.create({
          data: {
            customerId: ana.id,
            merchantId: cafe.merchantId,
            currentCycleRewardRuleId: cafe.ruleId,
          },
        });
      });

      const res = await pending!;
      expect(res.status).toBe(200);
      expect(res.body.isNew).toBe(false);
      expect(await prisma.membership.count()).toBe(1);
    });

    it('al volver después de salir conserva el ciclo, los sellos y la fecha de alta', async () => {
      const first = (await join(ana.cookie, { merchantId: cafe.merchantId }))
        .body;
      const id = first.membership.id;
      await addStamps(id, cafe.merchantId, 3);
      await prisma.membership.update({
        where: { id },
        data: { leftAt: new Date(), marketingConsentRevokedAt: new Date() },
      });

      const res = await join(ana.cookie, {
        merchantId: cafe.merchantId,
        marketingConsent: true,
      }).expect(200);

      expect(res.body).toMatchObject({
        isNew: true,
        membership: {
          id,
          balance: 3,
          marketingConsent: true,
          joinedAt: first.membership.joinedAt,
        },
      });
    });

    it('no se une a un club que no está activo ni a uno que no existe', async () => {
      for (const status of ['DRAFT', 'PAUSED', 'ENDED'] as const) {
        await setStatus(cafe.merchantId, status);
        const res = await join(ana.cookie, {
          merchantId: cafe.merchantId,
        }).expect(409);
        expect(res.body.code).toBe('MERCHANT_NOT_ACCEPTING_MEMBERS');
      }
      await join(ana.cookie, { merchantId: crypto.randomUUID() }).expect(404);
    });

    it('una pieza de otro comercio no se registra como origen', async () => {
      const res = await join(ana.cookie, {
        merchantId: cafe.merchantId,
        pieceCode: heladeria.pieceCode,
      }).expect(200);

      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: res.body.membership.id },
      });
      expect(membership.joinedViaPieceId).toBeNull();
    });
  });

  describe('mis clubes y consentimiento', () => {
    it('lista solo sus clubes, sin los que dejó, con el saldo', async () => {
      const beto = await login('11 4567-8901', 'Beto');
      const inCafe = (await join(ana.cookie, { merchantId: cafe.merchantId }))
        .body;
      const inHeladeria = (
        await join(ana.cookie, { merchantId: heladeria.merchantId })
      ).body;
      await join(beto.cookie, { merchantId: cafe.merchantId });
      await addStamps(inCafe.membership.id, cafe.merchantId, 2);
      await prisma.membership.update({
        where: { id: inHeladeria.membership.id },
        data: { leftAt: new Date() },
      });

      const res = await send('get', '/me/memberships', ana.cookie).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: inCafe.membership.id,
        balance: 2,
        remaining: 6,
      });
    });

    it('da y revoca el consentimiento de marketing', async () => {
      const id = (await join(ana.cookie, { merchantId: cafe.merchantId })).body
        .membership.id;
      const path = `/me/memberships/${id}/consent`;

      await send('patch', path, ana.cookie, { marketingConsent: true }).expect(
        200,
      );
      const granted = await prisma.membership.findUniqueOrThrow({
        where: { id },
      });
      expect(granted.marketingConsentAt).not.toBeNull();

      const res = await send('patch', path, ana.cookie, {
        marketingConsent: false,
      }).expect(200);
      expect(res.body.marketingConsent).toBe(false);
      const revoked = await prisma.membership.findUniqueOrThrow({
        where: { id },
      });
      expect(revoked.marketingConsentRevokedAt).not.toBeNull();
      expect(revoked.marketingConsentAt).toEqual(granted.marketingConsentAt);
    });

    it('no puede tocar la membresía de otro cliente', async () => {
      const beto = await login('11 4567-8901', 'Beto');
      const id = (await join(beto.cookie, { merchantId: cafe.merchantId })).body
        .membership.id;

      await send('patch', `/me/memberships/${id}/consent`, ana.cookie, {
        marketingConsent: true,
      }).expect(404);
    });
  });

  describe('contexto del cliente', () => {
    it('fija el cliente en la transacción', async () => {
      const res = await send(
        'get',
        '/test-customer-scope/setting',
        ana.cookie,
      ).expect(200);
      expect(res.body.setting).toBe(ana.id);
    });

    it('no deja leer datos de otro cliente', async () => {
      const beto = await login('11 4567-8901', 'Beto');
      const anaId = (await join(ana.cookie, { merchantId: cafe.merchantId }))
        .body.membership.id;
      const betoId = (await join(beto.cookie, { merchantId: cafe.merchantId }))
        .body.membership.id;
      await addStamps(anaId, cafe.merchantId, 1);
      await addStamps(betoId, cafe.merchantId, 2);

      const other = await send(
        'get',
        `/test-customer-scope/memberships/${betoId}`,
        ana.cookie,
      );
      expect(other.body.membership).toBeNull();
      const stamps = await send(
        'get',
        '/test-customer-scope/stamps',
        ana.cookie,
      ).expect(200);
      expect(
        stamps.body.map((s: { membershipId: string }) => s.membershipId),
      ).toEqual([anaId]);
    });

    it('bloquea las tablas de staff y la escritura de datos del comercio', async () => {
      await send('get', '/test-customer-scope/staff', ana.cookie).expect(500);
      await send(
        'post',
        `/test-customer-scope/pieces/${cafe.pieceId}`,
        ana.cookie,
      ).expect(500);
      const piece = await prisma.piece.findUniqueOrThrow({
        where: { id: cafe.pieceId },
      });
      expect(piece.label).toBe('Mostrador');
    });
  });
});
