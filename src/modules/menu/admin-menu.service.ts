import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaAdminService } from '../../prisma/prisma-admin.service.js';
import { assertMerchantEditable } from '../admin/merchants/editable-merchant.js';
import { AuditService } from '../audit/audit.service.js';
import { lockMerchant } from '../merchants/lock-merchant.js';
import { readMenu, type MenuChange, type MenuScope } from './menu-editor.js';
import type { Menu } from './menu.schemas.js';

// A diferencia del dueño, el admin edita en cualquier estado del club, salvo
// con el comercio archivado (como el Wi-Fi y las redes).
@Injectable()
export class AdminMenuService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  async get(merchantId: string): Promise<Menu> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new AppException('NOT_FOUND');
    return readMenu({ db: this.prisma, merchantId, record: noAudit });
  }

  apply(
    adminId: string,
    merchantId: string,
    change: MenuChange,
  ): Promise<Menu> {
    return this.prisma.$transaction(async (tx) => {
      await lockMerchant(tx, merchantId);
      await assertMerchantEditable(tx, merchantId);
      const scope: MenuScope = {
        db: tx,
        merchantId,
        record: (event) =>
          this.audit.recordAdmin(tx, adminId, merchantId, event),
      };
      await change(scope);
      return readMenu(scope);
    });
  }
}

const noAudit = () => Promise.resolve();
