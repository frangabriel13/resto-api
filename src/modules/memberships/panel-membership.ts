import type { Prisma, StaffRole } from '../../generated/prisma/client.js';
import { maskPhone } from '../customers/phone.js';
import {
  calculateBalance,
  type MembershipBalance,
} from './membership-balance.js';
import type { PanelMembership } from './panel-membership.schemas.js';

export const panelMembershipInclude = {
  customer: true,
  currentCycleRewardRule: true,
  stamps: { select: { cycle: true, voidedAt: true, createdAt: true } },
  redemptions: { select: { cycle: true, carryOver: true, voidedAt: true } },
} as const;

export type MembershipForPanel = Prisma.MembershipGetPayload<{
  include: typeof panelMembershipInclude;
}>;

export function panelBalance(
  membership: MembershipForPanel,
): MembershipBalance {
  return calculateBalance({
    membership,
    cycleRule: membership.currentCycleRewardRule,
    stamps: membership.stamps,
    redemptions: membership.redemptions,
  });
}

export function toPanelMembership(
  membership: MembershipForPanel,
  role: StaffRole,
): PanelMembership {
  const { customer } = membership;
  const balance = panelBalance(membership);
  return {
    id: membership.id,
    customer: {
      name: customer.name,
      phone: panelPhone(customer.phoneE164, role),
    },
    cycle: balance.cycle,
    balance: balance.balance,
    stampsRequired: balance.stampsRequired,
    remaining: balance.remaining,
    canRedeem: balance.canRedeem,
    totalStamps: balance.totalStamps,
  };
}

// Completo para el OWNER, enmascarado para el EMPLOYEE.
export function panelPhone(
  phoneE164: string | null,
  role: StaffRole,
): string | null {
  return phoneE164 && role !== 'OWNER' ? maskPhone(phoneE164) : phoneE164;
}

export function lastValidStampAt(membership: MembershipForPanel): Date | null {
  return membership.stamps
    .filter((stamp) => stamp.voidedAt === null)
    .reduce<Date | null>(
      (latest, stamp) =>
        latest && latest > stamp.createdAt ? latest : stamp.createdAt,
      null,
    );
}
