import { z } from 'zod';
import { StaffRole } from '../../generated/prisma/client.js';
import { emailSchema } from '../../common/schemas.js';

export const createStaffBodySchema = z
  .object({ email: emailSchema, name: z.string().trim().min(1).max(100) })
  .meta({ id: 'CreateStaffBody' });

export const updateStaffBodySchema = z
  .strictObject({ active: z.boolean() })
  .meta({ id: 'UpdateStaffBody' });

export const staffMemberSchema = z
  .object({
    staffUserId: z.uuid(),
    name: z.string(),
    email: z.string(),
    role: z.enum(StaffRole),
    active: z.boolean(),
    // Todavía no entró a cambiar la contraseña temporal.
    pendingFirstLogin: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'StaffMember' });

export const createdStaffSchema = z
  .object({
    staff: staffMemberSchema,
    // Solo para una cuenta nueva; se muestra una única vez.
    temporaryPassword: z.string().nullable(),
  })
  .meta({ id: 'CreatedStaff' });

export const passwordResetSchema = z
  .object({ temporaryPassword: z.string() })
  .meta({ id: 'StaffPasswordReset' });

export type CreateStaffBody = z.infer<typeof createStaffBodySchema>;
export type StaffMember = z.infer<typeof staffMemberSchema>;
export type CreatedStaff = z.infer<typeof createdStaffSchema>;
export type PasswordReset = z.infer<typeof passwordResetSchema>;
