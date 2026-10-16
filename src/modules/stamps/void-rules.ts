import type { StaffRole } from '../../generated/prisma/client.js';

export const EMPLOYEE_VOID_WINDOW_MS = 5 * 60 * 1000;

export type VoidDenial = 'ALREADY_VOIDED' | 'REDEEMED_CYCLE' | 'NOT_ALLOWED';

export type VoidCheck = {
  stamp: {
    grantedByStaffId: string;
    createdAt: Date;
    cycle: number;
    voidedAt: Date | null;
  };
  currentCycle: number;
  role: StaffRole;
  staffUserId: string;
  now: Date;
};

// El EMPLOYEE anula su propio sello en los primeros 5 minutos; el OWNER,
// cualquiera. Nunca un sello de un ciclo ya canjeado.
export function voidDenial({
  stamp,
  currentCycle,
  role,
  staffUserId,
  now,
}: VoidCheck): VoidDenial | null {
  if (stamp.voidedAt) return 'ALREADY_VOIDED';
  if (stamp.cycle < currentCycle) return 'REDEEMED_CYCLE';
  if (role === 'OWNER') return null;
  const ownStamp = stamp.grantedByStaffId === staffUserId;
  const withinWindow =
    now.getTime() - stamp.createdAt.getTime() <= EMPLOYEE_VOID_WINDOW_MS;
  return ownStamp && withinWindow ? null : 'NOT_ALLOWED';
}
