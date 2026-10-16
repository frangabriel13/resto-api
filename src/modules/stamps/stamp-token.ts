import { hmacBase64Url, safeEqual } from '../../common/crypto.js';

const VERSION = 'v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type StampToken = { membershipId: string; expiresAt: Date };

export function signStampToken(
  key: Buffer,
  membershipId: string,
  expiresAt: Date,
): string {
  const payload = `${VERSION}.${membershipId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${payload}.${hmacBase64Url(key, payload)}`;
}

// Valida formato y firma; el vencimiento lo decide quien lo usa.
export function readStampToken(key: Buffer, token: string): StampToken | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [version, membershipId, expiresAt, signature] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (
    version !== VERSION ||
    !UUID.test(membershipId) ||
    !/^\d+$/.test(expiresAt)
  ) {
    return null;
  }
  const payload = `${version}.${membershipId}.${expiresAt}`;
  if (!safeEqual(hmacBase64Url(key, payload), signature)) return null;
  return { membershipId, expiresAt: new Date(Number(expiresAt) * 1000) };
}
