// Días en hora de Buenos Aires. Argentina está en UTC−3 todo el año (no tiene
// horario de verano desde 2009).
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;

// `from` y `to` (días `YYYY-MM-DD`, inclusive) y su rango en UTC, con `end`
// al inicio del día siguiente a `to`.
export type ArRange = { from: string; to: string; start: Date; end: Date };

export function arDay(instant: Date): string {
  return new Date(instant.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}

// "2026-10-18 23:30", en hora de Buenos Aires.
export function arDateTime(instant: Date): string {
  return new Date(instant.getTime() - AR_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

export function shiftArDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// Sin fechas, los últimos `defaultDays` días hasta hoy. Null si el rango está
// invertido o pasa de 366 días.
export function resolveArRange(
  query: { from?: string; to?: string },
  defaultDays: number,
  now: Date,
): ArRange | null {
  const to = query.to ?? arDay(now);
  const from = query.from ?? shiftArDay(to, 1 - defaultDays);
  const start = startOfArDay(from);
  const end = startOfArDay(shiftArDay(to, 1));
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  if (Number.isNaN(days) || days < 1 || days > MAX_DAYS) return null;
  return { from, to, start, end };
}

export function arDaysOf({ from, to }: ArRange): string[] {
  const days = [from];
  while (days.at(-1)! < to) days.push(shiftArDay(days.at(-1)!, 1));
  return days;
}

function startOfArDay(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + AR_OFFSET_MS);
}
