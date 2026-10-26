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

// Sin datos del club si la pieza está inactiva o el comercio no abrió.
export const publicPieceSchema = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('PIECE_INACTIVE') }),
    z.object({ state: z.literal('CLUB_NOT_OPEN') }),
    clubSchema,
  ])
  .meta({ id: 'PublicPiece' });

export type PublicPiece = z.infer<typeof publicPieceSchema>;

// Lo consulta el middleware del front antes de renderizar nada: si
// redirect es true, hace un 307 de servidor a url sin pasar por la página.
export const pieceVisitSchema = z
  .object({ redirect: z.boolean(), url: z.string().optional() })
  .meta({ id: 'PieceVisit' });

export type PieceVisit = z.infer<typeof pieceVisitSchema>;
