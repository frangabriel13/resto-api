import { z } from 'zod';
import { StampSource } from '../../generated/prisma/client.js';
import {
  cooldownStatusSchema,
  panelMembershipSchema,
} from '../memberships/panel-membership.schemas.js';

const stampTokenField = z.string().min(1).max(200);
const grantFields = {
  idempotencyKey: z.uuid(),
  // El empleado confirma que es otro consumo dentro del cooldown.
  cooldownOverride: z.boolean().default(false),
};

export const scanBodySchema = z
  .object({ stampToken: stampTokenField })
  .meta({ id: 'ScanBody' });

// Por QR o, si falla la cámara, manual con la membresía buscada en el panel.
export const createStampBodySchema = z
  .union([
    z.strictObject({ stampToken: stampTokenField, ...grantFields }),
    z.strictObject({ membershipId: z.uuid(), ...grantFields }),
  ])
  .meta({ id: 'CreateStampBody' });

export const voidStampBodySchema = z
  .object({ reason: z.string().trim().min(1).max(200) })
  .meta({ id: 'VoidStampBody' });

export const scanResultSchema = z
  .object({ membership: panelMembershipSchema, cooldown: cooldownStatusSchema })
  .meta({ id: 'ScanResult' });

export const stampResultSchema = z
  .object({
    stamp: z.object({
      id: z.uuid(),
      createdAt: z.iso.datetime(),
      cycle: z.number().int(),
      source: z.enum(StampSource),
      cooldownOverride: z.boolean(),
    }),
    membership: panelMembershipSchema,
    // true si la idempotencyKey ya se había usado: es el mismo sello.
    replayed: z.boolean(),
  })
  .meta({ id: 'StampResult' });

export const voidStampResultSchema = z
  .object({
    stamp: z.object({
      id: z.uuid(),
      voidedAt: z.iso.datetime(),
      voidReason: z.string(),
    }),
    membership: panelMembershipSchema,
  })
  .meta({ id: 'VoidStampResult' });

export type ScanBody = z.infer<typeof scanBodySchema>;
export type CreateStampBody = z.infer<typeof createStampBodySchema>;
export type VoidStampBody = z.infer<typeof voidStampBodySchema>;
export type ScanResult = z.infer<typeof scanResultSchema>;
export type StampResult = z.infer<typeof stampResultSchema>;
export type VoidStampResult = z.infer<typeof voidStampResultSchema>;
