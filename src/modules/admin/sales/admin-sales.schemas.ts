import { z } from 'zod';
import { SalePaymentStatus } from '../../../generated/prisma/client.js';

const paymentStatusSchema = z.enum(SalePaymentStatus);
const amountSchema = z.number().min(0).max(100_000_000);

export const createSaleBodySchema = z
  .object({
    product: z.string().trim().min(1).max(100),
    tagCount: z.number().int().min(1).max(1000).default(1),
    amount: amountSchema.nullable().optional(),
    paymentMethod: z.string().trim().max(50).nullable().optional(),
    paymentStatus: paymentStatusSchema.default('PENDING'),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .meta({ id: 'CreateSaleBody' });

export const updateSaleBodySchema = z
  .object({
    paymentStatus: paymentStatusSchema,
    paymentMethod: z.string().trim().max(50).nullable(),
    amount: amountSchema.nullable(),
    notes: z.string().trim().max(5000).nullable(),
  })
  .partial()
  .meta({ id: 'UpdateSaleBody' });

export const saleSchema = z
  .object({
    id: z.uuid(),
    merchantId: z.uuid(),
    product: z.string(),
    tagCount: z.number().int(),
    // Decimal de Prisma, serializado como string para no perder precisión.
    amount: z.string().nullable(),
    paymentMethod: z.string().nullable(),
    paymentStatus: paymentStatusSchema,
    soldByAdminId: z.uuid().nullable(),
    notes: z.string().nullable(),
    pieceCount: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Sale' });

export type CreateSaleBody = z.infer<typeof createSaleBodySchema>;
export type UpdateSaleBody = z.infer<typeof updateSaleBodySchema>;
export type SaleResponse = z.infer<typeof saleSchema>;
