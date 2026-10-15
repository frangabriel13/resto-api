import { z } from 'zod';

export const adminAccountSchema = z
  .object({ id: z.uuid(), name: z.string(), email: z.string() })
  .meta({ id: 'AdminAccount' });

export type AdminAccount = z.infer<typeof adminAccountSchema>;
