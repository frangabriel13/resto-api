import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import { createAdminClient } from './lib/admin-client.js';
import { createOrResetPlatformAdmin } from './lib/platform-admin.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});
if (!values.email) {
  console.error('Uso: pnpm admin:create --email <email> [--name <nombre>]');
  process.exit(1);
}

const prisma = createAdminClient();
try {
  const result = await createOrResetPlatformAdmin(prisma, {
    email: values.email,
    name: values.name,
  });
  console.log(`${result.created ? 'Admin creado' : 'Contraseña nueva (se cerraron sus sesiones)'}: ${result.email}
Contraseña: ${result.password}
Guardala ahora: no se vuelve a mostrar.`);
} catch (error) {
  console.error(
    error instanceof ZodError
      ? 'El email no es válido.'
      : error instanceof Error
        ? error.message
        : error,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
