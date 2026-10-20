import { z } from 'zod';

// Lo que muestra la tarjeta del cliente: lo editan el admin y el dueño.
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const httpsUrlSchema = z.url({ protocol: /^https$/ }).max(500);

// Se muestra a todos los clientes: solo Google, para que no sirva para
// mandarlos a otro sitio.
export const GOOGLE_REVIEW_HOST =
  /^(?:(?:[a-z0-9-]+\.)*google\.com(?:\.ar)?|(?:maps\.app\.)?goo\.gl|g\.page)$/;

export const googleReviewUrlSchema = z
  .url({
    protocol: /^https$/,
    hostname: GOOGLE_REVIEW_HOST,
    error: 'Tiene que ser un link https de Google.',
  })
  .max(500);

export const stampCooldownSchema = z.number().int().min(0).max(1440);
