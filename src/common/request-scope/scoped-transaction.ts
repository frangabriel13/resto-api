import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

export const SCOPED_TRANSACTION_TIMEOUT_MS = 15_000;

// Las variables que leen las políticas RLS (migración `rls`).
export type ScopeSetting =
  | 'app.merchant_id'
  | 'app.customer_id'
  | 'app.staff_user_id'
  | 'app.customer_phone';

type RawExecutor = {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
};

// Equivale a SET LOCAL, pero acepta parámetros.
export async function setTransactionSetting(
  tx: RawExecutor,
  name: ScopeSetting,
  value: string,
) {
  await tx.$executeRaw`SELECT set_config(${name}, ${value}, true)`;
}

// Para guards, login y OTP, que leen antes de que exista el contexto del
// request: sin la variable, RLS no les devuelve nada.
export function runWithSetting<T>(
  prisma: PrismaService,
  name: ScopeSetting,
  value: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setTransactionSetting(tx, name, value);
    return work(tx);
  });
}
