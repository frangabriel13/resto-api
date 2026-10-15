import { z } from 'zod';

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'tiene que ser una URL postgresql://',
});

// Variables que necesita la API en runtime. MIGRATE_DATABASE_URL no está acá
// porque solo la usa el CLI de Prisma (prisma7.config.ts).
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: postgresUrl,
  DATABASE_ADMIN_URL: postgresUrl,
});

export type Env = z.infer<typeof envSchema>;

// Para `ConfigModule.forRoot({ validate })`: si falta o está mal alguna
// variable, la API no arranca. El mensaje nombra las variables pero nunca
// muestra sus valores (pueden tener contraseñas).
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
