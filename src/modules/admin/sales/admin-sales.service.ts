import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import type { Sale } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type {
  CreateSaleBody,
  SaleResponse,
  UpdateSaleBody,
} from './admin-sales.schemas.js';

type SaleWithCount = Sale & { _count: { pieces: number } };

@Injectable()
export class AdminSalesService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  // merchantId filtra la lista de un comercio (ficha del comercio); sin
  // filtro es el tablero de ventas general.
  async list(merchantId?: string): Promise<SaleResponse[]> {
    const sales = await this.prisma.sale.findMany({
      where: merchantId ? { merchantId } : undefined,
      include: { _count: { select: { pieces: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return sales.map(toResponse);
  }

  async create(
    adminId: string,
    merchantId: string,
    body: CreateSaleBody,
  ): Promise<SaleResponse> {
    await this.assertMerchantExists(merchantId);
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: { ...body, merchantId, soldByAdminId: adminId },
      });
      await this.audit.recordAdmin(tx, adminId, merchantId, {
        action: 'sale.created',
        entityId: sale.id,
        payload: { product: sale.product, tagCount: sale.tagCount },
      });
      return toResponse({ ...sale, _count: { pieces: 0 } });
    });
  }

  async update(
    adminId: string,
    saleId: string,
    body: UpdateSaleBody,
  ): Promise<SaleResponse> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.sale.findUnique({ where: { id: saleId } });
      if (!found) throw new AppException('NOT_FOUND');
      const sale = await tx.sale.update({
        where: { id: saleId },
        data: body,
        include: { _count: { select: { pieces: true } } },
      });
      await this.audit.recordAdmin(tx, adminId, found.merchantId, {
        action: 'sale.updated',
        entityId: saleId,
        payload: { ...body },
      });
      return toResponse(sale);
    });
  }

  private async assertMerchantExists(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new AppException('NOT_FOUND');
  }
}

function toResponse(sale: SaleWithCount): SaleResponse {
  return {
    id: sale.id,
    merchantId: sale.merchantId,
    product: sale.product,
    tagCount: sale.tagCount,
    amount: sale.amount?.toString() ?? null,
    paymentMethod: sale.paymentMethod,
    paymentStatus: sale.paymentStatus,
    soldByAdminId: sale.soldByAdminId,
    notes: sale.notes,
    pieceCount: sale._count.pieces,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
  };
}
