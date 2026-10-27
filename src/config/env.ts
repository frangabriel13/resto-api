import { z } from 'zod';

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'tiene que ser una URL postgresql://',
});

// Variables que pide cada proveedor de envío real.
const PROVIDER_VARIABLES = [
  {
    sender: 'OTP_SENDER',
    provider: 'whatsapp',
    required: [
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_TEMPLATE_NAME',
    ],
  },
  {
    sender: 'EMAIL_SENDER',
    provider: 'resend',
    required: ['RESEND_API_KEY', 'EMAIL_FROM'],
  },
] as const;

// MIGRATE_DATABASE_URL no va: solo la usa el CLI de Prisma.
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: postgresUrl,
    DATABASE_ADMIN_URL: postgresUrl,
    SECRET_KEY: z.string().min(32, 'tiene que tener al menos 32 caracteres'),
    // Cifra las contraseñas NFC de las piezas. Aparte de SECRET_KEY: rotar esa
    // no las pierde. Si esta se pierde, no se recuperan.
    NFC_PASSWORD_KEY: z
      .string()
      .regex(
        /^[0-9a-fA-F]{64}$/,
        'tienen que ser 64 caracteres hexadecimales (openssl rand -hex 32)',
      ),
    OTP_SENDER: z.enum(['console', 'whatsapp']).default('console'),
    WHATSAPP_PHONE_NUMBER_ID: z
      .string()
      .regex(/^\d+$/, 'tiene que ser numérico')
      .optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_TEMPLATE_NAME: z.string().min(1).optional(),
    WHATSAPP_TEMPLATE_LANGUAGE: z.string().min(2).default('es_AR'),
    EMAIL_SENDER: z.enum(['console', 'resend']).default('console'),
    RESEND_API_KEY: z.string().min(1).optional(),
    // "Clubsy <no-reply@dominio>"; el dominio tiene que estar verificado en Resend.
    EMAIL_FROM: z.string().regex(/@/, 'tiene que incluir un email').optional(),
    // Sin DSN, Sentry queda apagado (desarrollo y tests).
    SENTRY_DSN: z.url().optional(),
    SENTRY_ENVIRONMENT: z.string().min(1).optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
    // URL del front: arma los links de los mails.
    APP_URL: z
      .url({ protocol: /^https?$/, error: 'tiene que ser una URL http(s)://' })
      .default('http://localhost:3000'),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.OTP_SENDER !== 'console',
    {
      path: ['OTP_SENDER'],
      message: 'en producción no se puede usar el envío por consola',
    },
  )
  .superRefine((env, ctx) => {
    for (const { sender, provider, required } of PROVIDER_VARIABLES) {
      if (env[sender] !== provider) continue;
      for (const key of required.filter((key) => !env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `es obligatoria con ${sender}=${provider}`,
        });
      }
    }
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.EMAIL_SENDER !== 'console',
    {
      path: ['EMAIL_SENDER'],
      message: 'en producción no se puede usar el envío por consola',
    },
  )
  .refine((env) => env.NODE_ENV !== 'production' || env.SENTRY_DSN, {
    path: ['SENTRY_DSN'],
    message: 'en producción es obligatorio',
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.APP_URL.startsWith('https:'),
    { path: ['APP_URL'], message: 'en producción tiene que ser https' },
  );

export type Env = z.infer<typeof envSchema>;

// El mensaje no incluye los valores: pueden tener contraseñas.
// Vacía cuenta como no definida: el compose de producción pasa `${VAR:-}`.
export function validateEnv(config: Record<string, unknown>): Env {
  const defined = Object.entries(config).filter(([, value]) => value !== '');
  const result = envSchema.safeParse(Object.fromEntries(defined));
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${problems}`);
  }
  return result.data;
}
