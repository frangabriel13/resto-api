import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const AUDIT_ACTIONS = [
  'stamp.created',
  'stamp.voided',
  'redemption.created',
  'redemption.voided',
  'reward_rule.created',
  'staff.created',
  'staff.deactivated',
  'staff.reactivated',
  'staff.password_reset',
  'merchant.created',
  'merchant.updated',
  'merchant.customers_exported',
  'piece.created',
  'piece.updated',
  'piece.destination_changed',
  'piece.password_revealed',
  'piece.password_regenerated',
  'piece.replaced',
  'sale.created',
  'sale.updated',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEventInput = {
  action: AuditAction;
  entityId: string;
  payload?: Prisma.InputJsonObject;
};

type AuditDb = Pick<Prisma.TransactionClient, 'auditEvent'>;

@Injectable()
export class AuditService {
  constructor(private readonly tenant: TenantContext) {}

  // Corre en la transacción del request: si la acción falla, no queda registro.
  async record(event: AuditEventInput) {
    const { merchantId, staffUserId } = this.tenant.scope;
    await this.tenant.db.auditEvent.create({
      data: toAuditData(event, merchantId, 'STAFF', staffUserId),
    });
  }

  // Para /admin: `db` es la transacción de la operación que se audita.
  async recordAdmin(
    db: AuditDb,
    platformAdminId: string,
    merchantId: string,
    event: AuditEventInput,
  ) {
    await db.auditEvent.create({
      data: toAuditData(event, merchantId, 'PLATFORM_ADMIN', platformAdminId),
    });
  }
}

function toAuditData(
  { action, entityId, payload = {} }: AuditEventInput,
  merchantId: string,
  actorType: 'STAFF' | 'PLATFORM_ADMIN',
  actorId: string,
) {
  return {
    merchantId,
    actorType,
    actorId,
    action,
    entityType: action.slice(0, action.indexOf('.')),
    entityId,
    payload,
  };
}
