import { z } from 'zod';
import type { Piece } from '../../generated/prisma/client.js';
import { arMobileSchema } from '../customers/phone-schema.js';
import { googleReviewUrlSchema } from '../merchants/merchant-fields.js';

const instagramUsernameSchema = z
  .string()
  .trim()
  .regex(/^@?[A-Za-z0-9._]{1,30}$/, 'Ingresá un usuario de Instagram válido.')
  .transform((value) => value.replace(/^@/, '').toLowerCase());

// Cada destino lleva solo sus campos: uno de otro destino es un error.
export const destinationBodySchema = z
  .discriminatedUnion('type', [
    z.strictObject({ type: z.literal('CLUB') }),
    z.strictObject({
      type: z.literal('GOOGLE_REVIEWS'),
      url: googleReviewUrlSchema,
    }),
    z.strictObject({
      type: z.literal('INSTAGRAM'),
      username: instagramUsernameSchema,
    }),
    z.strictObject({
      type: z.literal('WHATSAPP'),
      phone: arMobileSchema,
      message: z.string().trim().min(1).max(500).nullable().optional(),
    }),
  ])
  .meta({ id: 'PieceDestinationBody' });

export const destinationSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('CLUB') }),
    z.object({ type: z.literal('GOOGLE_REVIEWS'), url: z.string() }),
    z.object({ type: z.literal('INSTAGRAM'), username: z.string() }),
    z.object({
      type: z.literal('WHATSAPP'),
      phone: z.string(),
      message: z.string().nullable(),
    }),
  ])
  .meta({ id: 'PieceDestination' });

export type DestinationBody = z.infer<typeof destinationBodySchema>;
export type Destination = z.infer<typeof destinationSchema>;

type DestinationColumns = Pick<
  Piece,
  | 'destination'
  | 'googleReviewUrl'
  | 'instagramUsername'
  | 'whatsappPhoneE164'
  | 'whatsappMessage'
>;

export function toDestinationData(body: DestinationBody): DestinationColumns {
  return {
    destination: body.type,
    googleReviewUrl: body.type === 'GOOGLE_REVIEWS' ? body.url : null,
    instagramUsername: body.type === 'INSTAGRAM' ? body.username : null,
    whatsappPhoneE164: body.type === 'WHATSAPP' ? body.phone : null,
    whatsappMessage: body.type === 'WHATSAPP' ? (body.message ?? null) : null,
  };
}

// Las columnas cumplen el CHECK de la migración: el campo del destino nunca es null.
export function toDestination(piece: DestinationColumns): Destination {
  switch (piece.destination) {
    case 'CLUB':
      return { type: 'CLUB' };
    case 'GOOGLE_REVIEWS':
      return { type: 'GOOGLE_REVIEWS', url: piece.googleReviewUrl! };
    case 'INSTAGRAM':
      return { type: 'INSTAGRAM', username: piece.instagramUsername! };
    case 'WHATSAPP':
      return {
        type: 'WHATSAPP',
        phone: piece.whatsappPhoneE164!,
        message: piece.whatsappMessage,
      };
  }
}

export function redirectUrl(destination: Destination): string | null {
  switch (destination.type) {
    case 'CLUB':
      return null;
    case 'GOOGLE_REVIEWS':
      return destination.url;
    case 'INSTAGRAM':
      return `https://www.instagram.com/${destination.username}/`;
    case 'WHATSAPP': {
      const url = `https://wa.me/${destination.phone.slice(1)}`;
      return destination.message
        ? `${url}?text=${encodeURIComponent(destination.message)}`
        : url;
    }
  }
}

// Para la auditoría: qué columnas cambiaron, sin los valores.
export function changedDestinationFields(
  before: DestinationColumns,
  after: DestinationColumns,
): (keyof DestinationColumns)[] {
  return (Object.keys(after) as (keyof DestinationColumns)[]).filter(
    (field) => after[field] !== before[field],
  );
}
