import { z } from 'zod';
import { publicPageSchema } from '../merchants/merchant-page.js';

// La página del comercio sale en cualquier estado; el club (regla y canJoin),
// solo una vez abierto.
const clubSchema = z.object({
  state: z.enum(['CLUB_NOT_OPEN', 'ACTIVE', 'PAUSED', 'ENDED']),
  canJoin: z.boolean(),
  merchant: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    coverUrl: z.string().nullable(),
    primaryColor: z.string().nullable(),
    secondaryColor: z.string().nullable(),
    googleReviewUrl: z.string().nullable(),
  }),
  page: publicPageSchema,
  rewardRule: z
    .object({
      stampsRequired: z.number().int(),
      rewardDescription: z.string(),
      conditions: z.string().nullable(),
    })
    .nullable(),
});

// Sin datos del comercio si la pieza está inactiva o lleva a otro destino.
export const publicPieceSchema = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('PIECE_INACTIVE') }),
    z.object({ state: z.literal('REDIRECT'), url: z.string() }),
    clubSchema,
  ])
  .meta({ id: 'PublicPiece' });

export type PublicPiece = z.infer<typeof publicPieceSchema>;
