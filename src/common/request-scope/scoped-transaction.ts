export const SCOPED_TRANSACTION_TIMEOUT_MS = 15_000;

type RawExecutor = {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
};

// Equivale a SET LOCAL, pero acepta parámetros. La leen las políticas RLS.
export async function setTransactionSetting(
  tx: RawExecutor,
  name: 'app.merchant_id' | 'app.customer_id',
  value: string,
) {
  await tx.$executeRaw`SELECT set_config(${name}, ${value}, true)`;
}
