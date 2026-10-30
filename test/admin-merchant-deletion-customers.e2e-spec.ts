import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { loginAdmin, loginStaff } from './helpers/sessions.js';

const PASSWORD = 'clave-de-admin';
const IN_AN_HOUR = () => new Date(Date.now() + 60 * 60 * 1000);
const PHONES = {
  ana: '+5491123456789',
  beto: '+5491145678901',
  carla: '+5491156789012',
};

describe('Admin: borrar un comercio con clientes y exportarlos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cookie: string;

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    await prisma.platformAdmin.create({
      data: {
        email: 'admin@fullsync.com',
        name: 'Admin',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    cookie = await loginAdmin(app, 'admin@fullsync.com', PASSWORD);
  });

  afterEach(async () => {
    await app.close();
  });

  const send = (method: 'get' | 'post' | 'delete', path: string) =>
    request(app.getHttpServer())[method](path).set('Cookie', cookie);

  // Comercio finalizado con su regla, una pieza y un dueño que puede entrar.
  const createClub = async (slug: string, ownerEmail: string) => {
    const merchant = await prisma.merchant.create({
      data: { name: slug, slug, status: 'ENDED' },
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
    await prisma.piece.create({
      data: {
        merchantId: merchant.id,
        publicCode: `${slug}-pieza`,
        label: 'Mostrador',
      },
    });
    const owner = await prisma.staffUser.create({
      data: {
        email: ownerEmail,
        name: 'Dueño',
        passwordHash: await hashPassword(PASSWORD),
        mustChangePassword: false,
        memberships: { create: { merchantId: merchant.id, role: 'OWNER' } },
      },
    });
    return { merchantId: merchant.id, ruleId: rule.id, ownerId: owner.id };
  };
  type Club = Awaited<ReturnType<typeof createClub>>;

  const join = async (
    club: Club,
    customerId: string,
    stamps: number,
    leftAt: Date | null = null,
  ) => {
    const membership = await prisma.membership.create({
      data: {
        merchantId: club.merchantId,
        customerId,
        currentCycleRewardRuleId: club.ruleId,
        leftAt,
      },
    });
    for (let i = 0; i < stamps; i++) {
      await prisma.stamp.create({
        data: {
          merchantId: club.merchantId,
          membershipId: membership.id,
          cycle: 1,
          grantedByStaffId: club.ownerId,
          source: 'MANUAL',
          idempotencyKey: randomUUID(),
        },
      });
    }
    return membership;
  };
  const createCustomer = (name: string, phoneE164: string) =>
    prisma.customer.create({ data: { name, phoneE164 } });

  it('archivado, borra sus clientes y solo las cuentas que no tienen otro club', async () => {
    const cafe = await createClub('cafe', 'duena@cafe.com');
    const heladeria = await createClub('heladeria', 'duena@heladeria.com');
    const ana = await createCustomer('Ana', PHONES.ana);
    const beto = await createCustomer('Beto', PHONES.beto);
    const carla = await prisma.customer.create({
      data: { name: null, phoneE164: null, deletedAt: new Date('2026-01-01') },
    });
    const anaInCafe = await join(cafe, ana.id, 8);
    await prisma.redemption.create({
      data: {
        merchantId: cafe.merchantId,
        membershipId: anaInCafe.id,
        cycle: 1,
        rewardRuleId: cafe.ruleId,
        stampsUsed: 8,
        carryOver: 0,
        confirmedByStaffId: cafe.ownerId,
        idempotencyKey: randomUUID(),
      },
    });
    await join(cafe, beto.id, 1);
    await join(cafe, carla.id, 1);
    // Beto dejó la heladería, pero su cuenta sigue siendo de ese club.
    const betoInHeladeria = await join(heladeria, beto.id, 2, new Date());
    for (const customer of [ana, beto]) {
      await prisma.customerSession.create({
        data: {
          customerId: customer.id,
          tokenHash: randomUUID(),
          expiresAt: IN_AN_HOUR(),
        },
      });
      await prisma.otpChallenge.create({
        data: {
          phoneE164: customer.phoneE164!,
          codeHash: 'x',
          expiresAt: IN_AN_HOUR(),
        },
      });
    }
    await send('post', `/admin/merchants/${cafe.merchantId}/archive`).expect(
      200,
    );

    const summary = await send(
      'get',
      `/admin/merchants/${cafe.merchantId}/deletion-summary`,
    ).expect(200);
    await send('delete', `/admin/merchants/${cafe.merchantId}`)
      .query({ confirmName: 'cafe' })
      .expect(204);

    const counts = {
      customers: 3,
      stamps: 10,
      redemptions: 1,
      pieces: 1,
      customerAccounts: 1,
      staffUsers: 1,
    };
    expect(summary.body).toEqual({
      archived: true,
      canDelete: true,
      ...counts,
    });
    const byCafe = { where: { merchantId: cafe.merchantId } };
    expect([
      await prisma.membership.count(byCafe),
      await prisma.stamp.count(byCafe),
      await prisma.redemption.count(byCafe),
    ]).toEqual([0, 0, 0]);

    expect(
      await prisma.customer.findUniqueOrThrow({ where: { id: ana.id } }),
    ).toMatchObject({
      name: null,
      phoneE164: null,
      phoneVerifiedAt: null,
      deletedAt: expect.any(Date),
    });
    expect(
      await prisma.customerSession.findFirstOrThrow({
        where: { customerId: ana.id },
      }),
    ).toMatchObject({ revokedAt: expect.any(Date) });
    expect(
      await prisma.otpChallenge.findMany({ select: { phoneE164: true } }),
    ).toEqual([{ phoneE164: PHONES.beto }]);

    expect(
      await prisma.customer.findUniqueOrThrow({ where: { id: beto.id } }),
    ).toMatchObject({ name: 'Beto', phoneE164: PHONES.beto, deletedAt: null });
    expect(
      await prisma.customerSession.findFirstOrThrow({
        where: { customerId: beto.id },
      }),
    ).toMatchObject({ revokedAt: null });
    expect(
      await prisma.stamp.count({ where: { membershipId: betoInHeladeria.id } }),
    ).toBe(2);
    expect(
      await prisma.customer.findUniqueOrThrow({ where: { id: carla.id } }),
    ).toMatchObject({ deletedAt: new Date('2026-01-01') });

    const deleted = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'merchant.deleted' },
    });
    expect(deleted.payload).toEqual({ name: 'cafe', slug: 'cafe', ...counts });
  });

  it('el resumen de un comercio inexistente da 404', async () => {
    await send(
      'get',
      `/admin/merchants/${randomUUID()}/deletion-summary`,
    ).expect(404);
  });

  describe('export desde el admin', () => {
    it('es el mismo CSV del dueño y queda auditado como de la plataforma', async () => {
      const cafe = await createClub('cafe', 'duena@cafe.com');
      await join(cafe, (await createCustomer('Ana', PHONES.ana)).id, 3);
      await join(
        cafe,
        (await createCustomer('Beto', PHONES.beto)).id,
        1,
        new Date(),
      );
      const owner = await loginStaff(app, 'duena@cafe.com', PASSWORD);

      const fromAdmin = await send(
        'get',
        `/admin/merchants/${cafe.merchantId}/export`,
      ).expect(200);
      const fromOwner = await request(app.getHttpServer())
        .get('/panel/export')
        .set('Cookie', owner.cookie)
        .expect(200);

      expect(fromAdmin.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(fromAdmin.headers['content-disposition']).toBe(
        fromOwner.headers['content-disposition'],
      );
      expect(fromAdmin.text).toBe(fromOwner.text);
      expect(fromAdmin.text.split('\r\n').filter(Boolean)).toHaveLength(3);
      expect(
        await prisma.auditEvent.findMany({
          where: { action: 'merchant.customers_exported' },
          orderBy: { createdAt: 'asc' },
          select: { actorType: true, merchantId: true, payload: true },
        }),
      ).toEqual([
        {
          actorType: 'PLATFORM_ADMIN',
          merchantId: cafe.merchantId,
          payload: { rows: 2 },
        },
        {
          actorType: 'STAFF',
          merchantId: cafe.merchantId,
          payload: { rows: 2 },
        },
      ]);
    });

    it('funciona archivado; un comercio inexistente da 404 y sin sesión de admin no entra', async () => {
      const cafe = await createClub('cafe', 'duena@cafe.com');
      await send('post', `/admin/merchants/${cafe.merchantId}/archive`).expect(
        200,
      );

      await send('get', `/admin/merchants/${cafe.merchantId}/export`).expect(
        200,
      );
      await send('get', `/admin/merchants/${randomUUID()}/export`).expect(404);
      await request(app.getHttpServer())
        .get(`/admin/merchants/${cafe.merchantId}/export`)
        .expect(401);
    });
  });
});
