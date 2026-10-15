import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}

let dummyHash: Promise<string> | undefined;

// Sin usuario igual se verifica un hash, para que el tiempo de respuesta no
// revele qué emails existen.
export async function verifyCredentialPassword(
  passwordHash: string | undefined,
  password: string,
): Promise<boolean> {
  dummyHash ??= hashPassword('contraseña-de-relleno');
  const valid = await verifyPassword(
    passwordHash ?? (await dummyHash),
    password,
  );
  return passwordHash !== undefined && valid;
}

// Sin caracteres ambiguos (0/O, 1/l/I): se dictan o se copian a mano.
const PASSWORD_ALPHABET =
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePassword(length = 16): string {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return password;
}
