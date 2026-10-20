import { fieldChanges } from './field-changes.js';

describe('fieldChanges', () => {
  const before = { color: '#000000', cooldown: 60, url: null as string | null };

  it('devuelve solo lo que cambió, con el valor anterior y el nuevo', () => {
    expect(
      fieldChanges(before, { color: '#000000', cooldown: 30, url: 'x' }),
    ).toEqual({ cooldown: { from: 60, to: 30 }, url: { from: null, to: 'x' } });
  });

  it('sin cambios devuelve un objeto vacío', () => {
    expect(fieldChanges(before, { ...before })).toEqual({});
  });
});
