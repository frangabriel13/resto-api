import { z } from 'zod';
import {
  NfcChipType,
  PieceDestinationType,
  PieceFulfillmentStatus,
  PieceType,
} from '../../../generated/prisma/client.js';
import { httpsUrlSchema } from '../../merchants/merchant-fields.js';
import { nfcPasswordSchema } from '../../pieces/piece-fields.js';

const labelSchema = z.string().trim().min(1).max(60);
const destinationTypeSchema = z.enum(PieceDestinationType);
const nfcChipTypeSchema = z.enum(NfcChipType);

// Chequeo de forma nomás (https, largo). El emparejamiento real con
// destinationType -que depende del tipo y, en un update, de lo que ya tenía
// la pieza- lo hace AdminPiecesService con destinationUrlSchemaByType.
const destinationUrlInputSchema = httpsUrlSchema.nullable();

export const createPieceBodySchema = z
  .object({
    label: labelSchema,
    destinationType: destinationTypeSchema.default('CLUBSY'),
    destinationUrl: destinationUrlInputSchema.optional(),
    nfcChipType: nfcChipTypeSchema.default('NTAG215'),
    nfcPassword: nfcPasswordSchema.optional(),
    saleId: z.uuid().optional(),
  })
  .meta({ id: 'CreatePieceBody' });

export const updatePieceBodySchema = z
  .object({
    label: labelSchema,
    active: z.boolean(),
    destinationType: destinationTypeSchema,
    destinationUrl: destinationUrlInputSchema,
    nfcChipType: nfcChipTypeSchema,
    // REPLACED no se pone a mano: sale de POST .../replace, que crea la
    // pieza nueva en el mismo paso.
    fulfillmentStatus: z.enum(['PENDING', 'PROGRAMMED', 'DELIVERED']),
  })
  .partial()
  .meta({ id: 'UpdatePieceBody' });

export const setNfcPasswordBodySchema = z
  .object({ nfcPassword: nfcPasswordSchema })
  .meta({ id: 'SetNfcPasswordBody' });

export const pieceSchema = z
  .object({
    id: z.uuid(),
    publicCode: z.string(),
    type: z.enum(PieceType),
    label: z.string(),
    active: z.boolean(),
    destinationType: destinationTypeSchema,
    destinationUrl: z.string().nullable(),
    nfcChipType: nfcChipTypeSchema,
    hasNfcPassword: z.boolean(),
    fulfillmentStatus: z.enum(PieceFulfillmentStatus),
    saleId: z.uuid().nullable(),
    replacesPieceId: z.uuid().nullable(),
    programmedAt: z.iso.datetime().nullable(),
    deliveredAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Piece' });

export const revealedPasswordSchema = z
  .object({ nfcPassword: z.string() })
  .meta({ id: 'RevealedPassword' });

export const pieceScanSchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    userAgent: z.string().nullable(),
    referer: z.string().nullable(),
    possibleBot: z.boolean(),
  })
  .meta({ id: 'PieceScan' });

export const pieceScanStatsSchema = z
  .object({
    total: z.number().int(),
    possibleBotCount: z.number().int(),
    recent: z.array(pieceScanSchema),
  })
  .meta({ id: 'PieceScanStats' });

export type CreatePieceBody = z.infer<typeof createPieceBodySchema>;
export type UpdatePieceBody = z.infer<typeof updatePieceBodySchema>;
export type SetNfcPasswordBody = z.infer<typeof setNfcPasswordBodySchema>;
export type PieceResponse = z.infer<typeof pieceSchema>;
export type RevealedPassword = z.infer<typeof revealedPasswordSchema>;
export type PieceScanStats = z.infer<typeof pieceScanStatsSchema>;
