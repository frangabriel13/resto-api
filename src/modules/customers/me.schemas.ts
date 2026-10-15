import { z } from 'zod';

export const customerNameSchema = z.string().trim().min(1).max(60);

export const updateMeBodySchema = z
  .object({ name: customerNameSchema })
  .meta({ id: 'UpdateMeBody' });

export const meSchema = z
  .object({ id: z.uuid(), name: z.string(), phoneE164: z.string() })
  .meta({ id: 'Me' });

export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;
export type MeResponse = z.infer<typeof meSchema>;
