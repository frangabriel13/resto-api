import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { Merchant, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { isPanelEditable } from '../merchants/merchant-status.js';
import { fieldChanges } from './field-changes.js';
import type { MerchantSettings, SettingsView } from './settings.schemas.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<SettingsView> {
    return toView(await this.current());
  }

  // El cooldown nuevo aplica desde el próximo sello: el guard lee el comercio
  // en cada request.
  async update(settings: MerchantSettings): Promise<SettingsView> {
    const { merchantId, merchantStatus } = this.tenant.scope;
    if (!isPanelEditable(merchantStatus)) {
      throw new AppException('MERCHANT_READ_ONLY');
    }
    const current = await this.current();
    const changes = fieldChanges(current, settings);
    if (Object.keys(changes).length === 0) return toView(current);

    const updated = await this.tenant.db.merchant.update({
      where: { id: merchantId },
      data: settings,
    });
    await this.audit.record({
      action: 'merchant.updated',
      entityId: merchantId,
      payload: changes as Prisma.InputJsonObject,
    });
    return toView(updated);
  }

  private current(): Promise<Merchant> {
    return this.tenant.db.merchant.findUniqueOrThrow({
      where: { id: this.tenant.scope.merchantId },
    });
  }
}

function toView(merchant: Merchant): SettingsView {
  return {
    merchant: {
      name: merchant.name,
      slug: merchant.slug,
      logoUrl: merchant.logoUrl,
      status: merchant.status,
    },
    settings: {
      primaryColor: merchant.primaryColor,
      secondaryColor: merchant.secondaryColor,
      googleReviewUrl: merchant.googleReviewUrl,
      stampCooldownMinutes: merchant.stampCooldownMinutes,
    },
  };
}
