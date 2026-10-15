import { z } from 'zod';
import { errorCodes } from './error-codes.js';

export const apiErrorSchema = z
  .object({
    statusCode: z.number().int(),
    code: z.enum(errorCodes),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: 'ApiError' });

export type ApiError = z.infer<typeof apiErrorSchema>;
