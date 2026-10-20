import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { RewardRule } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { isPanelEditable } from '../merchants/merchant-status.js';
import type {
  CreateRewardRuleBody,
  RewardRuleResponse,
} from './reward-rules.schemas.js';

@Injectable()
export class RewardRulesService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RewardRuleResponse[]> {
    const rules = await this.tenant.db.rewardRule.findMany({
      orderBy: { version: 'desc' },
    });
    return rules.map(toResponse);
  }

  // La regla nueva aplica desde el próximo ciclo de cada cliente: las
  // membresías conservan la versión con la que arrancaron su ciclo.
  async create(body: CreateRewardRuleBody): Promise<RewardRuleResponse> {
    const { merchantId, merchantStatus } = this.tenant.scope;
    if (!isPanelEditable(merchantStatus)) {
      throw new AppException('MERCHANT_READ_ONLY');
    }
    const db = this.tenant.db;
    // Serializa altas simultáneas del mismo comercio (número de versión).
    await db.$queryRaw`SELECT id FROM merchants WHERE id = ${merchantId}::uuid FOR UPDATE`;

    const previous = await db.rewardRule.findFirst({
      orderBy: { version: 'desc' },
    });
    await db.rewardRule.updateMany({
      where: { active: true },
      data: { active: false },
    });
    const rule = await db.rewardRule.create({
      data: {
        ...body,
        merchantId,
        version: (previous?.version ?? 0) + 1,
        active: true,
      },
    });
    await this.audit.record({
      action: 'reward_rule.created',
      entityId: rule.id,
      payload: {
        ...body,
        version: rule.version,
        previousRuleId: previous?.id ?? null,
      },
    });
    return toResponse(rule);
  }
}

function toResponse(rule: RewardRule): RewardRuleResponse {
  return {
    id: rule.id,
    version: rule.version,
    stampsRequired: rule.stampsRequired,
    rewardDescription: rule.rewardDescription,
    conditions: rule.conditions,
    active: rule.active,
    createdAt: rule.createdAt.toISOString(),
  };
}
