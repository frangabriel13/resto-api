import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import type {
  Merchant,
  MerchantProfile,
  MerchantStatus,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  isAllowedTransition,
  isArchivable,
} from '../../merchants/merchant-status.js';
import {
  applyPageChanges,
  NO_PAGE,
  toMerchantPage,
} from '../../merchants/merchant-page.js';
import { slugify, slugWithSuffix } from '../../merchants/slug.js';
import type {
  CreateMerchantBody,
  MerchantResponse,
  MerchantSummary,
  UpdateMerchantBody,
} from './admin-merchants.schemas.js';
import { lockMerchant } from './lock-merchant.js';
import {
  applyProfileChanges,
  toProfileData,
  toProfileResponse,
} from './merchant-profile.js';

export type MerchantWithProfile = Merchant & {
  profile: MerchantProfile | null;
};
type MerchantDb = Pick<Prisma.TransactionClient, 'merchant'>;

@Injectable()
export class AdminMerchantsService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  // Los archivados van aparte: o se listan ellos solos, o no aparecen.
  async list(
    status: MerchantStatus | undefined,
    archived: boolean,
  ): Promise<MerchantSummary[]> {
    const merchants = await this.prisma.merchant.findMany({
      where: { status, archivedAt: archived ? { not: null } : null },
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
      archivedAt: merchant.archivedAt?.toISOString() ?? null,
      createdAt: merchant.createdAt.toISOString(),
    }));
  }

  async get(id: string): Promise<MerchantResponse> {
    return toResponse(await this.findOrFail(this.prisma, id));
  }

  async create(
    adminId: string,
    { profile, page, ...fields }: CreateMerchantBody,
  ): Promise<MerchantResponse> {
    const baseSlug = fields.slug ?? slugify(fields.name);
    if (!baseSlug) {
      throw new AppException('VALIDATION_ERROR', undefined, {
        issues: [{ path: 'slug', message: 'Indicá un slug para el comercio.' }],
      });
    }
    const { next, changedFields } = applyProfileChanges(
      toProfileResponse(null),
      profile,
    );
    const pageChanges = applyPageChanges(NO_PAGE, page);
    return this.withSlugCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const slug = fields.slug ?? (await availableSlug(tx, baseSlug));
        const merchant = await tx.merchant.create({
          data: {
            ...fields,
            ...pageChanges.data,
            slug,
            profile: changedFields.length
              ? { create: toProfileData(next) }
              : undefined,
          },
          include: { profile: true },
        });
        // De la ficha y la página, solo qué campos se cargaron: nunca los valores.
        await this.audit.recordAdmin(tx, adminId, merchant.id, {
          action: 'merchant.created',
          entityId: merchant.id,
          payload: {
            ...fields,
            slug,
            profileFields: changedFields,
            pageFields: pageChanges.changedFields,
          },
        });
        return toResponse(merchant);
      }),
    );
  }

  async update(
    adminId: string,
    id: string,
    { profile, page, ...fields }: UpdateMerchantBody,
  ): Promise<MerchantResponse> {
    return this.withSlugCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await this.findOrFail(tx, id);
        await assertCanUpdate(tx, current, fields);
        const { next, changedFields } = applyProfileChanges(
          toProfileResponse(current.profile),
          profile,
        );
        const profileData = toProfileData(next);
        const pageChanges = applyPageChanges(toMerchantPage(current), page);
        const merchant = await tx.merchant.update({
          where: { id },
          data: {
            ...fields,
            ...(pageChanges.changedFields.length && pageChanges.data),
            profile: changedFields.length
              ? { upsert: { create: profileData, update: profileData } }
              : undefined,
          },
          include: { profile: true },
        });
        if (Object.keys(fields).length) {
          await this.audit.recordAdmin(tx, adminId, id, {
            action: 'merchant.updated',
            entityId: id,
            payload: { ...fields, previousStatus: current.status },
          });
        }
        if (changedFields.length) {
          await this.audit.recordAdmin(tx, adminId, id, {
            action: 'merchant_profile.updated',
            entityId: id,
            payload: { changedFields },
          });
        }
        if (pageChanges.changedFields.length) {
          await this.audit.recordAdmin(tx, adminId, id, {
            action: 'merchant_page.updated',
            entityId: id,
            payload: { changedFields: pageChanges.changedFields },
          });
        }
        return toResponse(merchant);
      }),
    );
  }

  // Desactiva las piezas; al desarchivar se reactivan a mano.
  async archive(adminId: string, id: string): Promise<MerchantResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockMerchant(tx, id);
      const current = await this.findOrFail(tx, id);
      if (current.archivedAt) return toResponse(current);
      if (!isArchivable(current.status)) {
        throw new AppException('MERCHANT_NOT_ARCHIVABLE');
      }
      const merchant = await tx.merchant.update({
        where: { id },
        data: { archivedAt: new Date() },
        include: { profile: true },
      });
      const pieces = await tx.piece.updateMany({
        where: { merchantId: id, active: true },
        data: { active: false },
      });
      await this.audit.recordAdmin(tx, adminId, id, {
        action: 'merchant.archived',
        entityId: id,
        payload: { deactivatedPieces: pieces.count },
      });
      return toResponse(merchant);
    });
  }

  async unarchive(adminId: string, id: string): Promise<MerchantResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockMerchant(tx, id);
      const current = await this.findOrFail(tx, id);
      if (!current.archivedAt) return toResponse(current);
      const merchant = await tx.merchant.update({
        where: { id },
        data: { archivedAt: null },
        include: { profile: true },
      });
      await this.audit.recordAdmin(tx, adminId, id, {
        action: 'merchant.unarchived',
        entityId: id,
      });
      return toResponse(merchant);
    });
  }

  private async findOrFail(
    db: MerchantDb,
    id: string,
  ): Promise<MerchantWithProfile> {
    const merchant = await db.merchant.findUnique({
      where: { id },
      include: { profile: true },
    });
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
  { slug, status }: Omit<UpdateMerchantBody, 'profile'>,
) {
  if (current.archivedAt) throw new AppException('MERCHANT_ARCHIVED');
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

// Si el slug que sale del nombre ya existe, se le suma un número.
async function availableSlug(db: MerchantDb, base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const slug = slugWithSuffix(base, n);
    const taken = await db.merchant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) return slug;
  }
}

export function toResponse(merchant: MerchantWithProfile): MerchantResponse {
  return {
    id: merchant.id,
    name: merchant.name,
    slug: merchant.slug,
    logoUrl: merchant.logoUrl,
    primaryColor: merchant.primaryColor,
    secondaryColor: merchant.secondaryColor,
    googleReviewUrl: merchant.googleReviewUrl,
    stampCooldownMinutes: merchant.stampCooldownMinutes,
    status: merchant.status,
    archivedAt: merchant.archivedAt?.toISOString() ?? null,
    createdAt: merchant.createdAt.toISOString(),
    updatedAt: merchant.updatedAt.toISOString(),
    profile: toProfileResponse(merchant.profile),
    page: toMerchantPage(merchant),
  };
}
