import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { normalizeArMobile } from '../customers/phone.js';
import {
  panelMembershipInclude,
  toPanelMembership,
} from '../memberships/panel-membership.js';
import type { PanelMembership } from '../memberships/panel-membership.schemas.js';
import { customerDetailInclude, toCustomerDetail } from './customer-detail.js';
import type { CustomerDetail } from './panel-customers.schemas.js';

const SEARCH_LIMIT = 20;
const MIN_PHONE_DIGITS = 3;

@Injectable()
export class PanelCustomersService {
  constructor(private readonly tenant: TenantContext) {}

  // Solo clientes activos: es para encontrarlos y sumarles un sello.
  async search(query: string): Promise<PanelMembership[]> {
    const memberships = await this.tenant.db.membership.findMany({
      where: { leftAt: null, customer: customerFilter(query) },
      include: panelMembershipInclude,
      orderBy: { customer: { name: 'asc' } },
      take: SEARCH_LIMIT,
    });
    return memberships.map((m) => toPanelMembership(m, this.tenant.scope.role));
  }

  async detail(membershipId: string): Promise<CustomerDetail> {
    const membership = await this.tenant.db.membership.findUnique({
      where: { id: membershipId },
      include: customerDetailInclude,
    });
    if (!membership) throw new AppException('NOT_FOUND');
    return toCustomerDetail(membership, this.tenant.scope, new Date());
  }
}

// Con 3 o más dígitos busca por teléfono (sirve un número parcial); si no,
// por nombre.
function customerFilter(query: string): Prisma.CustomerWhereInput {
  const digits = query.replace(/\D/g, '');
  if (digits.length < MIN_PHONE_DIGITS) {
    return { name: { contains: query, mode: 'insensitive' } };
  }
  const fullNumber = normalizeArMobile(query);
  return {
    OR: [
      { phoneE164: { contains: digits } },
      ...(fullNumber ? [{ phoneE164: fullNumber }] : []),
    ],
  };
}
