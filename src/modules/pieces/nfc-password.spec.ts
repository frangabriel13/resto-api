import { describe, expect, it } from 'vitest';
import { deriveKey } from '../../common/crypto.js';
import { decryptNfcPassword, encryptNfcPassword } from './nfc-password.js';

const key = deriveKey(
  'una-clave-de-prueba-de-mas-de-32-caracteres',
  'piece.nfc_password',
);

describe('encryptNfcPassword/decryptNfcPassword', () => {
  it('descifra lo que cifró, tal cual', () => {
    const encrypted = encryptNfcPassword(key, 'clave-del-chip-123');
    expect(decryptNfcPassword(key, encrypted)).toBe('clave-del-chip-123');
  });

  it('da un resultado distinto cada vez (iv al azar)', () => {
    const a = encryptNfcPassword(key, 'misma-clave');
    const b = encryptNfcPassword(key, 'misma-clave');
    expect(a).not.toBe(b);
  });

  it('no descifra con otra clave', () => {
    const otherKey = deriveKey(
      'una-clave-de-prueba-de-mas-de-32-caracteres',
      'otro-uso',
    );
    const encrypted = encryptNfcPassword(key, 'clave-del-chip-123');
    expect(() => decryptNfcPassword(otherKey, encrypted)).toThrow();
  });
});
