import { z } from 'zod';

export type ActivityType =
  'STAMP' | 'STAMP_VOIDED' | 'REDEMPTION' | 'REDEMPTION_VOIDED' | 'JOINED';

// `id` es `<tipo>:<uuid>`: un mismo sello aparece como STAMP y STAMP_VOIDED.
export type ActivityKey = { at: Date; id: string };

const cursorSchema = z.object({
  at: z.iso.datetime(),
  id: z.string().regex(/^[A-Z_]+:[0-9a-f-]{36}$/),
});

export function eventId(type: ActivityType, entityId: string): string {
  return `${type}:${entityId}`;
}

export function encodeCursor({ at, id }: ActivityKey): string {
  const json = JSON.stringify({ at: at.toISOString(), id });
  return Buffer.from(json).toString('base64url');
}

export function decodeCursor(raw: string): ActivityKey | null {
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString());
    const parsed = cursorSchema.safeParse(json);
    return parsed.success
      ? { at: new Date(parsed.data.at), id: parsed.data.id }
      : null;
  } catch {
    return null;
  }
}

// Lo más nuevo primero; a igual instante, por id (así el cursor es exacto).
export function compareEvents(a: ActivityKey, b: ActivityKey): number {
  const byTime = b.at.getTime() - a.at.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// Cada fuente trae hasta `limit + 1` eventos desde el cursor: alcanza para
// armar la página y saber si hay otra.
export function takePage<T extends ActivityKey>(
  events: T[],
  limit: number,
): { items: T[]; next: ActivityKey | null } {
  const sorted = [...events].sort(compareEvents);
  const items = sorted.slice(0, limit);
  const last = items.at(-1);
  return { items, next: sorted.length > limit && last ? last : null };
}
