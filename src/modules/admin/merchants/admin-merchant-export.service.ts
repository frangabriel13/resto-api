import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  customersExport,
  type CustomersExport,
} from '../../export/customers-export.js';
import { exportInclude } from '../../export/export-row.js';

// El CSV del dueño, para llevarse los datos antes de borrar el comercio.
@Injectable()
export class AdminMerchantExportService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  async customers(adminId: string, id: string): Promise<CustomersExport> {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({ where: { id } });
      if (!merchant) throw new AppException('NOT_FOUND');
      const memberships = await tx.membership.findMany({
        where: { merchantId: id },
        include: exportInclude,
        orderBy: { joinedAt: 'asc' },
      });
      await this.audit.recordAdmin(tx, adminId, id, {
        action: 'merchant.customers_exported',
        entityId: id,
        payload: { rows: memberships.length },
      });
      return customersExport(merchant.slug, memberships);
    });
  }
}
