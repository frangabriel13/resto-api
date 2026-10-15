import { z } from 'zod';
import { emailSchema } from '../../../common/schemas.js';

export const createOwnerBodySchema = z
  .object({ email: emailSchema, name: z.string().trim().min(1).max(100) })
  .meta({ id: 'CreateOwnerBody' });

export const createdOwnerSchema = z
  .object({
    staffUserId: z.uuid(),
    email: z.string(),
    name: z.string(),
    newUser: z.boolean(),
    // Solo para un usuario nuevo; se muestra una única vez.
    temporaryPassword: z.string().nullable(),
  })
  .meta({ id: 'CreatedOwner' });

export type CreateOwnerBody = z.infer<typeof createOwnerBodySchema>;
export type CreatedOwner = z.infer<typeof createdOwnerSchema>;
