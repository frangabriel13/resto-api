import { randomInt } from 'node:crypto';
import { hmacHex, safeEqual } from '../../../common/crypto.js';

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Atado al teléfono: el hash de un código no sirve para otro número.
export function hashOtpCode(key: Buffer, phoneE164: string, code: string) {
  return hmacHex(key, `${phoneE164}:${code}`);
}

export function otpCodeMatches(
  key: Buffer,
  phoneE164: string,
  code: string,
  codeHash: string,
): boolean {
  return safeEqual(hashOtpCode(key, phoneE164, code), codeHash);
}
