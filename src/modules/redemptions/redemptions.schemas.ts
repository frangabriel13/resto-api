import { z } from 'zod';
import { panelMembershipSchema } from '../memberships/panel-membership.schemas.js';
import { stampTokenField, voidReasonField } from '../stamps/stamps.schemas.js';

// Solo por QR: es la prueba de que el cliente está en el local.
export const createRedemptionBodySchema = z
  .strictObject({ stampToken: stampTokenField, idempotencyKey: z.uuid() })
  .meta({ id: 'CreateRedemptionBody' });

export const redemptionResultSchema = z
  .object({
    redemption: z.object({
      id: z.uuid(),
      createdAt: z.iso.datetime(),
      cycle: z.number().int(),
      stampsUsed: z.number().int(),
      carryOver: z.number().int(),
      rewardDescription: z.string(),
    }),
    // Ya en el ciclo nuevo, con el sobrante como saldo inicial.
    membership: panelMembershipSchema,
    // true si la idempotencyKey ya se había usado: es el mismo canje.
    replayed: z.boolean(),
  })
  .meta({ id: 'RedemptionResult' });

export const voidRedemptionBodySchema = z
  .object({ reason: voidReasonField })
  .meta({ id: 'VoidRedemptionBody' });

export const voidRedemptionResultSchema = z
  .object({
    redemption: z.object({
      id: z.uuid(),
      voidedAt: z.iso.datetime(),
      voidReason: z.string(),
    }),
    // De vuelta en el ciclo del canje, con el saldo de antes de canjear.
    membership: panelMembershipSchema,
  })
  .meta({ id: 'VoidRedemptionResult' });

export type CreateRedemptionBody = z.infer<typeof createRedemptionBodySchema>;
export type RedemptionResult = z.infer<typeof redemptionResultSchema>;
export type VoidRedemptionBody = z.infer<typeof voidRedemptionBodySchema>;
export type VoidRedemptionResult = z.infer<typeof voidRedemptionResultSchema>;
