import { z } from 'zod';

const count = z.number().int();

export const statsSchema = z
  .object({
    range: z.object({ from: z.iso.date(), to: z.iso.date() }),
    // Foto actual del club, independiente del período.
    members: z.object({
      active: count,
      // Con 2 o más sellos no anulados en el total histórico.
      returning: count,
      marketingConsent: count,
    }),
    period: z.object({
      joined: count,
      // Dados en el período y no anulados.
      stamps: count,
      manualStamps: count,
      cooldownOverrides: count,
      redemptions: count,
      // Anulaciones hechas en el período, sea cual sea la fecha del sello.
      voidedStamps: count,
      voidedRedemptions: count,
    }),
    // Un elemento por día del período, incluidos los días sin movimiento.
    daily: z.array(
      z.object({
        day: z.iso.date(),
        joined: count,
        stamps: count,
        redemptions: count,
      }),
    ),
  })
  .meta({ id: 'Stats' });

export type Stats = z.infer<typeof statsSchema>;
