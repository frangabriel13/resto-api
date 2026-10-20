import { z } from 'zod';
import { emailSchema } from '../../../../common/schemas.js';
import { newPasswordSchema } from '../staff-auth.schemas.js';

export const requestPasswordResetBodySchema = z
  .object({ email: emailSchema })
  .meta({ id: 'RequestPasswordResetBody' });

export const confirmPasswordResetBodySchema = z
  .object({ token: z.string().min(1).max(100), newPassword: newPasswordSchema })
  .meta({ id: 'ConfirmPasswordResetBody' });

export type RequestPasswordResetBody = z.infer<
  typeof requestPasswordResetBodySchema
>;
export type ConfirmPasswordResetBody = z.infer<
  typeof confirmPasswordResetBodySchema
>;
