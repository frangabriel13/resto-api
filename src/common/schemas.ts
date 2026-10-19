import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

// Día `YYYY-MM-DD` en hora de Buenos Aires, como parámetro opcional de query.
export const arDayParamSchema = z.iso.date().optional();
