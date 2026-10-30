import type { Prisma } from '../../../generated/prisma/client.js';

// Bloquea la fila hasta el final de la transacción: dos pedidos a la vez se
// atienden de a uno, y un alta de cliente (su FK) espera a que termine.
export async function lockMerchant(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM merchants WHERE id = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}
