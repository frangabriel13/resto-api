import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { ErrorCode } from '../../common/errors/error-codes.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { Stamp, StampSource } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import {
  lastValidStampAt,
  panelMembershipInclude,
  toPanelMembership,
  type MembershipForPanel,
} from '../memberships/panel-membership.js';
import { cooldownStatus } from './cooldown.js';
import { StampTokenService } from './stamp-token.service.js';
import type {
  CreateStampBody,
  ScanResult,
  StampResult,
  VoidStampResult,
} from './stamps.schemas.js';
import { voidDenial, type VoidDenial } from './void-rules.js';

type GrantInput = {
  membershipId: string;
  source: StampSource;
  idempotencyKey: string;
  cooldownOverride: boolean;
  tokenExpiresAt?: Date;
};

const VOID_ERRORS: Record<VoidDenial, ErrorCode> = {
  ALREADY_VOIDED: 'STAMP_ALREADY_VOIDED',
  REDEEMED_CYCLE: 'STAMP_IN_REDEEMED_CYCLE',
  NOT_ALLOWED: 'VOID_NOT_ALLOWED',
};

@Injectable()
export class StampsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly tokens: StampTokenService,
    private readonly audit: AuditService,
  ) {}

  // Solo lectura: lo que ve el empleado antes de confirmar.
  async scan(stampToken: string): Promise<ScanResult> {
    const token = this.readToken(stampToken);
    if (token.expiresAt <= new Date()) {
      throw new AppException('STAMP_TOKEN_EXPIRED');
    }
    const membership = await this.findMembership(
      token.membershipId,
      'CUSTOMER_OF_OTHER_MERCHANT',
    );
    if (membership.leftAt) throw new AppException('MEMBERSHIP_LEFT');
    return {
      membership: toPanelMembership(membership, this.tenant.scope.role),
      cooldown: this.cooldownOf(membership),
    };
  }

  create(body: CreateStampBody): Promise<StampResult> {
    const { idempotencyKey, cooldownOverride } = body;
    if ('membershipId' in body) {
      return this.grant(
        {
          membershipId: body.membershipId,
          source: 'MANUAL',
          idempotencyKey,
          cooldownOverride,
        },
        'NOT_FOUND',
      );
    }
    const token = this.readToken(body.stampToken);
    return this.grant(
      {
        membershipId: token.membershipId,
        source: 'QR_SCAN',
        idempotencyKey,
        cooldownOverride,
        tokenExpiresAt: token.expiresAt,
      },
      // Con una firma válida, si no aparece es porque es de otro comercio.
      'CUSTOMER_OF_OTHER_MERCHANT',
    );
  }

  async void(stampId: string, reason: string): Promise<VoidStampResult> {
    const { db } = this.tenant;
    const { merchantStatus, role, staffUserId } = this.tenant.scope;
    if (merchantStatus === 'ENDED')
      throw new AppException('MERCHANT_READ_ONLY');
    const found = await db.stamp.findUnique({ where: { id: stampId } });
    if (!found) throw new AppException('NOT_FOUND');
    // Mismo bloqueo que el sello y el canje: no se cruza con un canje en curso.
    await this.lockMembership(found.membershipId);

    const stamp = await db.stamp.findUniqueOrThrow({ where: { id: stampId } });
    const membership = await this.findMembership(
      stamp.membershipId,
      'NOT_FOUND',
    );
    const denial = voidDenial({
      stamp,
      currentCycle: membership.currentCycle,
      role,
      staffUserId,
      now: new Date(),
    });
    if (denial) throw new AppException(VOID_ERRORS[denial]);

    const voidedAt = new Date();
    await db.stamp.update({
      where: { id: stampId },
      data: { voidedAt, voidedByStaffId: staffUserId, voidReason: reason },
    });
    await this.audit.record({
      action: 'stamp.voided',
      entityId: stampId,
      payload: { membershipId: stamp.membershipId, cycle: stamp.cycle, reason },
    });
    return {
      stamp: {
        id: stampId,
        voidedAt: voidedAt.toISOString(),
        voidReason: reason,
      },
      membership: await this.panelView(stamp.membershipId),
    };
  }

  private async grant(
    input: GrantInput,
    notFound: ErrorCode,
  ): Promise<StampResult> {
    const { db } = this.tenant;
    const { merchantId, merchantStatus, staffUserId } = this.tenant.scope;
    const { id: membershipId } = await this.findMembership(
      input.membershipId,
      notFound,
    );
    // Dos empleados con el mismo cliente quedan en fila: el segundo ve el
    // sello del primero (cooldown) o la misma idempotencyKey.
    await this.lockMembership(membershipId);

    const existing = await db.stamp.findUnique({
      where: {
        merchantId_idempotencyKey: {
          merchantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return this.replay(existing, input);

    if (input.tokenExpiresAt && input.tokenExpiresAt <= new Date()) {
      throw new AppException('STAMP_TOKEN_EXPIRED');
    }
    const membership = await this.findMembership(membershipId, notFound);
    if (membership.leftAt) throw new AppException('MEMBERSHIP_LEFT');
    if (merchantStatus !== 'ACTIVE')
      throw new AppException('MERCHANT_READ_ONLY');

    const cooldown = this.cooldownOf(membership);
    if (cooldown.active && !input.cooldownOverride) {
      throw new AppException('COOLDOWN_ACTIVE', undefined, {
        lastStampAt: cooldown.lastStampAt,
        retryAfterSeconds: cooldown.retryAfterSeconds,
      });
    }

    const stamp = await db.stamp.create({
      data: {
        merchantId,
        membershipId,
        cycle: membership.currentCycle,
        grantedByStaffId: staffUserId,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
        cooldownOverride: cooldown.active,
      },
    });
    await this.audit.record({
      action: 'stamp.created',
      entityId: stamp.id,
      payload: {
        membershipId,
        source: stamp.source,
        cycle: stamp.cycle,
        cooldownOverride: stamp.cooldownOverride,
      },
    });
    return this.result(stamp, false);
  }

  private replay(existing: Stamp, input: GrantInput): Promise<StampResult> {
    if (
      existing.membershipId !== input.membershipId ||
      existing.source !== input.source
    ) {
      throw new AppException('IDEMPOTENCY_KEY_REUSED');
    }
    return this.result(existing, true);
  }

  private async result(stamp: Stamp, replayed: boolean): Promise<StampResult> {
    return {
      stamp: {
        id: stamp.id,
        createdAt: stamp.createdAt.toISOString(),
        cycle: stamp.cycle,
        source: stamp.source,
        cooldownOverride: stamp.cooldownOverride,
      },
      membership: await this.panelView(stamp.membershipId),
      replayed,
    };
  }

  private cooldownOf(membership: MembershipForPanel) {
    return cooldownStatus(
      lastValidStampAt(membership),
      this.tenant.scope.stampCooldownMinutes,
      new Date(),
    );
  }

  private readToken(stampToken: string) {
    const token = this.tokens.read(stampToken);
    if (!token) throw new AppException('STAMP_TOKEN_INVALID');
    return token;
  }

  private async lockMembership(membershipId: string) {
    await this.tenant.db
      .$queryRaw`SELECT id FROM memberships WHERE id = ${membershipId}::uuid FOR UPDATE`;
  }

  private async findMembership(
    id: string,
    notFound: ErrorCode,
  ): Promise<MembershipForPanel> {
    const membership = await this.tenant.db.membership.findUnique({
      where: { id },
      include: panelMembershipInclude,
    });
    if (!membership) throw new AppException(notFound);
    return membership;
  }

  private async panelView(membershipId: string) {
    const membership = await this.findMembership(membershipId, 'NOT_FOUND');
    return toPanelMembership(membership, this.tenant.scope.role);
  }
}
