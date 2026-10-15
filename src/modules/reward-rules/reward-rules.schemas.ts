import { z } from 'zod';

export const createRewardRuleBodySchema = z
  .object({
    stampsRequired: z.number().int().min(1).max(50),
    rewardDescription: z.string().trim().min(1).max(200),
    conditions: z.string().trim().max(500).nullable(),
  })
  .meta({ id: 'CreateRewardRuleBody' });

export const rewardRuleSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int(),
    stampsRequired: z.number().int(),
    rewardDescription: z.string(),
    conditions: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'RewardRule' });

export type CreateRewardRuleBody = z.infer<typeof createRewardRuleBodySchema>;
export type RewardRuleResponse = z.infer<typeof rewardRuleSchema>;
