import { formatArNational, maskPhone, normalizeArMobile } from './phone.js';

describe('normalizeArMobile', () => {
  it.each([
    ['11 2345-6789', '+5491123456789'],
    ['011 15 2345-6789', '+5491123456789'],
    ['+54 9 11 2345 6789', '+5491123456789'],
    ['(011) 15-2345-6789', '+5491123456789'],
    ['351 15 512-3456', '+5493515123456'],
    ['351 512-3456', '+5493515123456'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeArMobile(input)).toBe(expected);
  });

  it.each(['123', 'no es un teléfono', '+1 202 555 0143', '+34 612 345 678'])(
    'rechaza %s',
    (input) => {
      expect(normalizeArMobile(input)).toBeNull();
    },
  );
});

describe('maskPhone', () => {
  it('muestra el código de área y los últimos cuatro dígitos', () => {
    expect(maskPhone('+5491123456789')).toBe('11 ••• 6789');
    expect(maskPhone('+5493515123456')).toBe('351 ••• 3456');
  });
});

describe('formatArNational', () => {
  it('muestra el celular en formato nacional, sin el +', () => {
    expect(formatArNational('+5491123456789')).toBe('011 15-2345-6789');
  });
});
