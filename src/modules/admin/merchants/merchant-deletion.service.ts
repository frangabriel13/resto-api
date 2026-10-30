import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { lockMerchant } from './lock-merchant.js';

type Tx = Prisma.TransactionClient;

// La única excepción a "nada del dominio se borra": un comercio que nunca
// tuvo clientes (sin membresías tampoco hay sellos ni canjes).
@Injectable()
export class MerchantDeletionService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  async delete(adminId: string, id: string, confirmName: string) {
    await this.prisma.$transaction(async (tx) => {
      if (!(await lockMerchant(tx, id))) throw new AppException('NOT_FOUND');
      const { name, slug } = await tx.merchant.findUniqueOrThrow({
        where: { id },
      });
      assertConfirmed(name, confirmName);
      const customers = await tx.membership.count({
        where: { merchantId: id },
      });
      if (customers) {
        throw new AppException('MERCHANT_HAS_CUSTOMERS', undefined, {
          customers,
        });
      }
      const removed = await deleteMerchantData(tx, id);
      await this.audit.recordAdmin(tx, adminId, null, {
        action: 'merchant.deleted',
        entityId: id,
        payload: { name, slug, ...removed },
      });
    });
  }
}

function assertConfirmed(name: string, confirmName: string) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase('es');
  if (normalize(name) === normalize(confirmName)) return;
  throw new AppException('VALIDATION_ERROR', undefined, {
    issues: [
      {
        path: 'confirmName',
        message: 'No coincide con el nombre del comercio.',
      },
    ],
  });
}

async function deleteMerchantData(tx: Tx, merchantId: string) {
  const byMerchant = { where: { merchantId } };
  await tx.pieceScan.deleteMany(byMerchant);
  await tx.pieceNfcPassword.deleteMany(byMerchant);
  const pieces = await tx.piece.deleteMany(byMerchant);
  await tx.rewardRule.deleteMany(byMerchant);
  await tx.merchantProfile.deleteMany(byMerchant);
  const staffUsers = await deleteStaff(tx, merchantId);
  await tx.auditEvent.deleteMany(byMerchant);
  await tx.merchant.delete({ where: { id: merchantId } });
  return { pieces: pieces.count, staffUsers };
}

// Un usuario que también está en otro comercio (aunque dado de baja) se
// conserva; si tenía este comercio elegido, su sesión queda sin elegir.
async function deleteStaff(tx: Tx, merchantId: string): Promise<number> {
  const members = await tx.staffMembership.findMany({
    where: { merchantId },
    select: { staffUserId: true },
  });
  const ids = members.map((member) => member.staffUserId);
  const shared = await tx.staffMembership.findMany({
    where: { staffUserId: { in: ids }, merchantId: { not: merchantId } },
    select: { staffUserId: true },
  });
  const sharedIds = new Set(shared.map((member) => member.staffUserId));
  const exclusive = ids.filter((id) => !sharedIds.has(id));

  await tx.staffSession.updateMany({
    where: { selectedMerchantId: merchantId },
    data: { selectedMerchantId: null },
  });
  await tx.staffMembership.deleteMany({ where: { merchantId } });
  // Las sesiones y los tokens de recuperación se borran en cascada.
  const users = await tx.staffUser.deleteMany({
    where: { id: { in: exclusive } },
  });
  return users.count;
}
