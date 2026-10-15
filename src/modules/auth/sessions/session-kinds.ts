export type SessionKind = 'staff' | 'customer' | 'admin';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const SESSION_KINDS: Record<
  SessionKind,
  { cookieName: string; ttlMs: number }
> = {
  staff: { cookieName: 'fs_staff', ttlMs: 30 * DAY },
  customer: { cookieName: 'fs_customer', ttlMs: 180 * DAY },
  admin: { cookieName: 'fs_admin', ttlMs: 12 * HOUR },
};

// Evita escribir en la base en cada request.
export const SESSION_RENEW_AFTER_MS = HOUR;

export type AuthSession = {
  kind: SessionKind;
  sessionId: string;
  ownerId: string;
};
