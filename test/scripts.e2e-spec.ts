import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { verifyPassword } from './../src/common/passwords.js';
import { calculateBalance } from './../src/modules/memberships/membership-balance.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import {
  DEMO_EMPLOYEE_EMAIL,
  DEMO_MERCHANT_SLUG,
  DEMO_OWNER_EMAIL,
  DEMO_PHONE_PREFIX,
} from './../scripts/lib/demo/demo-fixtures.js';
import { seedDemo } from './../scripts/lib/demo/seed-demo.js';
import { createOrResetPlatformAdmin } from './../scripts/lib/platform-admin.js';
import { decryptNfcPassword } from './../src/modules/pieces/nfc-password.js';

const DEMO_OPTIONS = {
  staffPassword: 'clave-demo',
  nfcPasswordKey: Buffer.alloc(32, 7),
};

describe('Scripts de datos (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaAdminService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaAdminService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  describe('seed de demo', () => {
    const counts = async () => ({
      merchants: await prisma.merchant.count({
        where: { slug: DEMO_MERCHANT_SLUG },
      }),
      staff: await prisma.staffUser.count(),
      customers: await prisma.customer.count(),
      stamps: await prisma.stamp.count(),
      redemptions: await prisma.redemption.count(),
    });

    it('crea el comercio activo con su regla, pieza, staff y clientes [DEMO]', async () => {
      await seedDemo(prisma, DEMO_OPTIONS);

      const merchant = await prisma.merchant.findUniqueOrThrow({
        where: { slug: DEMO_MERCHANT_SLUG },
        include: {
          rewardRules: true,
          pieces: { include: { nfcPassword: true } },
          staffMemberships: true,
        },
      });
      expect(merchant.status).toBe('ACTIVE');
      expect(merchant.rewardRules).toMatchObject([
        { version: 1, active: true, stampsRequired: 8 },
      ]);
      expect(merchant.pieces).toHaveLength(1);
      const [piece] = merchant.pieces;
      expect(
        decryptNfcPassword(
          DEMO_OPTIONS.nfcPasswordKey,
          piece!.id,
          piece!.nfcPassword!.encrypted,
        ),
      ).toMatch(/^[0-9A-F]{8}$/);
      expect(merchant.staffMemberships.map((m) => m.role).sort()).toEqual([
        'EMPLOYEE',
        'OWNER',
      ]);

      const customers = await prisma.customer.findMany();
      expect(customers).toHaveLength(6);
      for (const customer of customers) {
        expect(customer.name).toMatch(/^\[DEMO\] /);
        expect(customer.phoneE164?.startsWith(DEMO_PHONE_PREFIX)).toBe(true);
      }

      const redeemed = await prisma.membership.findFirstOrThrow({
        where: { currentCycle: 2 },
        include: { redemptions: true, stamps: true },
      });
      expect(redeemed.redemptions).toMatchObject([
        { cycle: 1, stampsUsed: 8, carryOver: 1 },
      ]);
      expect(redeemed.stamps.filter((s) => s.cycle === 2)).toHaveLength(2);

      for (const email of [DEMO_OWNER_EMAIL, DEMO_EMPLOYEE_EMAIL]) {
        const user = await prisma.staffUser.findUniqueOrThrow({
          where: { email },
        });
        expect(user.mustChangePassword).toBe(false);
        await expect(
          verifyPassword(user.passwordHash, 'clave-demo'),
        ).resolves.toBe(true);
      }
    });

    it('cada cliente queda con el saldo que muestra la demo', async () => {
      await seedDemo(prisma, DEMO_OPTIONS);
      const memberships = await prisma.membership.findMany({
        include: {
          customer: true,
          currentCycleRewardRule: true,
          stamps: true,
          redemptions: true,
        },
      });

      const balances = Object.fromEntries(
        memberships.map((m) => {
          const b = calculateBalance({
            membership: m,
            cycleRule: m.currentCycleRewardRule,
            stamps: m.stamps,
            redemptions: m.redemptions,
          });
          return [
            m.customer.name,
            [b.cycle, b.balance, b.canRedeem, b.totalStamps],
          ];
        }),
      );
      // [ciclo, saldo, puede canjear, total histórico]
      expect(balances).toEqual({
        '[DEMO] Ana Gómez': [1, 3, false, 3],
        '[DEMO] Bruno Díaz': [1, 7, false, 7],
        '[DEMO] Carla Pérez': [1, 8, true, 8],
        '[DEMO] Diego Romero': [2, 3, false, 11],
        '[DEMO] Elena Suárez': [1, 1, false, 1],
        '[DEMO] Facundo Ruiz': [1, 0, false, 0],
      });
    });

    it('se puede correr varias veces y queda igual', async () => {
      await seedDemo(prisma, DEMO_OPTIONS);
      const first = await counts();
      await seedDemo(prisma, DEMO_OPTIONS);
      expect(await counts()).toEqual(first);
      expect(first.merchants).toBe(1);
    });

    it('se puede volver a correr aunque tenga ficha y escaneos', async () => {
      await seedDemo(prisma, DEMO_OPTIONS);
      const demo = await prisma.merchant.findUniqueOrThrow({
        where: { slug: DEMO_MERCHANT_SLUG },
      });
      const piece = await prisma.piece.findFirstOrThrow({
        where: { merchantId: demo.id },
      });
      await prisma.merchantProfile.create({
        data: { merchantId: demo.id, notes: 'Cargada desde el admin' },
      });
      await prisma.pieceScan.create({
        data: { pieceId: piece.id, merchantId: demo.id, destination: 'CLUB' },
      });

      await seedDemo(prisma, DEMO_OPTIONS);
      expect(await prisma.merchantProfile.count()).toBe(0);
      expect(await prisma.pieceScan.count()).toBe(0);
      expect(await prisma.pieceNfcPassword.count()).toBe(1);
    });

    it('reutiliza a un cliente [DEMO] que también está en otro comercio', async () => {
      await seedDemo(prisma, DEMO_OPTIONS);
      const demoCustomer = await prisma.customer.findFirstOrThrow({
        where: { name: '[DEMO] Ana Gómez' },
      });
      const other = await prisma.merchant.create({
        data: { name: 'Otro', slug: 'otro' },
      });
      const rule = await prisma.rewardRule.create({
        data: {
          merchantId: other.id,
          version: 1,
          stampsRequired: 5,
          rewardDescription: 'Café',
          active: true,
        },
      });
      const elsewhere = await prisma.membership.create({
        data: {
          customerId: demoCustomer.id,
          merchantId: other.id,
          currentCycleRewardRuleId: rule.id,
        },
      });
      const before = await counts();

      await seedDemo(prisma, DEMO_OPTIONS);

      expect(await counts()).toEqual(before);
      const demoMemberships = await prisma.membership.findMany({
        where: { customerId: demoCustomer.id },
        include: { merchant: true },
      });
      expect(demoMemberships.map((m) => m.merchant.slug).sort()).toEqual([
        DEMO_MERCHANT_SLUG,
        'otro',
      ]);
      await expect(
        prisma.membership.findUnique({ where: { id: elsewhere.id } }),
      ).resolves.not.toBeNull();
    });

    it('no toca datos que no son de la demo', async () => {
      const other = await prisma.merchant.create({
        data: { name: 'Otro', slug: 'otro' },
      });
      const customer = await prisma.customer.create({
        data: { name: 'Real', phoneE164: '+5491155550000' },
      });
      const staff = await prisma.staffUser.create({
        data: { email: 'real@otro.com', passwordHash: 'x', name: 'Real' },
      });

      await seedDemo(prisma, DEMO_OPTIONS);
      await seedDemo(prisma, DEMO_OPTIONS);

      await expect(
        prisma.merchant.findUnique({ where: { id: other.id } }),
      ).resolves.not.toBeNull();
      await expect(
        prisma.customer.findUnique({ where: { id: customer.id } }),
      ).resolves.not.toBeNull();
      await expect(
        prisma.staffUser.findUnique({ where: { id: staff.id } }),
      ).resolves.not.toBeNull();
    });
  });

  describe('alta de PlatformAdmin', () => {
    it('crea el admin con el email normalizado y una contraseña que funciona', async () => {
      const result = await createOrResetPlatformAdmin(prisma, {
        email: ' Ana@FullSync.Test ',
        name: 'Ana',
      });
      expect(result).toMatchObject({
        email: 'ana@fullsync.test',
        created: true,
      });
      const admin = await prisma.platformAdmin.findUniqueOrThrow({
        where: { email: 'ana@fullsync.test' },
      });
      await expect(
        verifyPassword(admin.passwordHash, result.password),
      ).resolves.toBe(true);
    });

    it('si ya existe, cambia la contraseña y cierra sus sesiones', async () => {
      const first = await createOrResetPlatformAdmin(prisma, {
        email: 'ana@fullsync.test',
        name: 'Ana',
      });
      const admin = await prisma.platformAdmin.findUniqueOrThrow({
        where: { email: 'ana@fullsync.test' },
      });
      await prisma.platformAdminSession.create({
        data: {
          platformAdminId: admin.id,
          tokenHash: 'sesion-vieja',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const second = await createOrResetPlatformAdmin(prisma, {
        email: 'ana@fullsync.test',
      });
      expect(second.created).toBe(false);

      const updated = await prisma.platformAdmin.findUniqueOrThrow({
        where: { id: admin.id },
        include: { sessions: true },
      });
      expect(updated.name).toBe('Ana');
      await expect(
        verifyPassword(updated.passwordHash, first.password),
      ).resolves.toBe(false);
      await expect(
        verifyPassword(updated.passwordHash, second.password),
      ).resolves.toBe(true);
      expect(updated.sessions[0]?.revokedAt).not.toBeNull();
    });

    it('pide el nombre para crear uno nuevo y rechaza emails inválidos', async () => {
      await expect(
        createOrResetPlatformAdmin(prisma, { email: 'nuevo@fullsync.test' }),
      ).rejects.toThrow('hace falta --name');
      await expect(
        createOrResetPlatformAdmin(prisma, { email: 'no-es-email', name: 'X' }),
      ).rejects.toThrow();
      await expect(prisma.platformAdmin.count()).resolves.toBe(0);
    });
  });
});
