import { z } from 'zod';
import { MerchantStatus } from '../../generated/prisma/client.js';

export const joinClubBodySchema = z
  .object({
    merchantId: z.uuid(),
    marketingConsent: z.boolean().default(false),
    // Pieza desde la que se unió; si no es de ese comercio, no se registra.
    pieceCode: z.string().max(64).optional(),
  })
  .meta({ id: 'JoinClubBody' });

export const updateConsentBodySchema = z
  .object({ marketingConsent: z.boolean() })
  .meta({ id: 'UpdateConsentBody' });

export const membershipSummarySchema = z
  .object({
    id: z.uuid(),
    merchant: z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      logoUrl: z.string().nullable(),
      primaryColor: z.string().nullable(),
      secondaryColor: z.string().nullable(),
      status: z.enum(MerchantStatus),
    }),
    cycle: z.number().int(),
    balance: z.number().int(),
    stampsRequired: z.number().int(),
    remaining: z.number().int(),
    canRedeem: z.boolean(),
    marketingConsent: z.boolean(),
    joinedAt: z.iso.datetime(),
  })
  .meta({ id: 'MembershipSummary' });

export const joinClubResultSchema = z
  .object({ membership: membershipSummarySchema, isNew: z.boolean() })
  .meta({ id: 'JoinClubResult' });

export type JoinClubBody = z.infer<typeof joinClubBodySchema>;
export type UpdateConsentBody = z.infer<typeof updateConsentBodySchema>;
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;
export type JoinClubResult = z.infer<typeof joinClubResultSchema>;

export const stampTokenSchema = z
  .object({
    token: z.string(),
    expiresAt: z.iso.datetime(),
    refreshInSeconds: z.number().int(),
  })
  .meta({ id: 'StampToken' });

export type StampTokenResponse = z.infer<typeof stampTokenSchema>;
