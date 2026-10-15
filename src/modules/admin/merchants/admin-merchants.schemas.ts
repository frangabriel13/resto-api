import { z } from 'zod';
import { MerchantStatus } from '../../../generated/prisma/client.js';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../../merchants/slug.js';

const slugSchema = z.string().min(3).max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const httpsUrlSchema = z.url({ protocol: /^https$/ }).max(500);

const editableFields = {
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
  logoUrl: httpsUrlSchema.nullable(),
  primaryColor: colorSchema.nullable(),
  secondaryColor: colorSchema.nullable(),
  googleReviewUrl: httpsUrlSchema.nullable(),
  stampCooldownMinutes: z.number().int().min(0).max(1440),
};

export const createMerchantBodySchema = z
  .object(editableFields)
  .partial()
  .required({ name: true })
  .meta({ id: 'CreateMerchantBody' });

export const updateMerchantBodySchema = z
  .object({ ...editableFields, status: z.enum(MerchantStatus) })
  .partial()
  .meta({ id: 'UpdateMerchantBody' });

export const merchantSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    primaryColor: z.string().nullable(),
    secondaryColor: z.string().nullable(),
    googleReviewUrl: z.string().nullable(),
    stampCooldownMinutes: z.number().int(),
    status: z.enum(MerchantStatus),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Merchant' });

export const merchantSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    status: z.enum(MerchantStatus),
    hasActiveRule: z.boolean(),
    activeOwners: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'MerchantSummary' });

export type CreateMerchantBody = z.infer<typeof createMerchantBodySchema>;
export type UpdateMerchantBody = z.infer<typeof updateMerchantBodySchema>;
export type MerchantResponse = z.infer<typeof merchantSchema>;
export type MerchantSummary = z.infer<typeof merchantSummarySchema>;
