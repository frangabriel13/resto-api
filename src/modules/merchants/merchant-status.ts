import type { MerchantStatus } from '../../generated/prisma/client.js';

const ALLOWED_TRANSITIONS: Record<MerchantStatus, MerchantStatus[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['PAUSED', 'ENDED'],
  PAUSED: ['ACTIVE', 'ENDED'],
  ENDED: [],
};

export function isAllowedTransition(
  from: MerchantStatus,
  to: MerchantStatus,
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

// Con el club pausado o finalizado, el panel queda en modo consulta: no se
// cambian ni la regla ni la configuración.
export function isPanelEditable(status: MerchantStatus): boolean {
  return status === 'DRAFT' || status === 'ACTIVE';
}
