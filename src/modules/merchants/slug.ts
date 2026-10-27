export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 60;

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
}

// "cafe" → "cafe-2", recortando la base para no pasar el largo máximo.
export function slugWithSuffix(base: string, n: number): string {
  if (n === 1) return base;
  const suffix = `-${n}`;
  const trimmed = base
    .slice(0, SLUG_MAX_LENGTH - suffix.length)
    .replace(/-+$/, '');
  return `${trimmed}${suffix}`;
}
