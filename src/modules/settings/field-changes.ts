export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

// Lo que cambia de `before` a `after`, para auditar solo eso.
export function fieldChanges<T extends object>(
  before: T,
  after: Partial<T>,
): FieldChanges {
  const changes: FieldChanges = {};
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    if (before[key] !== after[key]) {
      changes[key] = { from: before[key], to: after[key] };
    }
  }
  return changes;
}
