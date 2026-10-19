import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import {
  runWithSetting,
  type ScopeSetting,
} from './../src/common/request-scope/scoped-transaction.js';
import type { Prisma } from './../src/generated/prisma/client.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Las políticas RLS por sí solas, como resto_app y sin las extensiones de
// Prisma: es lo que queda si el código tiene un bug.
const WITH_RLS = [
  'audit_events',
  'customers',
  'memberships',
  'merchants',
  'pieces',
  'redemptions',
  'reward_rules',
  'staff_memberships',
  'stamps',
];
// Se leen antes de saber de quién es el request (ver la migración `rls`).
const WITHOUT_RLS = [
  'customer_sessions',
  'otp_challenges',
  'password_reset_tokens',
  'platform_admin_sessions',
  'platform_admins',
  'staff_sessions',
  'staff_users',
];
const RLS_VIOLATION = /row-level security/;

type Club = {
  merchantId: string;
  staffUserId: string;
  customerId: string;
  phone: string;
  membershipId: string;
  stampId: string;
};

describe('Row Level Security (e2e)', () => {
  let moduleRef: TestingModule;
  let runtime: PrismaService;
  let admin: PrismaAdminService;
  let a: Club;
  let b: Club;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    runtime = moduleRef.get(PrismaService);
    admin = moduleRef.get(PrismaAdminService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    a = await createClub(admin, 'cafe', '+5491123456789');
    b = await createClub(admin, 'heladeria', '+5491145678901');
  });

  const as = <T>(
    setting: ScopeSetting,
    value: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => runWithSetting(runtime, setting, value, work);
  const stampData = (club: Club) => ({
    merchantId: club.merchantId,
    membershipId: club.membershipId,
    cycle: 1,
    grantedByStaffId: club.staffUserId,
    source: 'MANUAL' as const,
    idempotencyKey: randomUUID(),
  });

  it('toda tabla tiene RLS activo y forzado, o está entre las exentas', async () => {
    const tables = await admin.$queryRaw<
      { name: string; enabled: boolean; forced: boolean }[]
    >`
      SELECT relname AS name, relrowsecurity AS enabled,
             relforcerowsecurity AS forced
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
        AND relname <> '_prisma_migrations'
      ORDER BY relname`;

    const protectedTables = Object.fromEntries(
      tables.map((t) => [t.name, t.enabled && t.forced]),
    );
    expect(protectedTables).toEqual({
      ...Object.fromEntries(WITH_RLS.map((name) => [name, true])),
      ...Object.fromEntries(WITHOUT_RLS.map((name) => [name, false])),
    });
  });

  it('sin contexto no ve datos del dominio ni puede escribirlos', async () => {
    expect(await runtime.membership.count()).toBe(0);
    expect(await runtime.customer.count()).toBe(0);
    expect(await runtime.stamp.count()).toBe(0);
    expect(await runtime.redemption.count()).toBe(0);
    expect(await runtime.auditEvent.count()).toBe(0);
    expect(await runtime.staffMembership.count()).toBe(0);
    // Datos públicos del comercio.
    expect(await runtime.merchant.count()).toBe(2);
    await expect(runtime.stamp.create({ data: stampData(a) })).rejects.toThrow(
      RLS_VIOLATION,
    );
    const renamed = await runtime.merchant.updateMany({
      data: { name: 'Hackeado' },
    });
    expect(renamed.count).toBe(0);
  });

  it('con un comercio ve solo lo suyo, aun con SQL a mano', async () => {
    const seen = await as('app.merchant_id', a.merchantId, async (tx) => ({
      stamps: await tx.$queryRaw<{ merchant_id: string }[]>`
        SELECT merchant_id::text FROM stamps`,
      memberships: await tx.membership.findMany(),
      customers: await tx.customer.findMany(),
      staff: await tx.staffMembership.findMany(),
      audit: await tx.auditEvent.findMany(),
      merchants: await tx.merchant.findMany(),
      rules: await tx.rewardRule.findMany(),
    }));

    expect(seen.stamps).toEqual([{ merchant_id: a.merchantId }]);
    expect(seen.memberships.map((m) => m.id)).toEqual([a.membershipId]);
    expect(seen.customers.map((c) => c.id)).toEqual([a.customerId]);
    expect(seen.staff.map((s) => s.merchantId)).toEqual([a.merchantId]);
    expect(seen.audit.map((e) => e.merchantId)).toEqual([a.merchantId]);
    // Públicos fuera del panel, pero dentro solo los del propio comercio.
    expect(seen.merchants.map((m) => m.id)).toEqual([a.merchantId]);
    expect(seen.rules.map((r) => r.merchantId)).toEqual([a.merchantId]);
  });

  it('con un comercio no escribe en otro', async () => {
    await expect(
      as('app.merchant_id', a.merchantId, (tx) =>
        tx.stamp.create({ data: stampData(b) }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);

    const updated = await as('app.merchant_id', a.merchantId, async (tx) => ({
      otherStamp: await tx.stamp.updateMany({
        where: { id: b.stampId },
        data: { cooldownOverride: true },
      }),
      otherMerchant: await tx.merchant.updateMany({
        where: { id: b.merchantId },
        data: { name: 'Hackeado' },
      }),
      ownMerchant: await tx.merchant.updateMany({
        where: { id: a.merchantId },
        data: { name: 'Café nuevo' },
      }),
    }));
    expect(updated).toEqual({
      otherStamp: { count: 0 },
      otherMerchant: { count: 0 },
      ownMerchant: { count: 1 },
    });
  });

  it('un cliente ve lo suyo, de solo lectura en sellos', async () => {
    const seen = await as('app.customer_id', a.customerId, async (tx) => ({
      customers: await tx.customer.findMany(),
      memberships: await tx.membership.findMany(),
      stamps: await tx.stamp.findMany(),
    }));

    expect(seen.customers.map((c) => c.id)).toEqual([a.customerId]);
    expect(seen.memberships.map((m) => m.id)).toEqual([a.membershipId]);
    expect(seen.stamps.map((s) => s.id)).toEqual([a.stampId]);
    await expect(
      as('app.customer_id', a.customerId, (tx) =>
        tx.stamp.create({ data: stampData(a) }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it('por teléfono solo ve y crea al cliente de ese teléfono', async () => {
    const newPhone = '+5491156781234';
    const seen = await as('app.customer_phone', a.phone, (tx) =>
      tx.customer.findMany(),
    );
    expect(seen.map((c) => c.id)).toEqual([a.customerId]);

    await expect(
      as('app.customer_phone', newPhone, (tx) =>
        tx.customer.create({ data: { name: 'Otro', phoneE164: a.phone } }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
    await as('app.customer_phone', newPhone, (tx) =>
      tx.customer.create({ data: { name: 'Nuevo', phoneE164: newPhone } }),
    );
  });

  it('un usuario de staff ve sus comercios y nada del dominio', async () => {
    const seen = await as('app.staff_user_id', a.staffUserId, async (tx) => ({
      staff: await tx.staffMembership.findMany(),
      memberships: await tx.membership.count(),
    }));
    expect(seen.staff.map((s) => s.merchantId)).toEqual([a.merchantId]);
    expect(seen.memberships).toBe(0);
  });
});

async function createClub(
  admin: PrismaAdminService,
  slug: string,
  phone: string,
): Promise<Club> {
  const merchant = await admin.merchant.create({
    data: { name: slug, slug, status: 'ACTIVE' },
  });
  const merchantId = merchant.id;
  const rule = await admin.rewardRule.create({
    data: {
      merchantId,
      version: 1,
      stampsRequired: 8,
      rewardDescription: 'Premio',
      active: true,
    },
  });
  const staff = await admin.staffUser.create({
    data: {
      email: `empleado@${slug}.com`,
      name: 'Empleado',
      passwordHash: 'x',
      memberships: { create: { merchantId, role: 'EMPLOYEE' } },
    },
  });
  const customer = await admin.customer.create({
    data: { name: `Cliente de ${slug}`, phoneE164: phone },
  });
  const membership = await admin.membership.create({
    data: {
      merchantId,
      customerId: customer.id,
      currentCycleRewardRuleId: rule.id,
    },
  });
  const stamp = await admin.stamp.create({
    data: {
      merchantId,
      membershipId: membership.id,
      cycle: 1,
      grantedByStaffId: staff.id,
      source: 'QR_SCAN',
      idempotencyKey: randomUUID(),
    },
  });
  await admin.auditEvent.create({
    data: {
      merchantId,
      actorType: 'STAFF',
      actorId: staff.id,
      action: 'stamp.created',
      entityType: 'stamp',
      entityId: stamp.id,
    },
  });
  return {
    merchantId,
    staffUserId: staff.id,
    customerId: customer.id,
    phone,
    membershipId: membership.id,
    stampId: stamp.id,
  };
}
