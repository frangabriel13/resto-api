import type {
  Prisma,
  PrismaClient,
  StaffRole,
} from '../../../src/generated/prisma/client.js';
import { hashPassword } from '../../../src/common/passwords.js';
import {
  DEMO_CUSTOMERS,
  DEMO_EMPLOYEE_EMAIL,
  DEMO_MERCHANT,
  DEMO_MERCHANT_SLUG,
  DEMO_OWNER_EMAIL,
  DEMO_PHONE_PREFIX,
  DEMO_PIECE_CODE,
  DEMO_RULE,
  DEMO_STAFF_EMAIL_DOMAIN,
  type DemoCustomer,
} from './demo-fixtures.js';

type Tx = Prisma.TransactionClient;

type DemoContext = {
  tx: Tx;
  now: Date;
  merchantId: string;
  ruleId: string;
  pieceId: string;
  ownerId: string;
  employeeId: string;
};

export type DemoSummary = {
  merchantId: string;
  customers: number;
  stamps: number;
  redemptions: number;
};

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export async function seedDemo(
  prisma: PrismaClient,
  options: { staffPassword: string; now?: Date },
): Promise<DemoSummary> {
  const passwordHash = await hashPassword(options.staffPassword);
  const now = options.now ?? new Date();

  return prisma.$transaction(
    async (tx) => {
      await deleteDemo(tx);
      const ctx = await createClub(tx, passwordHash, now);
      for (const [index, demo] of DEMO_CUSTOMERS.entries()) {
        await createCustomerHistory(ctx, demo, index);
      }
      return summarize(tx, ctx.merchantId);
    },
    { timeout: 30_000 },
  );
}

async function deleteDemo(tx: Tx) {
  const merchant = await tx.merchant.findUnique({
    where: { slug: DEMO_MERCHANT_SLUG },
  });
  if (merchant) await deleteMerchantData(tx, merchant.id);

  // Solo los que no quedaron en otro comercio.
  await tx.customer.deleteMany({
    where: {
      phoneE164: { startsWith: DEMO_PHONE_PREFIX },
      memberships: { none: {} },
    },
  });
  await tx.staffUser.deleteMany({
    where: {
      email: { endsWith: DEMO_STAFF_EMAIL_DOMAIN },
      memberships: { none: {} },
    },
  });
}

async function deleteMerchantData(tx: Tx, merchantId: string) {
  const byMerchant = { where: { merchantId } };
  await tx.stamp.deleteMany(byMerchant);
  await tx.redemption.deleteMany(byMerchant);
  await tx.membership.deleteMany(byMerchant);
  await tx.staffSession.deleteMany({
    where: { selectedMerchantId: merchantId },
  });
  await tx.staffMembership.deleteMany(byMerchant);
  await tx.piece.deleteMany(byMerchant);
  await tx.rewardRule.deleteMany(byMerchant);
  await tx.auditEvent.deleteMany(byMerchant);
  await tx.merchant.delete({ where: { id: merchantId } });
}

async function createClub(
  tx: Tx,
  passwordHash: string,
  now: Date,
): Promise<DemoContext> {
  const merchant = await tx.merchant.create({ data: DEMO_MERCHANT });
  const merchantId = merchant.id;
  const rule = await tx.rewardRule.create({
    data: { ...DEMO_RULE, merchantId },
  });
  const piece = await tx.piece.create({
    data: { merchantId, publicCode: DEMO_PIECE_CODE, label: 'Mostrador' },
  });
  const staff = { tx, merchantId, passwordHash };
  const ownerId = await createStaff(
    staff,
    DEMO_OWNER_EMAIL,
    'Dueño Demo',
    'OWNER',
  );
  const employeeId = await createStaff(
    staff,
    DEMO_EMPLOYEE_EMAIL,
    'Empleado Demo',
    'EMPLOYEE',
  );

  return {
    tx,
    now,
    merchantId,
    ruleId: rule.id,
    pieceId: piece.id,
    ownerId,
    employeeId,
  };
}

async function createStaff(
  {
    tx,
    merchantId,
    passwordHash,
  }: { tx: Tx; merchantId: string; passwordHash: string },
  email: string,
  name: string,
  role: StaffRole,
): Promise<string> {
  // Sin cambio obligatorio de contraseña: la cuenta es para mostrar el panel.
  const data = { name, passwordHash, mustChangePassword: false };
  const user = await tx.staffUser.upsert({
    where: { email },
    create: { email, ...data },
    update: data,
  });
  await tx.staffMembership.create({
    data: { staffUserId: user.id, merchantId, role },
  });
  return user.id;
}

async function createCustomerHistory(
  ctx: DemoContext,
  demo: DemoCustomer,
  index: number,
) {
  const stampDates = spreadStampDates(ctx.now, demo, 10 + index);
  const joinedAt = new Date(
    (stampDates[0] ?? daysAgo(ctx.now, 1, 18)).getTime() - 60 * MINUTE,
  );
  const membershipId = await createMembership(ctx, demo, joinedAt);

  for (const [i, createdAt] of stampDates.entries()) {
    await createStamp(ctx, membershipId, demo, i, createdAt);
    if (demo.cycle2Stamps !== undefined && i === demo.cycle1Stamps - 1) {
      await createRedemption(ctx, membershipId, demo, createdAt);
    }
  }
  if (demo.voidedStamp) await createVoidedStamp(ctx, membershipId, demo);
}

// Un sello cada dos días hasta ayer, a la misma hora.
function spreadStampDates(now: Date, demo: DemoCustomer, hour: number): Date[] {
  const total = demo.cycle1Stamps + (demo.cycle2Stamps ?? 0);
  return Array.from({ length: total }, (_, i) =>
    daysAgo(now, (total - i) * 2, hour),
  );
}

async function createMembership(
  { tx, merchantId, ruleId, pieceId }: DemoContext,
  demo: DemoCustomer,
  joinedAt: Date,
): Promise<string> {
  const customer = await tx.customer.create({
    data: {
      name: demo.name,
      phoneE164: `${DEMO_PHONE_PREFIX}${demo.phoneSuffix}`,
      phoneVerifiedAt: joinedAt,
      createdAt: joinedAt,
    },
  });
  const membership = await tx.membership.create({
    data: {
      customerId: customer.id,
      merchantId,
      currentCycle: demo.cycle2Stamps === undefined ? 1 : 2,
      currentCycleRewardRuleId: ruleId,
      joinedViaPieceId: pieceId,
      marketingConsent: demo.marketingConsent,
      marketingConsentAt: demo.marketingConsent ? joinedAt : null,
      joinedAt,
    },
  });
  return membership.id;
}

async function createStamp(
  { tx, merchantId, ownerId, employeeId }: DemoContext,
  membershipId: string,
  demo: DemoCustomer,
  index: number,
  createdAt: Date,
) {
  await tx.stamp.create({
    data: {
      merchantId,
      membershipId,
      cycle: index < demo.cycle1Stamps ? 1 : 2,
      grantedByStaffId: index % 3 === 2 ? ownerId : employeeId,
      source: demo.manualFirstStamp && index === 0 ? 'MANUAL' : 'QR_SCAN',
      idempotencyKey: `demo-stamp-${demo.phoneSuffix}-${index + 1}`,
      createdAt,
    },
  });
}

async function createRedemption(
  { tx, merchantId, ruleId, employeeId }: DemoContext,
  membershipId: string,
  demo: DemoCustomer,
  lastStampAt: Date,
) {
  await tx.redemption.create({
    data: {
      merchantId,
      membershipId,
      cycle: 1,
      rewardRuleId: ruleId,
      stampsUsed: DEMO_RULE.stampsRequired,
      carryOver: demo.cycle1Stamps - DEMO_RULE.stampsRequired,
      confirmedByStaffId: employeeId,
      idempotencyKey: `demo-redemption-${demo.phoneSuffix}`,
      createdAt: new Date(lastStampAt.getTime() + 5 * MINUTE),
    },
  });
}

async function createVoidedStamp(
  { tx, now, merchantId, ownerId, employeeId }: DemoContext,
  membershipId: string,
  demo: DemoCustomer,
) {
  const createdAt = daysAgo(now, 1, 17);
  await tx.stamp.create({
    data: {
      merchantId,
      membershipId,
      cycle: 1,
      grantedByStaffId: employeeId,
      source: 'QR_SCAN',
      idempotencyKey: `demo-stamp-${demo.phoneSuffix}-anulado`,
      createdAt,
      voidedAt: new Date(createdAt.getTime() + 10 * MINUTE),
      voidedByStaffId: ownerId,
      voidReason: 'Sello cargado dos veces',
    },
  });
}

async function summarize(tx: Tx, merchantId: string): Promise<DemoSummary> {
  const byMerchant = { where: { merchantId } };
  return {
    merchantId,
    customers: await tx.membership.count(byMerchant),
    stamps: await tx.stamp.count(byMerchant),
    redemptions: await tx.redemption.count(byMerchant),
  };
}

// `hour` en hora de Buenos Aires (UTC-3 todo el año).
function daysAgo(now: Date, days: number, hour: number): Date {
  const date = new Date(now.getTime() - days * DAY);
  date.setUTCHours(hour + 3, 0, 0, 0);
  return date;
}
