import type { Membership } from '../../generated/prisma/client.js';

// Salir del club revoca el consentimiento de marketing; la fila, el ciclo y
// los sellos quedan, por si vuelve.
export function leaveClubData(
  membership: Pick<Membership, 'marketingConsent'>,
  now: Date,
) {
  return {
    leftAt: now,
    marketingConsent: false,
    ...(membership.marketingConsent ? { marketingConsentRevokedAt: now } : {}),
  };
}
