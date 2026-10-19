import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { ErrorCode } from '../../common/errors/error-codes.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import {
  panelMembershipInclude,
  toPanelMembership,
  type MembershipForPanel,
} from './panel-membership.js';
import type { PanelMembership } from './panel-membership.schemas.js';

@Injectable()
export class PanelMembershipsService {
  constructor(private readonly tenant: TenantContext) {}

  async find(id: string, notFound: ErrorCode): Promise<MembershipForPanel> {
    const membership = await this.tenant.db.membership.findUnique({
      where: { id },
      include: panelMembershipInclude,
    });
    if (!membership) throw new AppException(notFound);
    return membership;
  }

  // Sellos, canjes y anulaciones de una misma membresía quedan en fila hasta
  // que termine la transacción: así nadie decide con un saldo viejo.
  async lock(id: string): Promise<void> {
    await this.tenant.db
      .$queryRaw`SELECT id FROM memberships WHERE id = ${id}::uuid FOR UPDATE`;
  }

  async view(id: string): Promise<PanelMembership> {
    const membership = await this.find(id, 'NOT_FOUND');
    return toPanelMembership(membership, this.tenant.scope.role);
  }
}
