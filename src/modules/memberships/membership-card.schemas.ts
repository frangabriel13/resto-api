import { z } from 'zod';
import { MerchantStatus } from '../../generated/prisma/client.js';

const ruleSchema = z.object({
  stampsRequired: z.number().int(),
  rewardDescription: z.string(),
  conditions: z.string().nullable(),
});

const historyEntrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('STAMP'),
    id: z.uuid(),
    at: z.iso.datetime(),
    cycle: z.number().int(),
    voided: z.boolean(),
  }),
  z.object({
    type: z.literal('REDEMPTION'),
    id: z.uuid(),
    at: z.iso.datetime(),
    cycle: z.number().int(),
    voided: z.boolean(),
    rewardDescription: z.string(),
  }),
]);

export const membershipCardSchema = z
  .object({
    id: z.uuid(),
    merchant: z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      logoUrl: z.string().nullable(),
      primaryColor: z.string().nullable(),
      secondaryColor: z.string().nullable(),
      googleReviewUrl: z.string().nullable(),
      status: z.enum(MerchantStatus),
    }),
    cycleRule: ruleSchema,
    // La regla vigente del comercio, si cambió: aplica desde el próximo ciclo.
    nextCycleRule: ruleSchema.nullable(),
    cycle: z.number().int(),
    cycleStamps: z.number().int(),
    carryOver: z.number().int(),
    balance: z.number().int(),
    remaining: z.number().int(),
    canRedeem: z.boolean(),
    totalStamps: z.number().int(),
    marketingConsent: z.boolean(),
    joinedAt: z.iso.datetime(),
    history: z.array(historyEntrySchema),
  })
  .meta({ id: 'MembershipCard' });

export type MembershipCard = z.infer<typeof membershipCardSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
