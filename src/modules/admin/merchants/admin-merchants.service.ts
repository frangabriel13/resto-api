import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import type { Merchant, Prisma } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { isAllowedTransition } from '../../merchants/merchant-status.js';
import { slugify } from '../../merchants/slug.js';
import type {
  CreateMerchantBody,
  MerchantResponse,
  MerchantSummary,
  UpdateMerchantBody,
} from './admin-merchants.schemas.js';

@Injectable()
export class AdminMerchantsService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<MerchantSummary[]> {
    const merchants = await this.prisma.merchant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        rewardRules: { where: { active: true }, select: { id: true } },
        _count: {
          select: {
            staffMemberships: { where: { role: 'OWNER', active: true } },
          },
        },
      },
    });
    return merchants.map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      status: merchant.status,
      hasActiveRule: merchant.rewardRules.length > 0,
      activeOwners: merchant._count.staffMemberships,
      createdAt: merchant.createdAt.toISOString(),
    }));
  }

  async get(id: string): Promise<MerchantResponse> {
    return toResponse(await this.findOrFail(this.prisma, id));
  }

  async create(
    adminId: string,
    body: CreateMerchantBody,
  ): Promise<MerchantResponse> {
    const slug = body.slug ?? slugify(body.name);
    if (!slug) {
      throw new AppException('VALIDATION_ERROR', undefined, {
        issues: [{ path: 'slug', message: 'Indicá un slug para el comercio.' }],
      });
    }
    return this.withSlugCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const merchant = await tx.merchant.create({ data: { ...body, slug } });
        await this.audit.recordAdmin(tx, adminId, merchant.id, {
          action: 'merchant.created',
          entityId: merchant.id,
          payload: { ...body, slug },
        });
        return toResponse(merchant);
      }),
    );
  }

  async update(
    adminId: string,
    id: string,
    body: UpdateMerchantBody,
  ): Promise<MerchantResponse> {
    return this.withSlugCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await this.findOrFail(tx, id);
        await assertCanUpdate(tx, current, body);
        const merchant = await tx.merchant.update({
          where: { id },
          data: body,
        });
        await this.audit.recordAdmin(tx, adminId, id, {
          action: 'merchant.updated',
          entityId: id,
          payload: { ...body, previousStatus: current.status },
        });
        return toResponse(merchant);
      }),
    );
  }

  private async findOrFail(
    db: Pick<Prisma.TransactionClient, 'merchant'>,
    id: string,
  ): Promise<Merchant> {
    const merchant = await db.merchant.findUnique({ where: { id } });
    if (!merchant) throw new AppException('NOT_FOUND');
    return merchant;
  }

  private async withSlugCheck<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('SLUG_TAKEN');
      throw error;
    }
  }
}

async function assertCanUpdate(
  tx: Prisma.TransactionClient,
  current: Merchant,
  { slug, status }: UpdateMerchantBody,
) {
  if (
    slug !== undefined &&
    slug !== current.slug &&
    current.status !== 'DRAFT'
  ) {
    throw new AppException('SLUG_LOCKED');
  }
  if (status === undefined || status === current.status) return;
  if (!isAllowedTransition(current.status, status)) {
    throw new AppException('INVALID_STATUS_TRANSITION');
  }
  if (status === 'ACTIVE') {
    const activeRule = await tx.rewardRule.findFirst({
      where: { merchantId: current.id, active: true },
    });
    if (!activeRule) throw new AppException('ACTIVE_RULE_REQUIRED');
  }
}

function toResponse(merchant: Merchant): MerchantResponse {
  return {
    ...merchant,
    createdAt: merchant.createdAt.toISOString(),
    updatedAt: merchant.updatedAt.toISOString(),
  };
}
