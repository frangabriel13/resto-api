import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const URL_VARS = [
  'DATABASE_URL',
  'DATABASE_ADMIN_URL',
  'MIGRATE_DATABASE_URL',
] as const;

// Los E2E vacían la base: se niegan a correr fuera de una base `_test`.
export function assertTestDatabaseUrls() {
  for (const name of URL_VARS) {
    const value = process.env[name];
    const database = value ? new URL(value).pathname.slice(1) : undefined;
    if (!database?.endsWith('_test')) {
      throw new Error(
        `${name} tiene que apuntar a una base terminada en "_test" ` +
          `(ahora: ${database ?? 'sin definir'}). Revisá .env.test.`,
      );
    }
  }
}

// Como dueño de las tablas, para vaciarlas sin depender de permisos ni de RLS.
export function createMigratorClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.MIGRATE_DATABASE_URL,
    }),
  });
}

// Con BYPASSRLS: las tablas tienen FORCE ROW LEVEL SECURITY, así que ni el
// dueño puede leer o bloquear filas sin contexto.
export function createAdminClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_ADMIN_URL }),
  });
}

export async function resetDatabase(client: PrismaClient) {
  await client.$executeRawUnsafe(`
    DO $$
    DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO tables
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}
