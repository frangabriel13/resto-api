import { execFileSync } from 'node:child_process';
import { assertTestDatabaseUrls } from './test-database.js';

// deploy y no reset: reset borra el schema public y con él los permisos por
// defecto de los roles.
export default function setup() {
  assertTestDatabaseUrls();
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      stdio: 'pipe',
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `No se pudieron aplicar las migraciones a la base de test ` +
        `(¿está levantado Postgres? docker compose up -d):\n${stdout ?? ''}${stderr ?? ''}`,
    );
  }
}
