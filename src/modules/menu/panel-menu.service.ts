import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../audit/audit.service.js';
import { lockMerchant } from '../merchants/lock-merchant.js';
import { isPanelEditable } from '../merchants/merchant-status.js';
import { readMenu, type MenuChange, type MenuScope } from './menu-editor.js';
import type { Menu } from './menu.schemas.js';

@Injectable()
export class PanelMenuService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  get(): Promise<Menu> {
    return readMenu(this.scope());
  }

  async apply(change: MenuChange): Promise<Menu> {
    if (!isPanelEditable(this.tenant.scope.merchantStatus)) {
      throw new AppException('MERCHANT_READ_ONLY');
    }
    await lockMerchant(this.tenant.db, this.tenant.scope.merchantId);
    const scope = this.scope();
    await change(scope);
    return readMenu(scope);
  }

  private scope(): MenuScope {
    return {
      // Es el mismo cliente con la extensión: los genéricos de Prisma no lo unifican.
      db: this.tenant.db as unknown as MenuScope['db'],
      merchantId: this.tenant.scope.merchantId,
      record: (event) => this.audit.record(event),
    };
  }
}
