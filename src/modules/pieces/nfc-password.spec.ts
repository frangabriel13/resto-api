import { randomBytes } from 'node:crypto';
import {
  decryptNfcPassword,
  encryptNfcPassword,
  generateNfcPassword,
} from './nfc-password.js';

const key = randomBytes(32);
const pieceId = '01a17e4b-a7d4-7085-afdd-bc4058a25161';

describe('contraseña NFC', () => {
  it('son 8 caracteres hexadecimales al azar', () => {
    const passwords = new Set(
      Array.from({ length: 50 }, () => generateNfcPassword()),
    );
    for (const password of passwords) {
      expect(password).toMatch(/^[0-9A-F]{8}$/);
    }
    expect(passwords.size).toBe(50);
  });

  it('se descifra con la misma clave y la misma pieza', () => {
    const stored = encryptNfcPassword(key, pieceId, '1A2B3C4D');

    expect(stored).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(stored).not.toContain('1A2B3C4D');
    expect(decryptNfcPassword(key, pieceId, stored)).toBe('1A2B3C4D');
  });

  it('cifrar dos veces da resultados distintos', () => {
    expect(encryptNfcPassword(key, pieceId, '1A2B3C4D')).not.toBe(
      encryptNfcPassword(key, pieceId, '1A2B3C4D'),
    );
  });

  it('no se descifra con otra clave, en otra pieza ni alterada', () => {
    const stored = encryptNfcPassword(key, pieceId, '1A2B3C4D');
    const [version, iv, tag, encrypted] = stored.split('.');
    const flipped = encrypted!.startsWith('A') ? 'B' : 'A';
    const tampered = [version, iv, tag, flipped + encrypted!.slice(1)].join(
      '.',
    );

    expect(() =>
      decryptNfcPassword(randomBytes(32), pieceId, stored),
    ).toThrow();
    expect(() =>
      decryptNfcPassword(key, '01a17e4b-a7d4-7085-afdd-000000000000', stored),
    ).toThrow();
    expect(() => decryptNfcPassword(key, pieceId, tampered)).toThrow();
    expect(() => decryptNfcPassword(key, pieceId, 'v2.a.b.c')).toThrow(
      /Formato/,
    );
  });
});
