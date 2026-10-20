import { validateEnv } from './env.js';

const validEnv = {
  SECRET_KEY: 'una-clave-de-prueba-de-mas-de-32-caracteres',
  DATABASE_URL: 'postgresql://resto_app:secreto-app@localhost:5434/resto_club',
  DATABASE_ADMIN_URL:
    'postgresql://resto_app_admin:secreto-admin@localhost:5434/resto_club',
};

describe('validateEnv', () => {
  it('aplica los valores por defecto', () => {
    const env = validateEnv(validEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
  });

  it('convierte PORT a número', () => {
    expect(validateEnv({ ...validEnv, PORT: '4000' }).PORT).toBe(4000);
  });

  it('descarta variables que no están en el schema', () => {
    const env = validateEnv({ ...validEnv, PATH: '/usr/bin' });
    expect(env).not.toHaveProperty('PATH');
  });

  it('falla si falta una URL de base', () => {
    expect(() => validateEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toThrow(
      /DATABASE_ADMIN_URL/,
    );
  });

  it('falla si la URL no es de Postgres', () => {
    expect(() =>
      validateEnv({ ...validEnv, DATABASE_URL: 'mysql://x@localhost/db' }),
    ).toThrow(/DATABASE_URL: tiene que ser una URL postgresql/);
  });

  it('falla con un PORT inválido o un NODE_ENV desconocido', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('exige una SECRET_KEY de al menos 32 caracteres', () => {
    expect(() => validateEnv({ ...validEnv, SECRET_KEY: 'corta' })).toThrow(
      /SECRET_KEY/,
    );
  });

  it('en producción no acepta el envío de códigos por consola', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        OTP_SENDER: 'console',
      }),
    ).toThrow(/OTP_SENDER/);
    expect(validateEnv(validEnv).OTP_SENDER).toBe('console');
  });

  it('en producción no acepta el envío de mails por consola ni un APP_URL sin https', () => {
    const production = { ...validEnv, NODE_ENV: 'production' };
    expect(() => validateEnv(production)).toThrow(/EMAIL_SENDER/);
    expect(() =>
      validateEnv({ ...production, APP_URL: 'http://clubsy.com' }),
    ).toThrow(/APP_URL: en producción tiene que ser https/);
    expect(validateEnv(validEnv)).toMatchObject({
      EMAIL_SENDER: 'console',
      APP_URL: 'http://localhost:3000',
    });
  });

  it('no muestra los valores en el mensaje de error', () => {
    try {
      validateEnv({ ...validEnv, DATABASE_URL: 'mysql://u:clave@h/db' });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('clave');
      expect(message).not.toContain('secreto');
    }
  });
});
