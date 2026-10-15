import { z } from 'zod';
import { emailSchema } from '../../common/schemas.js';

export const loginBodySchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .meta({ id: 'LoginBody' });

export type LoginBody = z.infer<typeof loginBodySchema>;
