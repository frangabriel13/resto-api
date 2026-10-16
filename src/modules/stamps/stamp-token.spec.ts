import { deriveKey } from '../../common/crypto.js';
import { readStampToken, signStampToken } from './stamp-token.js';

const key = deriveKey(
  'una-clave-de-prueba-de-mas-de-32-caracteres',
  'stamp-token',
);
const MEMBERSHIP = '01a13fa3-f9f9-7009-8133-43c40c9b6c60';
const EXPIRES = new Date('2026-10-16T12:02:00Z');

describe('token del QR de la tarjeta', () => {
  it('firma y lee la membresía y el vencimiento', () => {
    const token = signStampToken(key, MEMBERSHIP, EXPIRES);
    expect(token.length).toBeLessThan(100);
    expect(readStampToken(key, token)).toEqual({
      membershipId: MEMBERSHIP,
      expiresAt: EXPIRES,
    });
  });

  it('rechaza un token adulterado o firmado con otra clave', () => {
    const token = signStampToken(key, MEMBERSHIP, EXPIRES);
    const later = signStampToken(
      key,
      MEMBERSHIP,
      new Date('2027-01-01T00:00:00Z'),
    );
    const tampered = `${later.split('.').slice(0, 3).join('.')}.${token.split('.')[3]}`;
    expect(readStampToken(key, tampered)).toBeNull();

    const otherKey = deriveKey(
      'otra-clave-de-prueba-de-mas-de-32-caracteres',
      'stamp-token',
    );
    expect(readStampToken(otherKey, token)).toBeNull();
  });

  it.each([
    '',
    'basura',
    'v1.no-es-uuid.123.firma',
    `v2.${MEMBERSHIP}.123.firma`,
  ])('rechaza un token malformado: %s', (token) => {
    expect(readStampToken(key, token)).toBeNull();
  });
});
