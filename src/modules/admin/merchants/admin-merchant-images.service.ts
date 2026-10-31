import { Injectable } from '@nestjs/common';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { ImagesService, type ImageKind } from '../../images/images.service.js';
import type { MerchantResponse } from './admin-merchants.schemas.js';
import { toResponse } from './admin-merchants.service.js';
import { assertMerchantEditable } from './editable-merchant.js';
import { lockMerchant } from './lock-merchant.js';

const COLUMN = { logo: 'logoUrl', cover: 'coverUrl' } as const;

@Injectable()
export class AdminMerchantImagesService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
    private readonly images: ImagesService,
  ) {}

  // file en null saca la imagen. La anterior se borra del bucket recién
  // después del commit; si la transacción falla, se borra la recién subida.
  async replace(
    adminId: string,
    id: string,
    kind: ImageKind,
    file: Buffer | null,
  ): Promise<MerchantResponse> {
    await assertMerchantEditable(this.prisma, id);
    const url = file ? await this.images.upload(id, kind, file) : null;
    try {
      const { previous, merchant } = await this.prisma.$transaction(
        async (tx) => {
          await lockMerchant(tx, id);
          await assertMerchantEditable(tx, id);
          const current = await tx.merchant.findUniqueOrThrow({
            where: { id },
          });
          const merchant = await tx.merchant.update({
            where: { id },
            data: { [COLUMN[kind]]: url },
            include: { profile: true },
          });
          const previous = current[COLUMN[kind]];
          if (previous !== url) {
            await this.audit.recordAdmin(
              tx,
              adminId,
              id,
              auditEvent(id, kind, previous, url),
            );
          }
          return { previous, merchant };
        },
      );
      if (previous !== url) await this.images.discard(previous);
      return toResponse(merchant);
    } catch (error) {
      await this.images.discard(url);
      throw error;
    }
  }
}

// El logo es un dato más del comercio; la portada, de su página.
export function auditEvent(
  id: string,
  kind: ImageKind,
  from: string | null,
  to: string | null,
) {
  return kind === 'logo'
    ? {
        action: 'merchant.updated' as const,
        entityId: id,
        payload: { logoUrl: { from, to } },
      }
    : {
        action: 'merchant_page.updated' as const,
        entityId: id,
        payload: { changedFields: ['coverUrl'] },
      };
}
