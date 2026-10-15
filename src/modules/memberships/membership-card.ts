import type { Prisma, RewardRule } from '../../generated/prisma/client.js';
import type {
  HistoryEntry,
  MembershipCard,
} from './membership-card.schemas.js';
import { calculateBalance } from './membership-balance.js';

export const HISTORY_LIMIT = 50;

export const cardInclude = {
  merchant: { include: { rewardRules: { where: { active: true } } } },
  currentCycleRewardRule: true,
  stamps: true,
  redemptions: { include: { rewardRule: true } },
} as const;

export type MembershipWithCard = Prisma.MembershipGetPayload<{
  include: typeof cardInclude;
}>;

export function toCard(membership: MembershipWithCard): MembershipCard {
  const { merchant, currentCycleRewardRule: cycleRule } = membership;
  const { stampsRequired: _, ...balance } = calculateBalance({
    membership,
    cycleRule,
    stamps: membership.stamps,
    redemptions: membership.redemptions,
  });
  const [activeRule] = merchant.rewardRules;

  return {
    id: membership.id,
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      logoUrl: merchant.logoUrl,
      primaryColor: merchant.primaryColor,
      secondaryColor: merchant.secondaryColor,
      googleReviewUrl: merchant.googleReviewUrl,
      status: merchant.status,
    },
    cycleRule: toRule(cycleRule),
    nextCycleRule:
      activeRule && activeRule.id !== cycleRule.id ? toRule(activeRule) : null,
    ...balance,
    marketingConsent: membership.marketingConsent,
    joinedAt: membership.joinedAt.toISOString(),
    history: toHistory(membership),
  };
}

function toRule(rule: RewardRule) {
  return {
    stampsRequired: rule.stampsRequired,
    rewardDescription: rule.rewardDescription,
    conditions: rule.conditions,
  };
}

function toHistory(membership: MembershipWithCard): HistoryEntry[] {
  const stamps = membership.stamps.map((stamp) => ({
    type: 'STAMP' as const,
    id: stamp.id,
    at: stamp.createdAt,
    cycle: stamp.cycle,
    voided: stamp.voidedAt !== null,
  }));
  const redemptions = membership.redemptions.map((redemption) => ({
    type: 'REDEMPTION' as const,
    id: redemption.id,
    at: redemption.createdAt,
    cycle: redemption.cycle,
    voided: redemption.voidedAt !== null,
    rewardDescription: redemption.rewardRule.rewardDescription,
  }));
  return [...stamps, ...redemptions]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, HISTORY_LIMIT)
    .map((entry) => ({ ...entry, at: entry.at.toISOString() }));
}
