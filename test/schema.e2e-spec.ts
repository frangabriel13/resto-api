import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';

// Cerradas para resto_app: solo las usa el admin.
const ADMIN_ONLY = ['merchant_profiles', 'piece_nfc_passwords', 'piece_scans'];
const CRUD = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
// La contraseña NFC es fija: ni el admin la modifica.
const ADMIN_PRIVILEGES: Record<string, string[]> = {
  piece_nfc_passwords: ['SELECT', 'INSERT', 'DELETE'],
};

describe('Schema de la base (e2e)', () => {
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

  describe('permisos', () => {
    it('todas las tablas son del migrador y los roles de la API leen y escriben las suyas', async () => {
      const rows = await prisma.$queryRaw<
        { table: string; owner: string; app: string[]; admin: string[] }[]
      >`
        SELECT tablename AS table, tableowner AS owner,
          ARRAY(SELECT privilege FROM unnest(${CRUD}::text[]) AS privilege
                WHERE has_table_privilege('resto_app', format('%I.%I', schemaname, tablename), privilege)
          ) AS app,
          ARRAY(SELECT privilege FROM unnest(${CRUD}::text[]) AS privilege
                WHERE has_table_privilege('resto_app_admin', format('%I.%I', schemaname, tablename), privilege)
          ) AS admin
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
        ORDER BY tablename`;

      expect(rows.map((r) => r.table)).toEqual([
        'audit_events',
        'customer_sessions',
        'customers',
        'memberships',
        'merchant_profiles',
        'merchants',
        'otp_challenges',
        'password_reset_tokens',
        'piece_nfc_passwords',
        'piece_scans',
        'pieces',
        'platform_admin_sessions',
        'platform_admins',
        'redemptions',
        'reward_rules',
        'staff_memberships',
        'staff_sessions',
        'staff_users',
        'stamps',
      ]);
      // Si una tabla fuera de un rol de la API, ese rol ignoraría RLS.
      for (const row of rows) {
        expect(row).toEqual({
          table: row.table,
          owner: 'resto_migrator',
          app: ADMIN_ONLY.includes(row.table) ? [] : CRUD,
          admin: ADMIN_PRIVILEGES[row.table] ?? CRUD,
        });
      }
    });
  });

  describe('restricciones', () => {
    const ids = {
      merchantA: '00000000-0000-7000-8000-00000000000a',
      merchantB: '00000000-0000-7000-8000-00000000000b',
      staffA: '00000000-0000-7000-8000-0000000000f1',
      staffB: '00000000-0000-7000-8000-0000000000f2',
      ruleA: '00000000-0000-7000-8000-0000000000a1',
      ruleB: '00000000-0000-7000-8000-0000000000b1',
      customer: '00000000-0000-7000-8000-0000000000c1',
      membershipA: '00000000-0000-7000-8000-0000000000d1',
    };

    beforeEach(async () => {
      await prisma.merchant.createMany({
        data: [
          { id: ids.merchantA, name: 'Café A', slug: 'cafe-a' },
          { id: ids.merchantB, name: 'Heladería B', slug: 'heladeria-b' },
        ],
      });
      await prisma.staffUser.createMany({
        data: [
          { id: ids.staffA, email: 'a@test', passwordHash: 'x', name: 'A' },
          { id: ids.staffB, email: 'b@test', passwordHash: 'x', name: 'B' },
        ],
      });
      await prisma.staffMembership.createMany({
        data: [
          {
            staffUserId: ids.staffA,
            merchantId: ids.merchantA,
            role: 'EMPLOYEE',
          },
          { staffUserId: ids.staffB, merchantId: ids.merchantB, role: 'OWNER' },
        ],
      });
      await prisma.rewardRule.createMany({
        data: [
          {
            id: ids.ruleA,
            merchantId: ids.merchantA,
            version: 1,
            stampsRequired: 8,
            rewardDescription: 'Café',
            active: true,
          },
          {
            id: ids.ruleB,
            merchantId: ids.merchantB,
            version: 1,
            stampsRequired: 6,
            rewardDescription: 'Helado',
            active: true,
          },
        ],
      });
      await prisma.customer.create({
        data: { id: ids.customer, name: 'Ana', phoneE164: '+5491100000001' },
      });
      await prisma.membership.create({
        data: {
          id: ids.membershipA,
          customerId: ids.customer,
          merchantId: ids.merchantA,
          currentCycleRewardRuleId: ids.ruleA,
        },
      });
    });

    const stampData = (overrides: Record<string, unknown> = {}) => ({
      merchantId: ids.merchantA,
      membershipId: ids.membershipA,
      cycle: 1,
      grantedByStaffId: ids.staffA,
      source: 'QR_SCAN' as const,
      idempotencyKey: 'k1',
      ...overrides,
    });

    const redemptionData = (idempotencyKey: string) => ({
      merchantId: ids.merchantA,
      membershipId: ids.membershipA,
      cycle: 1,
      rewardRuleId: ids.ruleA,
      stampsUsed: 8,
      carryOver: 0,
      confirmedByStaffId: ids.staffA,
      idempotencyKey,
    });

    it('un sello no puede apuntar a una membresía de otro comercio', async () => {
      await expectRejected(
        prisma.stamp.create({
          data: stampData({
            merchantId: ids.merchantB,
            grantedByStaffId: ids.staffB,
          }),
        }),
        'stamps_membership_id_merchant_id_fkey',
      );
    });

    it('un sello solo lo puede dar o anular staff de ese comercio', async () => {
      await expectRejected(
        prisma.stamp.create({
          data: stampData({ grantedByStaffId: ids.staffB }),
        }),
        'stamps_granted_by_staff_id_merchant_id_fkey',
      );
      const stamp = await prisma.stamp.create({ data: stampData() });
      await expectRejected(
        prisma.stamp.update({
          where: { id: stamp.id },
          data: { voidedAt: new Date(), voidedByStaffId: ids.staffB },
        }),
        'stamps_voided_by_staff_id_merchant_id_fkey',
      );
    });

    it('una anulación siempre registra quién la hizo', async () => {
      const stamp = await prisma.stamp.create({ data: stampData() });
      await expectRejected(
        prisma.stamp.update({
          where: { id: stamp.id },
          data: { voidedAt: new Date() },
        }),
        'stamps_voided_by_check',
      );
    });

    it('una membresía no puede quedar atada a la regla de otro comercio', async () => {
      await expectRejected(
        prisma.membership.update({
          where: { id: ids.membershipA },
          data: { currentCycleRewardRuleId: ids.ruleB },
        }),
        'memberships_current_cycle_reward_rule_id_merchant_id_fkey',
      );
    });

    it('la idempotency key es única por comercio', async () => {
      await prisma.stamp.create({ data: stampData() });
      await expectRejected(
        prisma.stamp.create({ data: stampData() }),
        'stamps_merchant_id_idempotency_key_key',
      );
    });

    it('hay como máximo una regla activa por comercio', async () => {
      await expectRejected(
        prisma.rewardRule.create({
          data: {
            merchantId: ids.merchantA,
            version: 2,
            stampsRequired: 10,
            rewardDescription: 'Otro',
            active: true,
          },
        }),
        'reward_rules_one_active_per_merchant',
      );
      await prisma.rewardRule.create({
        data: {
          merchantId: ids.merchantA,
          version: 2,
          stampsRequired: 10,
          rewardDescription: 'Otro',
          active: false,
        },
      });
    });

    it('hay un solo canje vigente por ciclo, y anulado se puede volver a canjear', async () => {
      const first = await prisma.redemption.create({
        data: redemptionData('r1'),
      });
      await expectRejected(
        prisma.redemption.create({ data: redemptionData('r2') }),
        'redemptions_one_valid_per_cycle',
      );
      await prisma.redemption.update({
        where: { id: first.id },
        data: { voidedAt: new Date(), voidedByStaffId: ids.staffA },
      });
      await prisma.redemption.create({ data: redemptionData('r3') });
    });

    it('rechaza valores imposibles', async () => {
      await expectRejected(
        prisma.rewardRule.create({
          data: {
            merchantId: ids.merchantB,
            version: 2,
            stampsRequired: 0,
            rewardDescription: 'X',
            active: false,
          },
        }),
        'reward_rules_stamps_required_check',
      );
      await expectRejected(
        prisma.redemption.create({
          data: { ...redemptionData('r1'), carryOver: -1 },
        }),
        'redemptions_carry_over_check',
      );
      await expectRejected(
        prisma.membership.update({
          where: { id: ids.membershipA },
          data: { currentCycle: 0 },
        }),
        'memberships_current_cycle_check',
      );
    });

    it('un cliente activo tiene nombre y teléfono, y uno borrado está anonimizado', async () => {
      await expectRejected(
        prisma.customer.create({ data: { phoneE164: '+5491100000002' } }),
        'customers_active_or_anonymized_check',
      );
      await expectRejected(
        prisma.customer.update({
          where: { id: ids.customer },
          data: { deletedAt: new Date() },
        }),
        'customers_active_or_anonymized_check',
      );
      await prisma.customer.update({
        where: { id: ids.customer },
        data: { deletedAt: new Date(), name: null, phoneE164: null },
      });
      await prisma.customer.create({ data: { deletedAt: new Date() } });
    });

    it('el consentimiento de marketing se registra con fecha', async () => {
      await expectRejected(
        prisma.membership.update({
          where: { id: ids.membershipA },
          data: { marketingConsent: true },
        }),
        'memberships_marketing_consent_at_check',
      );
    });

    it('una sesión de staff solo puede seleccionar uno de sus comercios', async () => {
      await expectRejected(
        prisma.staffSession.create({
          data: {
            staffUserId: ids.staffA,
            selectedMerchantId: ids.merchantB,
            tokenHash: 't1',
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
        'staff_sessions_staff_user_id_selected_merchant_id_fkey',
      );
    });

    it('una pieza tiene solo el campo de su destino', async () => {
      const piece = (code: string, data: Record<string, unknown>) =>
        prisma.piece.create({
          data: {
            merchantId: ids.merchantA,
            publicCode: code,
            label: 'Cartel',
            ...data,
          },
        });

      for (const [code, data] of [
        ['sin-link', { destination: 'GOOGLE_REVIEWS' }],
        ['club-con-ig', { instagramUsername: 'cafe' }],
        [
          'ig-con-mensaje',
          {
            destination: 'INSTAGRAM',
            instagramUsername: 'cafe',
            whatsappMessage: 'Hola',
          },
        ],
      ] as const) {
        await expectRejected(
          piece(code, data),
          'pieces_destination_fields_check',
        );
      }
      await piece('whatsapp', {
        destination: 'WHATSAPP',
        whatsappPhoneE164: '+5491123456789',
      });
    });

    it('la ficha comercial rechaza datos de Google imposibles o sin fecha', async () => {
      const takenOn = new Date('2026-10-20');
      const profile = (data: Record<string, unknown>) =>
        prisma.merchantProfile.create({
          data: { merchantId: ids.merchantA, ...data },
        });

      await expectRejected(
        profile({ googleRatingInitial: 5.5, googleDataTakenOn: takenOn }),
        'merchant_profiles_google_rating_initial_check',
      );
      await expectRejected(
        profile({ googleReviewsInitial: -1, googleDataTakenOn: takenOn }),
        'merchant_profiles_google_reviews_initial_check',
      );
      await expectRejected(
        profile({ googleRatingInitial: 4.5 }),
        'merchant_profiles_google_data_taken_on_check',
      );
      await expectRejected(
        profile({ googleDataTakenOn: takenOn }),
        'merchant_profiles_google_data_taken_on_check',
      );
    });
  });
});

async function expectRejected(operation: Promise<unknown>, constraint: string) {
  const error: unknown = await operation.then(
    () => {
      throw new Error(`La base aceptó la operación; se esperaba ${constraint}`);
    },
    (e: unknown) => e,
  );
  expect(describeError(error)).toContain(constraint);
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const meta = (error as { meta?: unknown }).meta;
  return `${error.message} ${JSON.stringify(meta ?? {})}`;
}
