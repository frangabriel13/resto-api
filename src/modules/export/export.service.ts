import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../audit/audit.service.js';
import { customersExport, type CustomersExport } from './customers-export.js';
import { exportInclude } from './export-row.js';

@Injectable()
export class ExportService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  // Todos los clientes, también los que salieron del club. Se audita porque
  // es una descarga de datos personales.
  async customers(): Promise<CustomersExport> {
    const { db } = this.tenant;
    const { merchantId } = this.tenant.scope;
    const merchant = await db.merchant.findUniqueOrThrow({
      where: { id: merchantId },
    });
    const memberships = await db.membership.findMany({
      include: exportInclude,
      orderBy: { joinedAt: 'asc' },
    });
    await this.audit.record({
      action: 'merchant.customers_exported',
      entityId: merchantId,
      payload: { rows: memberships.length },
    });
    return customersExport(merchant.slug, memberships);
  }
}
