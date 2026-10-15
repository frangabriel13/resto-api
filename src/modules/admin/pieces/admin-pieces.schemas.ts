import { z } from 'zod';
import { PieceType } from '../../../generated/prisma/client.js';

const labelSchema = z.string().trim().min(1).max(60);

export const createPieceBodySchema = z
  .object({ label: labelSchema })
  .meta({ id: 'CreatePieceBody' });

export const updatePieceBodySchema = z
  .object({ label: labelSchema, active: z.boolean() })
  .partial()
  .meta({ id: 'UpdatePieceBody' });

export const pieceSchema = z
  .object({
    id: z.uuid(),
    publicCode: z.string(),
    type: z.enum(PieceType),
    label: z.string(),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Piece' });

export type CreatePieceBody = z.infer<typeof createPieceBodySchema>;
export type UpdatePieceBody = z.infer<typeof updatePieceBodySchema>;
export type PieceResponse = z.infer<typeof pieceSchema>;
