import { z } from 'zod';
import { PieceType } from '../../../generated/prisma/client.js';
import {
  destinationBodySchema,
  destinationSchema,
} from '../../pieces/piece-destination.js';

const labelSchema = z.string().trim().min(1).max(60);

export const createPieceBodySchema = z
  .object({ label: labelSchema, destination: destinationBodySchema.optional() })
  .meta({ id: 'CreatePieceBody' });

export const updatePieceBodySchema = z
  .object({
    label: labelSchema,
    active: z.boolean(),
    destination: destinationBodySchema,
  })
  .partial()
  .meta({ id: 'UpdatePieceBody' });

export const pieceSchema = z
  .object({
    id: z.uuid(),
    publicCode: z.string(),
    type: z.enum(PieceType),
    label: z.string(),
    active: z.boolean(),
    destination: destinationSchema,
    // Adónde redirige al escanearla; null si muestra el club.
    redirectUrl: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Piece' });

// Solo la devuelve el endpoint que la revela: nunca va en `Piece`.
export const nfcPasswordSchema = z
  .object({ password: z.string() })
  .meta({ id: 'PieceNfcPassword' });

export type CreatePieceBody = z.infer<typeof createPieceBodySchema>;
export type UpdatePieceBody = z.infer<typeof updatePieceBodySchema>;
export type PieceResponse = z.infer<typeof pieceSchema>;
export type NfcPasswordResponse = z.infer<typeof nfcPasswordSchema>;
