import { z } from 'zod';

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'tiene que ser una URL postgresql://',
});

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
    OTP_SENDER: z.enum(['console']).default('console'),
    EMAIL_SENDER: z.enum(['console']).default('console'),
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
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.EMAIL_SENDER !== 'console',
    {
      path: ['EMAIL_SENDER'],
      message: 'en producción no se puede usar el envío por consola',
    },
  )
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.APP_URL.startsWith('https:'),
    { path: ['APP_URL'], message: 'en producción tiene que ser https' },
  );

export type Env = z.infer<typeof envSchema>;

// El mensaje no incluye los valores: pueden tener contraseñas.
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${problems}`);
  }
  return result.data;
}
