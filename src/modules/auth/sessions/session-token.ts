import { createHash, randomBytes } from 'node:crypto';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

// SHA-256 alcanza: el token ya es aleatorio, no hace falta un hash lento.
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
