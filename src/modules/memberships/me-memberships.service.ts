import { Injectable } from '@nestjs/common';
import { CustomerContext } from '../../common/customer-scope/customer-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Membership, Prisma } from '../../generated/prisma/client.js';
import { calculateBalance } from './membership-balance.js';
import { cardInclude, toCard } from './membership-card.js';
import type { MembershipCard } from './membership-card.schemas.js';
import type {
  JoinClubBody,
  JoinClubResult,
  MembershipSummary,
} from './me-memberships.schemas.js';

const summaryInclude = {
  merchant: true,
  currentCycleRewardRule: true,
  stamps: { select: { cycle: true, voidedAt: true } },
  redemptions: { select: { cycle: true, carryOver: true, voidedAt: true } },
} as const;

type MembershipWithEvents = Prisma.MembershipGetPayload<{
  include: typeof summaryInclude;
}>;

@Injectable()
export class MeMembershipsService {
  constructor(private readonly customer: CustomerContext) {}

  async list(): Promise<MembershipSummary[]> {
    const memberships = await this.customer.db.membership.findMany({
      where: { leftAt: null },
      include: summaryInclude,
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map(toSummary);
  }

  // Solo lectura: consultar la tarjeta nunca suma sellos.
  async getCard(membershipId: string): Promise<MembershipCard> {
    const membership = await this.customer.db.membership.findFirst({
      where: { id: membershipId, leftAt: null },
      include: cardInclude,
    });
    if (!membership) throw new AppException('NOT_FOUND');
    return toCard(membership);
  }

  async join(body: JoinClubBody): Promise<JoinClubResult> {
    const { db, customerId } = this.customer;
    // Serializa altas simultáneas del mismo cliente (doble toque).
    await db.$queryRaw`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;

    const merchant = await db.merchant.findUnique({
      where: { id: body.merchantId },
      include: { rewardRules: { where: { active: true } } },
    });
    if (!merchant) throw new AppException('NOT_FOUND');
    const existing = await db.membership.findUnique({
      where: { customerId_merchantId: { customerId, merchantId: merchant.id } },
    });
    if (existing && !existing.leftAt) {
      return { membership: await this.summary(existing.id), isNew: false };
    }

    const [rule] = merchant.rewardRules;
    if (merchant.status !== 'ACTIVE' || !rule) {
      throw new AppException('MERCHANT_NOT_ACCEPTING_MEMBERS');
    }
    const consent = body.marketingConsent ? grantConsent(new Date()) : {};
    // Si había salido, vuelve con la misma fila: conserva ciclo y sellos.
    const membership = existing
      ? await db.membership.update({
          where: { id: existing.id },
          data: { leftAt: null, ...consent },
        })
      : await db.membership.create({
          data: {
            customerId,
            merchantId: merchant.id,
            currentCycleRewardRuleId: rule.id,
            joinedViaPieceId: await this.findPieceId(
              merchant.id,
              body.pieceCode,
            ),
            ...consent,
          },
        });
    return { membership: await this.summary(membership.id), isNew: true };
  }

  async updateConsent(
    membershipId: string,
    marketingConsent: boolean,
  ): Promise<MembershipSummary> {
    const membership = await this.findActive(membershipId);
    if (membership.marketingConsent !== marketingConsent) {
      const now = new Date();
      await this.customer.db.membership.update({
        where: { id: membershipId },
        data: marketingConsent
          ? grantConsent(now)
          : { marketingConsent: false, marketingConsentRevokedAt: now },
      });
    }
    return this.summary(membershipId);
  }

  private async findActive(membershipId: string): Promise<Membership> {
    const membership = await this.customer.db.membership.findFirst({
      where: { id: membershipId, leftAt: null },
    });
    if (!membership) throw new AppException('NOT_FOUND');
    return membership;
  }

  private async findPieceId(merchantId: string, publicCode?: string) {
    if (!publicCode) return null;
    const piece = await this.customer.db.piece.findFirst({
      where: { publicCode, merchantId, active: true },
    });
    return piece?.id ?? null;
  }

  private async summary(membershipId: string): Promise<MembershipSummary> {
    const membership = await this.customer.db.membership.findUniqueOrThrow({
      where: { id: membershipId },
      include: summaryInclude,
    });
    return toSummary(membership);
  }
}

function grantConsent(now: Date) {
  return {
    marketingConsent: true,
    marketingConsentAt: now,
    marketingConsentRevokedAt: null,
  };
}

function toSummary(membership: MembershipWithEvents): MembershipSummary {
  const { merchant } = membership;
  const balance = calculateBalance({
    membership,
    cycleRule: membership.currentCycleRewardRule,
    stamps: membership.stamps,
    redemptions: membership.redemptions,
  });
  return {
    id: membership.id,
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      logoUrl: merchant.logoUrl,
      primaryColor: merchant.primaryColor,
      secondaryColor: merchant.secondaryColor,
      status: merchant.status,
    },
    cycle: balance.cycle,
    balance: balance.balance,
    stampsRequired: balance.stampsRequired,
    remaining: balance.remaining,
    canRedeem: balance.canRedeem,
    marketingConsent: membership.marketingConsent,
    joinedAt: membership.joinedAt.toISOString(),
  };
}
