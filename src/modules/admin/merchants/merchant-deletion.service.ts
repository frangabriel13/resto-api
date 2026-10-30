import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { anonymizedCustomerData } from '../../customers/anonymized-customer.js';
import type { DeletionSummary } from './admin-merchants.schemas.js';
import { lockMerchant } from './lock-merchant.js';

type Tx = Prisma.TransactionClient;
type Account = { id: string; phoneE164: string | null };
type DeletionPlan = Awaited<ReturnType<typeof planDeletion>>;

// La única excepción a "nada del dominio se borra". Con clientes, solo
// archivado: el club ya terminó y nadie más se puede sumar.
@Injectable()
export class MerchantDeletionService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  async summary(id: string): Promise<DeletionSummary> {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({ where: { id } });
      if (!merchant) throw new AppException('NOT_FOUND');
      const { counts } = await planDeletion(tx, id);
      const archived = merchant.archivedAt !== null;
      return { ...counts, archived, canDelete: canDelete(counts, archived) };
    });
  }

  async delete(adminId: string, id: string, confirmName: string) {
    await this.prisma.$transaction(async (tx) => {
      if (!(await lockMerchant(tx, id))) throw new AppException('NOT_FOUND');
      const { name, slug, archivedAt } = await tx.merchant.findUniqueOrThrow({
        where: { id },
      });
      assertConfirmed(name, confirmName);
      await lockCustomers(tx, id);
      const plan = await planDeletion(tx, id);
      if (!canDelete(plan.counts, archivedAt !== null)) {
        throw new AppException('MERCHANT_HAS_CUSTOMERS', undefined, {
          customers: plan.counts.customers,
        });
      }
      await deleteMerchantData(tx, id, plan);
      await this.audit.recordAdmin(tx, adminId, null, {
        action: 'merchant.deleted',
        entityId: id,
        payload: { name, slug, ...plan.counts },
      });
    });
  }
}

function canDelete(counts: { customers: number }, archived: boolean) {
  return counts.customers === 0 || archived;
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

// Hasta el final de la transacción nadie le cambia la cuenta a un cliente,
// así la decisión de borrarla o no sigue valiendo.
async function lockCustomers(tx: Tx, merchantId: string) {
  await tx.$queryRaw`
    SELECT c.id FROM customers c
    JOIN memberships m ON m.customer_id = c.id
    WHERE m.merchant_id = ${merchantId}::uuid
    FOR UPDATE OF c`;
}

// Lo que se borraría: la misma cuenta para el resumen y para la auditoría.
async function planDeletion(tx: Tx, merchantId: string) {
  const byMerchant = { where: { merchantId } };
  const accounts = await exclusiveAccounts(tx, merchantId);
  const staffIds = await exclusiveStaffIds(tx, merchantId);
  const counts = {
    customers: await tx.membership.count(byMerchant),
    stamps: await tx.stamp.count(byMerchant),
    redemptions: await tx.redemption.count(byMerchant),
    pieces: await tx.piece.count(byMerchant),
    customerAccounts: accounts.length,
    staffUsers: staffIds.length,
  };
  return { counts, accounts, staffIds };
}

// Una cuenta con una membresía en otro comercio, aunque haya dejado ese club,
// se conserva; una ya borrada no se vuelve a borrar.
async function exclusiveAccounts(
  tx: Tx,
  merchantId: string,
): Promise<Account[]> {
  const members = await tx.membership.findMany({
    where: { merchantId, customer: { deletedAt: null } },
    select: { customer: { select: { id: true, phoneE164: true } } },
  });
  const accounts = members.map((member) => member.customer);
  const elsewhere = await tx.membership.findMany({
    where: {
      customerId: { in: accounts.map((account) => account.id) },
      merchantId: { not: merchantId },
    },
    select: { customerId: true },
  });
  const keep = new Set(elsewhere.map((member) => member.customerId));
  return accounts.filter((account) => !keep.has(account.id));
}

// Igual con el staff: quien también está en otro comercio (aunque dado de
// baja) se conserva.
async function exclusiveStaffIds(tx: Tx, merchantId: string) {
  const members = await tx.staffMembership.findMany({
    where: { merchantId },
    select: { staffUserId: true },
  });
  const ids = members.map((member) => member.staffUserId);
  const elsewhere = await tx.staffMembership.findMany({
    where: { staffUserId: { in: ids }, merchantId: { not: merchantId } },
    select: { staffUserId: true },
  });
  const keep = new Set(elsewhere.map((member) => member.staffUserId));
  return ids.filter((id) => !keep.has(id));
}

async function deleteMerchantData(
  tx: Tx,
  merchantId: string,
  { accounts, staffIds }: DeletionPlan,
) {
  const byMerchant = { where: { merchantId } };
  await tx.stamp.deleteMany(byMerchant);
  await tx.redemption.deleteMany(byMerchant);
  await tx.membership.deleteMany(byMerchant);
  await eraseAccounts(tx, accounts, new Date());
  await tx.pieceScan.deleteMany(byMerchant);
  await tx.pieceNfcPassword.deleteMany(byMerchant);
  await tx.piece.deleteMany(byMerchant);
  await tx.rewardRule.deleteMany(byMerchant);
  await tx.merchantProfile.deleteMany(byMerchant);
  await deleteStaff(tx, merchantId, staffIds);
  await tx.auditEvent.deleteMany(byMerchant);
  await tx.merchant.delete({ where: { id: merchantId } });
}

// Como DELETE /me: anonimizada, sin sesiones abiertas ni pedidos de código.
async function eraseAccounts(tx: Tx, accounts: Account[], now: Date) {
  const ids = accounts.map((account) => account.id);
  const phones = accounts.flatMap((account) =>
    account.phoneE164 ? [account.phoneE164] : [],
  );
  await tx.customer.updateMany({
    where: { id: { in: ids } },
    data: anonymizedCustomerData(now),
  });
  await tx.customerSession.updateMany({
    where: { customerId: { in: ids }, revokedAt: null },
    data: { revokedAt: now },
  });
  await tx.otpChallenge.deleteMany({ where: { phoneE164: { in: phones } } });
}

// Si un usuario que se queda tenía este comercio elegido, su sesión sigue
// abierta, sin comercio elegido.
async function deleteStaff(tx: Tx, merchantId: string, exclusive: string[]) {
  await tx.staffSession.updateMany({
    where: { selectedMerchantId: merchantId },
    data: { selectedMerchantId: null },
  });
  await tx.staffMembership.deleteMany({ where: { merchantId } });
  // Las sesiones y los tokens de recuperación se borran en cascada.
  await tx.staffUser.deleteMany({ where: { id: { in: exclusive } } });
}
