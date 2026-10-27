import { z } from 'zod';

const clubSchema = z.object({
  state: z.enum(['ACTIVE', 'PAUSED', 'ENDED']),
  canJoin: z.boolean(),
  merchant: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    primaryColor: z.string().nullable(),
    secondaryColor: z.string().nullable(),
    googleReviewUrl: z.string().nullable(),
  }),
  rewardRule: z
    .object({
      stampsRequired: z.number().int(),
      rewardDescription: z.string(),
      conditions: z.string().nullable(),
    })
    .nullable(),
});

// Sin datos del club si la pieza está inactiva, lleva a otro destino o el
// comercio no abrió.
export const publicPieceSchema = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('PIECE_INACTIVE') }),
    z.object({ state: z.literal('REDIRECT'), url: z.string() }),
    z.object({ state: z.literal('CLUB_NOT_OPEN') }),
    clubSchema,
  ])
  .meta({ id: 'PublicPiece' });

export type PublicPiece = z.infer<typeof publicPieceSchema>;
