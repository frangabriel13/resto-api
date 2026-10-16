import type { Prisma, StaffRole } from '../../generated/prisma/client.js';
import { maskPhone } from '../customers/phone.js';
import { calculateBalance } from './membership-balance.js';
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

export function toPanelMembership(
  membership: MembershipForPanel,
  role: StaffRole,
): PanelMembership {
  const { customer } = membership;
  const balance = calculateBalance({
    membership,
    cycleRule: membership.currentCycleRewardRule,
    stamps: membership.stamps,
    redemptions: membership.redemptions,
  });
  const phone = customer.phoneE164;
  return {
    id: membership.id,
    customer: {
      name: customer.name,
      phone: phone && role !== 'OWNER' ? maskPhone(phone) : phone,
    },
    cycle: balance.cycle,
    balance: balance.balance,
    stampsRequired: balance.stampsRequired,
    remaining: balance.remaining,
    canRedeem: balance.canRedeem,
    totalStamps: balance.totalStamps,
  };
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
