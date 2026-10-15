import { deriveKey } from '../../../common/crypto.js';
import { generateOtpCode, hashOtpCode, otpCodeMatches } from './otp-code.js';

const key = deriveKey('una-clave-de-prueba-de-mas-de-32-caracteres', 'otp');
const PHONE = '+5491123456789';

describe('código OTP', () => {
  it('genera 6 dígitos', () => {
    for (let i = 0; i < 100; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('valida el código correcto para ese teléfono y nada más', () => {
    const hash = hashOtpCode(key, PHONE, '012345');
    expect(hash).not.toContain('012345');
    expect(otpCodeMatches(key, PHONE, '012345', hash)).toBe(true);
    expect(otpCodeMatches(key, PHONE, '012346', hash)).toBe(false);
    expect(otpCodeMatches(key, '+5491100000000', '012345', hash)).toBe(false);
    const otherKey = deriveKey(
      'otra-clave-de-prueba-de-mas-de-32-caracteres',
      'otp',
    );
    expect(otpCodeMatches(otherKey, PHONE, '012345', hash)).toBe(false);
  });
});
