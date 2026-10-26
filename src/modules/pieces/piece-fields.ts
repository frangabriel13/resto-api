import { z } from 'zod';
import type { PieceDestinationType } from '../../generated/prisma/client.js';
import { GOOGLE_REVIEW_HOST } from '../merchants/merchant-fields.js';

export const WHATSAPP_HOST = /^(?:api\.)?whatsapp\.com$|^wa\.me$/;

// Por tipo de destino, qué host puede tener destination_url. GOOGLE_REVIEWS
// y WHATSAPP quedan restringidos igual que merchants.googleReviewUrl: así
// un tag "reseñas de Google" no sirve para mandar a la gente a otro lado.
export const destinationUrlSchemaByType = {
  GOOGLE_REVIEWS: z
    .url({
      protocol: /^https$/,
      hostname: GOOGLE_REVIEW_HOST,
      error: 'Tiene que ser un link https de Google.',
    })
    .max(500),
  WHATSAPP: z
    .url({
      protocol: /^https$/,
      hostname: WHATSAPP_HOST,
      error: 'Tiene que ser un link https de WhatsApp (wa.me).',
    })
    .max(500),
  OTHER: z
    .url({ protocol: /^https$/, error: 'Tiene que ser un link https.' })
    .max(500),
} as const satisfies Partial<Record<PieceDestinationType, z.ZodType<string>>>;

export const nfcPasswordSchema = z.string().trim().min(4).max(64);
