import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { ErrorCode } from '../../common/errors/error-codes.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { Prisma, Redemption } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import {
  panelBalance,
  type MembershipForPanel,
} from '../memberships/panel-membership.js';
import { PanelMembershipsService } from '../memberships/panel-memberships.service.js';
import { StampTokenService } from '../stamps/stamp-token.service.js';
import { planRedemption } from './redemption-plan.js';
import {
  redemptionVoidDenial,
  validStampsInCycle,
  type RedemptionVoidDenial,
} from './redemption-void-rules.js';
import type {
  CreateRedemptionBody,
  RedemptionResult,
  VoidRedemptionResult,
} from './redemptions.schemas.js';

const withRule = { rewardRule: true } as const;

type RedemptionWithRule = Prisma.RedemptionGetPayload<{
  include: typeof withRule;
}>;

const VOID_ERRORS: Record<RedemptionVoidDenial, ErrorCode> = {
  NOT_ALLOWED: 'FORBIDDEN',
  ALREADY_VOIDED: 'REDEMPTION_ALREADY_VOIDED',
  NOT_LAST: 'REDEMPTION_NOT_LAST',
  NEW_CYCLE_HAS_STAMPS: 'NEW_CYCLE_HAS_STAMPS',
};

@Injectable()
export class RedemptionsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly tokens: StampTokenService,
    private readonly memberships: PanelMembershipsService,
    private readonly audit: AuditService,
  ) {}

  async create({
    stampToken,
    idempotencyKey,
  }: CreateRedemptionBody): Promise<RedemptionResult> {
    const token = this.tokens.readOrThrow(stampToken);
    // Con una firma válida, si no aparece es porque es de otro comercio.
    const { id: membershipId } = await this.memberships.find(
      token.membershipId,
      'CUSTOMER_OF_OTHER_MERCHANT',
    );
    await this.memberships.lock(membershipId);

    const existing = await this.tenant.db.redemption.findUnique({
      where: {
        merchantId_idempotencyKey: {
          merchantId: this.tenant.scope.merchantId,
          idempotencyKey,
        },
      },
      include: withRule,
    });
    if (existing) return this.replay(existing, membershipId);

    if (token.expiresAt <= new Date()) {
      throw new AppException('STAMP_TOKEN_EXPIRED');
    }
    const membership = await this.memberships.find(
      membershipId,
      'CUSTOMER_OF_OTHER_MERCHANT',
    );
    this.assertCanRedeem(membership);
    const redemption = await this.redeem(membership, idempotencyKey);
    return this.result(redemption, false);
  }

  async void(
    redemptionId: string,
    reason: string,
  ): Promise<VoidRedemptionResult> {
    const { db } = this.tenant;
    if (this.tenant.scope.merchantStatus === 'ENDED') {
      throw new AppException('MERCHANT_READ_ONLY');
    }
    const found = await db.redemption.findUnique({
      where: { id: redemptionId },
    });
    if (!found) throw new AppException('NOT_FOUND');
    // Mismo bloqueo que el sello: no entra un sello al ciclo nuevo mientras
    // se anula.
    await this.memberships.lock(found.membershipId);

    const redemption = await db.redemption.findUniqueOrThrow({
      where: { id: redemptionId },
    });
    const membership = await this.memberships.find(
      redemption.membershipId,
      'NOT_FOUND',
    );
    this.assertCanVoid(redemption, membership);
    const voidedAt = await this.revert(redemption, reason);
    return {
      redemption: {
        id: redemptionId,
        voidedAt: voidedAt.toISOString(),
        voidReason: reason,
      },
      membership: await this.memberships.view(membership.id),
    };
  }

  // Con el club pausado se canjean las tarjetas ya completas.
  private assertCanRedeem(membership: MembershipForPanel) {
    if (membership.leftAt) throw new AppException('MEMBERSHIP_LEFT');
    if (this.tenant.scope.merchantStatus === 'ENDED') {
      throw new AppException('MERCHANT_READ_ONLY');
    }
  }

  private async redeem(
    membership: MembershipForPanel,
    idempotencyKey: string,
  ): Promise<RedemptionWithRule> {
    const { db } = this.tenant;
    const { merchantId, staffUserId } = this.tenant.scope;
    const balance = panelBalance(membership);
    const plan = planRedemption(balance);
    if (!plan) {
      throw new AppException('INSUFFICIENT_BALANCE', undefined, {
        balance: balance.balance,
        stampsRequired: balance.stampsRequired,
      });
    }

    const redemption = await db.redemption.create({
      data: {
        merchantId,
        membershipId: membership.id,
        cycle: membership.currentCycle,
        rewardRuleId: membership.currentCycleRewardRuleId,
        ...plan,
        confirmedByStaffId: staffUserId,
        idempotencyKey,
      },
      include: withRule,
    });
    // El ciclo nuevo se ata a la regla vigente: si el dueño la cambió, aplica
    // desde acá.
    const activeRule = await db.rewardRule.findFirstOrThrow({
      where: { active: true },
    });
    await db.membership.update({
      where: { id: membership.id },
      data: {
        currentCycle: membership.currentCycle + 1,
        currentCycleRewardRuleId: activeRule.id,
      },
    });
    await this.audit.record({
      action: 'redemption.created',
      entityId: redemption.id,
      payload: {
        membershipId: membership.id,
        cycle: redemption.cycle,
        rewardRuleId: redemption.rewardRuleId,
        ...plan,
      },
    });
    return redemption;
  }

  private assertCanVoid(
    redemption: Redemption,
    membership: MembershipForPanel,
  ) {
    const newCycleStamps = validStampsInCycle(
      membership.stamps,
      membership.currentCycle,
    );
    const denial = redemptionVoidDenial({
      redemption,
      currentCycle: membership.currentCycle,
      newCycleStamps,
      role: this.tenant.scope.role,
    });
    if (!denial) return;
    const details =
      denial === 'NEW_CYCLE_HAS_STAMPS'
        ? { stamps: newCycleStamps }
        : undefined;
    throw new AppException(VOID_ERRORS[denial], undefined, details);
  }

  // La membresía vuelve al ciclo del canje y a su regla: el saldo queda como
  // estaba antes de canjear.
  private async revert(redemption: Redemption, reason: string): Promise<Date> {
    const { db } = this.tenant;
    const voidedAt = new Date();
    await db.redemption.update({
      where: { id: redemption.id },
      data: {
        voidedAt,
        voidedByStaffId: this.tenant.scope.staffUserId,
        voidReason: reason,
      },
    });
    await db.membership.update({
      where: { id: redemption.membershipId },
      data: {
        currentCycle: redemption.cycle,
        currentCycleRewardRuleId: redemption.rewardRuleId,
      },
    });
    await this.audit.record({
      action: 'redemption.voided',
      entityId: redemption.id,
      payload: {
        membershipId: redemption.membershipId,
        cycle: redemption.cycle,
        reason,
      },
    });
    return voidedAt;
  }

  private replay(
    existing: RedemptionWithRule,
    membershipId: string,
  ): Promise<RedemptionResult> {
    if (existing.membershipId !== membershipId) {
      throw new AppException('IDEMPOTENCY_KEY_REUSED');
    }
    return this.result(existing, true);
  }

  private async result(
    redemption: RedemptionWithRule,
    replayed: boolean,
  ): Promise<RedemptionResult> {
    return {
      redemption: {
        id: redemption.id,
        createdAt: redemption.createdAt.toISOString(),
        cycle: redemption.cycle,
        stampsUsed: redemption.stampsUsed,
        carryOver: redemption.carryOver,
        rewardDescription: redemption.rewardRule.rewardDescription,
      },
      membership: await this.memberships.view(redemption.membershipId),
      replayed,
    };
  }
}
