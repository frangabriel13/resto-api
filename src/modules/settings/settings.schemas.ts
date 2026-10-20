import { z } from 'zod';
import { MerchantStatus } from '../../generated/prisma/client.js';
import {
  colorSchema,
  googleReviewUrlSchema,
  stampCooldownSchema,
} from '../merchants/merchant-fields.js';

// Estricto: nombre, slug, logo y estado los maneja FullSync desde el admin.
export const merchantSettingsSchema = z
  .strictObject({
    primaryColor: colorSchema.nullable(),
    secondaryColor: colorSchema.nullable(),
    googleReviewUrl: googleReviewUrlSchema.nullable(),
    stampCooldownMinutes: stampCooldownSchema,
  })
  .meta({ id: 'MerchantSettings' });

export const settingsViewSchema = z
  .object({
    // Solo lectura, para mostrar cómo se ve la tarjeta.
    merchant: z.object({
      name: z.string(),
      slug: z.string(),
      logoUrl: z.string().nullable(),
      status: z.enum(MerchantStatus),
    }),
    settings: merchantSettingsSchema,
  })
  .meta({ id: 'SettingsView' });

export type MerchantSettings = z.infer<typeof merchantSettingsSchema>;
export type SettingsView = z.infer<typeof settingsViewSchema>;
