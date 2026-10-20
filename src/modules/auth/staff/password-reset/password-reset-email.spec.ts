import { passwordResetEmail } from './password-reset-email.js';

describe('passwordResetEmail', () => {
  it('arma el link al front con el token y avisa cuándo vence', () => {
    const email = passwordResetEmail(
      'duena@cafe.com',
      'https://clubsy.app',
      'abc_123-XYZ',
      30,
    );
    expect(email.to).toBe('duena@cafe.com');
    expect(email.subject).toBe('Restablecé tu contraseña de Clubsy');
    expect(email.text).toContain(
      'https://clubsy.app/panel/restablecer?token=abc_123-XYZ',
    );
    expect(email.text).toContain('vence en 30 minutos');
  });
});
