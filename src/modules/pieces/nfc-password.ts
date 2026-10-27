import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

// El PWD del NTAG213 son 4 bytes: 8 caracteres hexadecimales.
export function generateNfcPassword(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export function parseNfcPasswordKey(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

// El id de la pieza va como dato asociado: copiado a otra pieza no se descifra.
// El prefijo de versión deja rotar la clave sin cambiar la tabla.
export function encryptNfcPassword(
  key: Buffer,
  pieceId: string,
  password: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv).setAAD(
    Buffer.from(pieceId),
  );
  const encrypted = Buffer.concat([cipher.update(password), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), encrypted]
    .map((part) =>
      typeof part === 'string' ? part : part.toString('base64url'),
    )
    .join('.');
}

export function decryptNfcPassword(
  key: Buffer,
  pieceId: string,
  stored: string,
): string {
  const [version, iv, tag, encrypted, ...rest] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !encrypted || rest.length) {
    throw new Error('Formato de contraseña NFC desconocido');
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64url'),
  )
    .setAAD(Buffer.from(pieceId))
    .setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString();
}
