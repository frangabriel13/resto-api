import { z } from 'zod';
import { StampSource } from '../../generated/prisma/client.js';
import {
  cooldownStatusSchema,
  panelMembershipSchema,
} from '../memberships/panel-membership.schemas.js';

export const searchCustomersQuerySchema = z
  .object({ query: z.string().trim().min(2).max(50) })
  .meta({ id: 'SearchCustomersQuery' });

const voidedSchema = z
  .object({
    at: z.iso.datetime(),
    by: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .nullable();

const historyEntrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('STAMP'),
    id: z.uuid(),
    at: z.iso.datetime(),
    cycle: z.number().int(),
    source: z.enum(StampSource),
    cooldownOverride: z.boolean(),
    grantedBy: z.string(),
    voided: voidedSchema,
    // Si quien mira la ficha puede anularlo ahora.
    canVoid: z.boolean(),
  }),
  z.object({
    type: z.literal('REDEMPTION'),
    id: z.uuid(),
    at: z.iso.datetime(),
    cycle: z.number().int(),
    stampsUsed: z.number().int(),
    carryOver: z.number().int(),
    rewardDescription: z.string(),
    confirmedBy: z.string(),
    voided: voidedSchema,
  }),
]);

export const customerDetailSchema = z
  .object({
    membership: panelMembershipSchema,
    joinedAt: z.iso.datetime(),
    leftAt: z.iso.datetime().nullable(),
    marketingConsent: z.boolean(),
    cooldown: cooldownStatusSchema,
    history: z.array(historyEntrySchema),
  })
  .meta({ id: 'CustomerDetail' });

export type SearchCustomersQuery = z.infer<typeof searchCustomersQuerySchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
export type CustomerHistoryEntry = z.infer<typeof historyEntrySchema>;
