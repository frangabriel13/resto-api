import { z } from 'zod';
import { StampSource } from '../../generated/prisma/client.js';

// Parámetro con nombre: un schema de objeto en @Query no sale en el OpenAPI.
// Es el `nextCursor` de la página anterior.
export const activityCursorSchema = z.string().max(200).optional();

export type ActivityQuery = { from?: string; to?: string; cursor?: string };

const base = {
  // `<tipo>:<uuid>`: único entre todos los eventos.
  id: z.string(),
  at: z.iso.datetime(),
  customer: z.object({
    membershipId: z.uuid(),
    // null si el cliente borró su cuenta.
    name: z.string().nullable(),
    // Completo para el OWNER, enmascarado para el EMPLOYEE.
    phone: z.string().nullable(),
  }),
};

export const activityEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('STAMP'),
    ...base,
    by: z.string(),
    source: z.enum(StampSource),
    cooldownOverride: z.boolean(),
    voided: z.boolean(),
  }),
  z.object({
    type: z.literal('STAMP_VOIDED'),
    ...base,
    by: z.string(),
    reason: z.string().nullable(),
  }),
  z.object({
    type: z.literal('REDEMPTION'),
    ...base,
    by: z.string(),
    cycle: z.number().int(),
    rewardDescription: z.string(),
    voided: z.boolean(),
  }),
  z.object({
    type: z.literal('REDEMPTION_VOIDED'),
    ...base,
    by: z.string(),
    reason: z.string().nullable(),
  }),
  z.object({
    type: z.literal('JOINED'),
    ...base,
    pieceLabel: z.string().nullable(),
    marketingConsent: z.boolean(),
  }),
]);

export const activityPageSchema = z
  .object({
    items: z.array(activityEventSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ActivityPage' });

export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type ActivityPage = z.infer<typeof activityPageSchema>;
