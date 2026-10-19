import type { MembershipBalance } from '../memberships/membership-balance.js';

export type RedemptionPlan = { stampsUsed: number; carryOver: number };

// Los sellos de más no se pierden: pasan al ciclo siguiente.
export function planRedemption({
  balance,
  stampsRequired,
}: Pick<
  MembershipBalance,
  'balance' | 'stampsRequired'
>): RedemptionPlan | null {
  if (balance < stampsRequired) return null;
  return { stampsUsed: stampsRequired, carryOver: balance - stampsRequired };
}
