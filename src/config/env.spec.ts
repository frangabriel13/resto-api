import { validateEnv } from './env.js';

const validEnv = {
  SECRET_KEY: 'una-clave-de-prueba-de-mas-de-32-caracteres',
  NFC_PASSWORD_KEY: 'ab'.repeat(32),
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

  it('exige la clave de las contraseñas NFC en hexadecimal', () => {
    const { NFC_PASSWORD_KEY: _, ...withoutKey } = validEnv;
    expect(() => validateEnv(withoutKey)).toThrow(/NFC_PASSWORD_KEY/);
    for (const key of ['ab'.repeat(31), 'zz'.repeat(32), 'ab'.repeat(33)]) {
      expect(() => validateEnv({ ...validEnv, NFC_PASSWORD_KEY: key })).toThrow(
        /NFC_PASSWORD_KEY: tienen que ser 64 caracteres hexadecimales/,
      );
    }
  });

  describe('R2', () => {
    const r2 = {
      R2_ACCOUNT_ID: 'ab'.repeat(16),
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'clubsy-imagenes-dev',
      IMAGES_PUBLIC_URL: 'https://pub-123.r2.dev/',
    };

    it('es opcional fuera de producción, y la URL pública queda sin / final', () => {
      expect(validateEnv(validEnv).R2_BUCKET).toBeUndefined();
      expect(validateEnv({ ...validEnv, ...r2 }).IMAGES_PUBLIC_URL).toBe(
        'https://pub-123.r2.dev',
      );
    });

    it('las variables van todas juntas', () => {
      const { R2_SECRET_ACCESS_KEY: _, ...partial } = r2;
      expect(() => validateEnv({ ...validEnv, ...partial })).toThrow(
        /R2_SECRET_ACCESS_KEY: las variables de R2 van todas juntas/,
      );
    });

    it('en producción son obligatorias', () => {
      const production = {
        ...validEnv,
        NODE_ENV: 'production',
        OTP_SENDER: 'whatsapp',
        WHATSAPP_PHONE_NUMBER_ID: '123',
        WHATSAPP_ACCESS_TOKEN: 'token',
        WHATSAPP_TEMPLATE_NAME: 'clubsy_codigo',
        EMAIL_SENDER: 'resend',
        RESEND_API_KEY: 're_x',
        EMAIL_FROM: 'Clubsy <no-reply@mail.clubsy.com.ar>',
        SENTRY_DSN: 'https://key@sentry.io/1',
        APP_URL: 'https://clubsy.com.ar',
      };
      expect(() => validateEnv(production)).toThrow(
        /R2_BUCKET: en producción es obligatoria/,
      );
      expect(() => validateEnv({ ...production, ...r2 })).not.toThrow();
    });

    it('valida el Account ID y que la URL pública sea https', () => {
      expect(() =>
        validateEnv({ ...validEnv, ...r2, R2_ACCOUNT_ID: 'no-es-hex' }),
      ).toThrow(/R2_ACCOUNT_ID/);
      expect(() =>
        validateEnv({
          ...validEnv,
          ...r2,
          IMAGES_PUBLIC_URL: 'http://img.com',
        }),
      ).toThrow(/IMAGES_PUBLIC_URL/);
    });
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

  it('con OTP_SENDER=whatsapp exige el número, el token y la plantilla', () => {
    const whatsapp = { ...validEnv, OTP_SENDER: 'whatsapp' };
    expect(() => validateEnv(whatsapp)).toThrow(
      /WHATSAPP_PHONE_NUMBER_ID: es obligatoria[\s\S]*WHATSAPP_ACCESS_TOKEN[\s\S]*WHATSAPP_TEMPLATE_NAME/,
    );
    expect(
      validateEnv({
        ...whatsapp,
        WHATSAPP_PHONE_NUMBER_ID: '1234567890',
        WHATSAPP_ACCESS_TOKEN: 'token',
        WHATSAPP_TEMPLATE_NAME: 'clubsy_codigo',
      }).WHATSAPP_TEMPLATE_LANGUAGE,
    ).toBe('es_AR');
  });

  it('con EMAIL_SENDER=resend exige la API key y un remitente con email', () => {
    const resend = { ...validEnv, EMAIL_SENDER: 'resend' };
    expect(() => validateEnv(resend)).toThrow(
      /RESEND_API_KEY: es obligatoria con EMAIL_SENDER=resend[\s\S]*EMAIL_FROM/,
    );
    expect(() =>
      validateEnv({ ...resend, RESEND_API_KEY: 're_x', EMAIL_FROM: 'Clubsy' }),
    ).toThrow(/EMAIL_FROM: tiene que incluir un email/);
    expect(
      validateEnv({
        ...resend,
        RESEND_API_KEY: 're_x',
        EMAIL_FROM: 'Clubsy <no-reply@clubsy.test>',
      }).EMAIL_SENDER,
    ).toBe('resend');
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

  it('exige SENTRY_DSN en producción y una tasa de trazas entre 0 y 1', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'production' })).toThrow(
      /SENTRY_DSN: en producción es obligatorio/,
    );
    expect(() =>
      validateEnv({ ...validEnv, SENTRY_TRACES_SAMPLE_RATE: '2' }),
    ).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);
    expect(validateEnv(validEnv).SENTRY_TRACES_SAMPLE_RATE).toBe(0);
  });

  it('una variable vacía cuenta como no definida', () => {
    const env = validateEnv({
      ...validEnv,
      OTP_SENDER: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
      EMAIL_FROM: '',
    });
    expect(env.OTP_SENDER).toBe('console');
    expect(env.WHATSAPP_PHONE_NUMBER_ID).toBeUndefined();
    expect(() => validateEnv({ ...validEnv, SECRET_KEY: '' })).toThrow(
      /SECRET_KEY/,
    );
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
