import { AppException } from '../../../common/errors/app.exception.js';
import type { Prisma } from '../../../generated/prisma/client.js';

// Un comercio archivado no se edita: primero se desarchiva.
export async function assertMerchantEditable(
  db: Pick<Prisma.TransactionClient, 'merchant'>,
  merchantId: string,
) {
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { archivedAt: true },
  });
  if (!merchant) throw new AppException('NOT_FOUND');
  if (merchant.archivedAt) throw new AppException('MERCHANT_ARCHIVED');
}
