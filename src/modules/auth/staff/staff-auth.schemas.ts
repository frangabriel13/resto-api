import { z } from 'zod';
import { MerchantStatus, StaffRole } from '../../../generated/prisma/client.js';

const newPasswordSchema = z.string().min(8).max(128);

export const changeStaffPasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: newPasswordSchema,
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    path: ['newPassword'],
    message: 'La contraseña nueva tiene que ser distinta de la actual.',
  })
  .meta({ id: 'ChangeStaffPasswordBody' });

export const selectMerchantBodySchema = z
  .object({ merchantId: z.uuid() })
  .meta({ id: 'SelectMerchantBody' });

export const staffAccountSchema = z
  .object({
    user: z.object({
      id: z.uuid(),
      name: z.string(),
      email: z.string(),
      mustChangePassword: z.boolean(),
    }),
    merchants: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        slug: z.string(),
        status: z.enum(MerchantStatus),
        hasActiveRule: z.boolean(),
        role: z.enum(StaffRole),
      }),
    ),
    selectedMerchantId: z.uuid().nullable(),
  })
  .meta({ id: 'StaffAccount' });

export type ChangeStaffPasswordBody = z.infer<
  typeof changeStaffPasswordBodySchema
>;
export type SelectMerchantBody = z.infer<typeof selectMerchantBodySchema>;
export type StaffAccount = z.infer<typeof staffAccountSchema>;
