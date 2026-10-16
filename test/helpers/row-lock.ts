import type { Prisma } from './../../src/generated/prisma/client.js';
import { createMigratorClient } from './../setup/test-database.js';

// Bloquea la fila desde otra conexión mientras corre `work`. Sirve para
// probar de forma determinista que el código espera ese bloqueo.
export async function whileRowLocked(
  table: 'memberships' | 'customers',
  id: string,
  work: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const client = createMigratorClient();
  try {
    await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT 1 FROM ${table} WHERE id = $1::uuid FOR UPDATE`,
          id,
        );
        await work(tx);
      },
      { timeout: 10_000 },
    );
  } finally {
    await client.$disconnect();
  }
}

// Tiempo para que un request en vuelo llegue al bloqueo y quede esperando.
export const LOCK_WAIT_MS = 300;
