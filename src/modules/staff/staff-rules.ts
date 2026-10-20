import type { ErrorCode } from '../../common/errors/error-codes.js';
import type {
  MerchantStatus,
  StaffRole,
} from '../../generated/prisma/client.js';
import { isPanelEditable } from '../merchants/merchant-status.js';

export type StaffAction =
  'create' | 'deactivate' | 'reactivate' | 'reset_password';

// El panel gestiona solo empleados: los dueños los maneja FullSync. La baja y
// el reset se permiten con el club pausado o finalizado: son de seguridad.
export function staffActionDenial(
  action: StaffAction,
  target: { role: StaffRole } | null,
  merchantStatus: MerchantStatus,
): ErrorCode | null {
  if (target?.role === 'OWNER') return 'STAFF_IS_OWNER';
  const grantsAccess = action === 'create' || action === 'reactivate';
  if (grantsAccess && !isPanelEditable(merchantStatus)) {
    return 'MERCHANT_READ_ONLY';
  }
  return null;
}
