import type { Prisma } from '../../generated/prisma/client.js';
import type { TenantScope } from '../../common/tenant/tenant-context.js';
import {
  lastValidStampAt,
  toPanelMembership,
} from '../memberships/panel-membership.js';
import {
  redemptionVoidDenial,
  validStampsInCycle,
} from '../redemptions/redemption-void-rules.js';
import { cooldownStatus } from '../stamps/cooldown.js';
import { voidDenial } from '../stamps/void-rules.js';
import type {
  CustomerDetail,
  CustomerHistoryEntry,
} from './panel-customers.schemas.js';

export const HISTORY_LIMIT = 100;

const staffName = {
  select: { staffUser: { select: { name: true } } },
} as const;

export const customerDetailInclude = {
  customer: true,
  currentCycleRewardRule: true,
  stamps: { include: { grantedBy: staffName, voidedBy: staffName } },
  redemptions: {
    include: { rewardRule: true, confirmedBy: staffName, voidedBy: staffName },
  },
} as const;

type MembershipWithDetail = Prisma.MembershipGetPayload<{
  include: typeof customerDetailInclude;
}>;

type Voidable = {
  voidedAt: Date | null;
  voidReason: string | null;
  voidedBy: { staffUser: { name: string } } | null;
};

export function toCustomerDetail(
  membership: MembershipWithDetail,
  scope: TenantScope,
  now: Date,
): CustomerDetail {
  return {
    membership: toPanelMembership(membership, scope.role),
    joinedAt: membership.joinedAt.toISOString(),
    leftAt: membership.leftAt?.toISOString() ?? null,
    marketingConsent: membership.marketingConsent,
    cooldown: cooldownStatus(
      lastValidStampAt(membership),
      scope.stampCooldownMinutes,
      now,
    ),
    history: toHistory(membership, scope, now),
  };
}

function toHistory(
  membership: MembershipWithDetail,
  scope: TenantScope,
  now: Date,
): CustomerHistoryEntry[] {
  const stamps = membership.stamps.map((stamp) => ({
    type: 'STAMP' as const,
    id: stamp.id,
    at: stamp.createdAt,
    cycle: stamp.cycle,
    source: stamp.source,
    cooldownOverride: stamp.cooldownOverride,
    grantedBy: stamp.grantedBy.staffUser.name,
    voided: toVoided(stamp),
    canVoid:
      voidDenial({
        stamp,
        currentCycle: membership.currentCycle,
        role: scope.role,
        staffUserId: scope.staffUserId,
        now,
      }) === null,
  }));
  const newCycleStamps = validStampsInCycle(
    membership.stamps,
    membership.currentCycle,
  );
  const redemptions = membership.redemptions.map((redemption) => ({
    type: 'REDEMPTION' as const,
    id: redemption.id,
    at: redemption.createdAt,
    cycle: redemption.cycle,
    stampsUsed: redemption.stampsUsed,
    carryOver: redemption.carryOver,
    rewardDescription: redemption.rewardRule.rewardDescription,
    confirmedBy: redemption.confirmedBy.staffUser.name,
    voided: toVoided(redemption),
    canVoid:
      redemptionVoidDenial({
        redemption,
        currentCycle: membership.currentCycle,
        newCycleStamps,
        role: scope.role,
      }) === null,
  }));
  return [...stamps, ...redemptions]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, HISTORY_LIMIT)
    .map((entry) => ({ ...entry, at: entry.at.toISOString() }));
}

function toVoided({ voidedAt, voidReason, voidedBy }: Voidable) {
  if (!voidedAt) return null;
  return {
    at: voidedAt.toISOString(),
    by: voidedBy?.staffUser.name ?? null,
    reason: voidReason,
  };
}
