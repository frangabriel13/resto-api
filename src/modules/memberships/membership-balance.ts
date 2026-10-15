import type {
  Membership,
  Redemption,
  RewardRule,
  Stamp,
} from '../../generated/prisma/client.js';

export type BalanceInput = {
  membership: Pick<Membership, 'currentCycle' | 'currentCycleRewardRuleId'>;
  // La del ciclo actual, no la activa del comercio.
  cycleRule: Pick<RewardRule, 'id' | 'stampsRequired'>;
  // Todos, incluidos los anulados.
  stamps: Pick<Stamp, 'cycle' | 'voidedAt'>[];
  redemptions: Pick<Redemption, 'cycle' | 'carryOver' | 'voidedAt'>[];
};

export type MembershipBalance = {
  cycle: number;
  stampsRequired: number;
  cycleStamps: number;
  carryOver: number;
  balance: number;
  remaining: number;
  canRedeem: boolean;
  totalStamps: number;
};

export function calculateBalance(input: BalanceInput): MembershipBalance {
  const { membership, cycleRule, stamps, redemptions } = input;

  if (cycleRule.id !== membership.currentCycleRewardRuleId) {
    throw new Error(
      'calculateBalance recibió una regla que no es la del ciclo actual',
    );
  }

  const cycle = membership.currentCycle;
  const validStamps = stamps.filter((stamp) => stamp.voidedAt === null);
  const cycleStamps = validStamps.filter(
    (stamp) => stamp.cycle === cycle,
  ).length;

  const previousRedemption = redemptions.find(
    (redemption) =>
      redemption.voidedAt === null && redemption.cycle === cycle - 1,
  );
  const carryOver = previousRedemption?.carryOver ?? 0;

  const balance = cycleStamps + carryOver;
  const stampsRequired = cycleRule.stampsRequired;

  return {
    cycle,
    stampsRequired,
    cycleStamps,
    carryOver,
    balance,
    remaining: Math.max(0, stampsRequired - balance),
    canRedeem: balance >= stampsRequired,
    totalStamps: validStamps.length,
  };
}
