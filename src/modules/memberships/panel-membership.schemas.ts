import { z } from 'zod';

export const panelMembershipSchema = z
  .object({
    id: z.uuid(),
    customer: z.object({
      name: z.string().nullable(),
      // Completo para el OWNER, enmascarado para el EMPLOYEE.
      phone: z.string().nullable(),
    }),
    cycle: z.number().int(),
    balance: z.number().int(),
    stampsRequired: z.number().int(),
    remaining: z.number().int(),
    canRedeem: z.boolean(),
    totalStamps: z.number().int(),
  })
  .meta({ id: 'PanelMembership' });

export const cooldownStatusSchema = z
  .object({
    active: z.boolean(),
    lastStampAt: z.iso.datetime().nullable(),
    retryAfterSeconds: z.number().int(),
  })
  .meta({ id: 'CooldownStatus' });

export type PanelMembership = z.infer<typeof panelMembershipSchema>;
