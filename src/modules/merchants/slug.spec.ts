import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from './slug.js';

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
