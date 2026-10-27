import {
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  slugify,
  slugWithSuffix,
} from './slug.js';

describe('slugify', () => {
  it.each([
    ['Café La Esquina', 'cafe-la-esquina'],
    ['  Panadería   Ñandú  ', 'panaderia-nandu'],
    ['Heladería "El 25" & Co.', 'heladeria-el-25-co'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('corta en el largo máximo sin dejar un guion al final', () => {
    const slug = slugify(`${'a'.repeat(SLUG_MAX_LENGTH - 1)} bcd`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('devuelve vacío si el nombre no tiene letras ni números', () => {
    expect(slugify('¡¿?!')).toBe('');
  });
});

describe('slugWithSuffix', () => {
  it('el primero queda igual y los siguientes llevan el número', () => {
    expect(slugWithSuffix('cafe', 1)).toBe('cafe');
    expect(slugWithSuffix('cafe', 2)).toBe('cafe-2');
    expect(slugWithSuffix('cafe', 12)).toBe('cafe-12');
  });

  it('recorta la base para no pasar el largo máximo, sin guiones dobles', () => {
    const base = `${'a'.repeat(SLUG_MAX_LENGTH - 4)}-bcd`;
    const slug = slugWithSuffix(base, 10);
    expect(slug).toBe(`${'a'.repeat(SLUG_MAX_LENGTH - 4)}-10`);
    expect(slug).toMatch(SLUG_PATTERN);
  });
});
