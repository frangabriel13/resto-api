import { z } from 'zod';
import { normalizeArMobile } from './phone.js';

// Acepta el celular como lo escribe la gente y lo devuelve en E.164.
export const arMobileSchema = z
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
