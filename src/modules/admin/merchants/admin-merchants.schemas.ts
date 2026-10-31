import { z } from 'zod';
import { MerchantStatus } from '../../../generated/prisma/client.js';
import {
  colorSchema,
  googleReviewUrlSchema,
  httpsUrlSchema,
  stampCooldownSchema,
} from '../../merchants/merchant-fields.js';
import {
  merchantPageSchema,
  pageBodySchema,
} from '../../merchants/merchant-page.js';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../../merchants/slug.js';
import {
  merchantProfileSchema,
  profileBodySchema,
} from './merchant-profile.js';

const slugSchema = z.string().min(3).max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN);

const editableFields = {
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
  logoUrl: httpsUrlSchema.nullable(),
  primaryColor: colorSchema.nullable(),
  secondaryColor: colorSchema.nullable(),
  googleReviewUrl: googleReviewUrlSchema.nullable(),
  stampCooldownMinutes: stampCooldownSchema,
  profile: profileBodySchema,
  page: pageBodySchema,
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
    archivedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    profile: merchantProfileSchema,
    page: merchantPageSchema,
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
    archivedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'MerchantSummary' });

// Lo que borraría `DELETE /admin/merchants/:id`: cada cantidad, también lo anulado.
export const deletionSummarySchema = z
  .object({
    archived: z.boolean(),
    // Sin clientes, en cualquier estado; con clientes, solo archivado.
    canDelete: z.boolean(),
    customers: z.number().int(),
    stamps: z.number().int(),
    redemptions: z.number().int(),
    pieces: z.number().int(),
    // Cuentas de clientes y de staff que no están en otro comercio.
    customerAccounts: z.number().int(),
    staffUsers: z.number().int(),
  })
  .meta({ id: 'MerchantDeletionSummary' });

export type CreateMerchantBody = z.infer<typeof createMerchantBodySchema>;
export type UpdateMerchantBody = z.infer<typeof updateMerchantBodySchema>;
export type MerchantResponse = z.infer<typeof merchantSchema>;
export type MerchantSummary = z.infer<typeof merchantSummarySchema>;
export type DeletionSummary = z.infer<typeof deletionSummarySchema>;
