import type { Stamp, StaffRole } from '../../generated/prisma/client.js';

export type RedemptionVoidDenial =
  'NOT_ALLOWED' | 'ALREADY_VOIDED' | 'NOT_LAST' | 'NEW_CYCLE_HAS_STAMPS';

export type RedemptionVoidCheck = {
  redemption: { cycle: number; voidedAt: Date | null };
  currentCycle: number;
  // Sellos válidos del ciclo actual, que es el que abrió este canje.
  newCycleStamps: number;
  role: StaffRole;
};

// Solo el OWNER, solo el canje que cerró el ciclo anterior y solo mientras
// el ciclo nuevo esté vacío: si no, esos sellos quedarían en un ciclo que
// deja de existir.
export function redemptionVoidDenial({
  redemption,
  currentCycle,
  newCycleStamps,
  role,
}: RedemptionVoidCheck): RedemptionVoidDenial | null {
  if (role !== 'OWNER') return 'NOT_ALLOWED';
  if (redemption.voidedAt) return 'ALREADY_VOIDED';
  if (redemption.cycle !== currentCycle - 1) return 'NOT_LAST';
  if (newCycleStamps > 0) return 'NEW_CYCLE_HAS_STAMPS';
  return null;
}

export function validStampsInCycle(
  stamps: Pick<Stamp, 'cycle' | 'voidedAt'>[],
  cycle: number,
): number {
  return stamps.filter((s) => s.cycle === cycle && s.voidedAt === null).length;
}
