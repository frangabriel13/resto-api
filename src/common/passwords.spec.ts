import { generatePassword, hashPassword, verifyPassword } from './passwords.js';

describe('passwords', () => {
  it('verifica la contraseña correcta y rechaza otra', async () => {
    const passwordHash = await hashPassword('una-clave');
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).not.toContain('una-clave');
    await expect(verifyPassword(passwordHash, 'una-clave')).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, 'otra-clave')).resolves.toBe(
      false,
    );
  });

  it('genera contraseñas aleatorias sin caracteres ambiguos', () => {
    const password = generatePassword();
    expect(password).toHaveLength(16);
    expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
    expect(generatePassword()).not.toBe(password);
  });
});
