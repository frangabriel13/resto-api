import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { Merchant, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { ImagesService } from '../images/images.service.js';
import {
  applyPageChanges,
  toMerchantPage,
} from '../merchants/merchant-page.js';
import { isPanelEditable } from '../merchants/merchant-status.js';
import { fieldChanges } from './field-changes.js';
import type { SettingsView, UpdateSettingsBody } from './settings.schemas.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly images: ImagesService,
  ) {}

  async get(): Promise<SettingsView> {
    return toView(await this.current());
  }

  // El cooldown nuevo aplica desde el próximo sello: el guard lee el comercio
  // en cada request.
  // De la página se audita solo qué campos cambiaron: el WhatsApp puede ser
  // un celular personal.
  async update({
    page,
    ...settings
  }: UpdateSettingsBody): Promise<SettingsView> {
    const { merchantId } = this.tenant.scope;
    this.assertEditable();
    const current = await this.current();
    const changes = fieldChanges(current, settings);
    const pageChanges = applyPageChanges(toMerchantPage(current), page);
    if (!Object.keys(changes).length && !pageChanges.changedFields.length) {
      return toView(current);
    }

    const updated = await this.tenant.db.merchant.update({
      where: { id: merchantId },
      data: { ...settings, ...pageChanges.data },
    });
    if (Object.keys(changes).length) {
      await this.audit.record({
        action: 'merchant.updated',
        entityId: merchantId,
        payload: changes as Prisma.InputJsonObject,
      });
    }
    if (pageChanges.changedFields.length) {
      await this.audit.record({
        action: 'merchant_page.updated',
        entityId: merchantId,
        payload: { changedFields: pageChanges.changedFields },
      });
    }
    return toView(updated);
  }

  // file en null la saca. La anterior se borra del bucket después del commit
  // del request: si algo falla antes, el comercio sigue con su imagen.
  async replaceCover(file: Buffer | null): Promise<SettingsView> {
    const { merchantId } = this.tenant.scope;
    this.assertEditable();
    const previous = (await this.current()).coverUrl;
    const url = file
      ? await this.images.upload(merchantId, 'cover', file)
      : null;
    const updated = await this.tenant.db.merchant.update({
      where: { id: merchantId },
      data: { coverUrl: url },
    });
    if (previous !== url) {
      await this.audit.record({
        action: 'merchant_page.updated',
        entityId: merchantId,
        payload: { changedFields: ['coverUrl'] },
      });
      this.tenant.afterCommit(() => this.images.discard(previous));
    }
    return toView(updated);
  }

  private assertEditable() {
    if (!isPanelEditable(this.tenant.scope.merchantStatus)) {
      throw new AppException('MERCHANT_READ_ONLY');
    }
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
    page: toMerchantPage(merchant),
  };
}
