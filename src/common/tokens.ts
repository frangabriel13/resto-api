import { createHash, randomBytes } from 'node:crypto';

// Tokens de un solo dueño (sesiones, reset de contraseña): se guardan solo
// hasheados.
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// SHA-256 alcanza: el token ya es aleatorio, no hace falta un hash lento.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
