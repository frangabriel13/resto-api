import { Injectable } from '@nestjs/common';
import { arDay } from '../../common/ar-time.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../audit/audit.service.js';
import { toCsv } from './csv.js';
import { EXPORT_HEADER, exportInclude, exportRow } from './export-row.js';

export type CustomersExport = { filename: string; csv: string };

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
    return {
      filename: `clubsy-${merchant.slug}-${arDay(new Date())}.csv`,
      csv: toCsv([EXPORT_HEADER, ...memberships.map(exportRow)]),
    };
  }
}
