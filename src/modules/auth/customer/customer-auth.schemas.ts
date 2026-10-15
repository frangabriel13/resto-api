import { z } from 'zod';
import { normalizeArMobile } from '../../customers/phone.js';

const phoneSchema = z
  .string()
  .max(40)
  .transform((value, ctx) => {
    const phone = normalizeArMobile(value);
    if (!phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Ingresá un celular argentino válido.',
      });
      return z.NEVER;
    }
    return phone;
  });

export const requestOtpBodySchema = z
  .object({ phone: phoneSchema })
  .meta({ id: 'RequestOtpBody' });

export const otpRequestedSchema = z
  .object({
    expiresInSeconds: z.number().int(),
    resendInSeconds: z.number().int(),
  })
  .meta({ id: 'OtpRequested' });

export const verifyOtpBodySchema = z
  .object({
    phone: phoneSchema,
    code: z.string().regex(/^\d{6}$/),
    // Solo se usa si el teléfono no tiene cuenta.
    name: z.string().trim().min(1).max(60).optional(),
  })
  .meta({ id: 'VerifyOtpBody' });

export const customerLoginSchema = z
  .object({
    customer: z.object({ id: z.uuid(), name: z.string() }),
    isNew: z.boolean(),
  })
  .meta({ id: 'CustomerLogin' });

export type RequestOtpBody = z.infer<typeof requestOtpBodySchema>;
export type OtpRequested = z.infer<typeof otpRequestedSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpBodySchema>;
export type CustomerLogin = z.infer<typeof customerLoginSchema>;
