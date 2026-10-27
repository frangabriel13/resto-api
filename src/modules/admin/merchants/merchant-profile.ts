import { z } from 'zod';
import { AppException } from '../../../common/errors/app.exception.js';
import type { MerchantProfile } from '../../../generated/prisma/client.js';
import { arMobileSchema } from '../../customers/phone-schema.js';

// 4.3 * 10 da 43.00000000000001: se compara con tolerancia.
const hasOneDecimal = (value: number) =>
  Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

export const profileBodySchema = z
  .object({
    contactName: z.string().trim().min(1).max(100).nullable(),
    contactPhone: arMobileSchema.nullable(),
    address: z.string().trim().min(1).max(200).nullable(),
    googleRatingInitial: z
      .number()
      .min(1)
      .max(5)
      .refine(hasOneDecimal, 'Usá como mucho un decimal.')
      .nullable(),
    googleReviewsInitial: z.number().int().min(0).max(10_000_000).nullable(),
    googleDataTakenOn: z.iso.date().nullable(),
    notes: z.string().trim().min(1).max(2000).nullable(),
  })
  .partial()
  .meta({ id: 'MerchantProfileBody' });

export const merchantProfileSchema = z
  .object({
    contactName: z.string().nullable(),
    contactPhone: z.string().nullable(),
    address: z.string().nullable(),
    googleRatingInitial: z.number().nullable(),
    googleReviewsInitial: z.number().int().nullable(),
    googleDataTakenOn: z.iso.date().nullable(),
    notes: z.string().nullable(),
  })
  .meta({ id: 'MerchantProfile' });

export type ProfileBody = z.infer<typeof profileBodySchema>;
export type MerchantProfileResponse = z.infer<typeof merchantProfileSchema>;
type ProfileField = keyof MerchantProfileResponse;

export function toProfileResponse(
  row: MerchantProfile | null,
): MerchantProfileResponse {
  return {
    contactName: row?.contactName ?? null,
    contactPhone: row?.contactPhoneE164 ?? null,
    address: row?.address ?? null,
    googleRatingInitial: row?.googleRatingInitial?.toNumber() ?? null,
    googleReviewsInitial: row?.googleReviewsInitial ?? null,
    googleDataTakenOn:
      row?.googleDataTakenOn?.toISOString().slice(0, 10) ?? null,
    notes: row?.notes ?? null,
  };
}

export function toProfileData(profile: MerchantProfileResponse) {
  const { contactPhone, googleDataTakenOn, ...rest } = profile;
  return {
    ...rest,
    contactPhoneE164: contactPhone,
    googleDataTakenOn: googleDataTakenOn ? new Date(googleDataTakenOn) : null,
  };
}

// Aplica los cambios sobre la ficha actual y la valida completa.
export function applyProfileChanges(
  current: MerchantProfileResponse,
  changes: ProfileBody = {},
) {
  const next = { ...current, ...changes };
  assertGoogleDataDated(next);
  const changedFields = (Object.keys(next) as ProfileField[]).filter(
    (field) => next[field] !== current[field],
  );
  return { next, changedFields };
}

function assertGoogleDataDated(profile: MerchantProfileResponse) {
  const hasGoogleData =
    profile.googleRatingInitial !== null ||
    profile.googleReviewsInitial !== null;
  if (hasGoogleData === (profile.googleDataTakenOn !== null)) return;
  throw new AppException('VALIDATION_ERROR', undefined, {
    issues: [
      {
        path: 'profile.googleDataTakenOn',
        message:
          'La fecha va junto con la puntuación o la cantidad de reseñas de Google.',
      },
    ],
  });
}
