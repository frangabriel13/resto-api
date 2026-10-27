import {
  changedDestinationFields,
  destinationBodySchema,
  redirectUrl,
  toDestination,
  toDestinationData,
} from './piece-destination.js';

const parse = (body: object) => destinationBodySchema.safeParse(body);

describe('destinationBodySchema', () => {
  it('normaliza el usuario de Instagram, con o sin @', () => {
    expect(
      parse({ type: 'INSTAGRAM', username: '@Cafe.La_Esquina' }).data,
    ).toEqual({ type: 'INSTAGRAM', username: 'cafe.la_esquina' });
    expect(parse({ type: 'INSTAGRAM', username: 'cafe' }).data).toEqual({
      type: 'INSTAGRAM',
      username: 'cafe',
    });
  });

  it('pasa el celular de WhatsApp a E.164', () => {
    expect(
      parse({ type: 'WHATSAPP', phone: '11 2345-6789', message: ' Hola ' })
        .data,
    ).toEqual({ type: 'WHATSAPP', phone: '+5491123456789', message: 'Hola' });
  });

  it.each([
    [
      'link que no es de Google',
      { type: 'GOOGLE_REVIEWS', url: 'https://otro.com/r' },
    ],
    [
      'usuario con espacios',
      { type: 'INSTAGRAM', username: 'cafe la esquina' },
    ],
    [
      'usuario demasiado largo',
      { type: 'INSTAGRAM', username: 'a'.repeat(31) },
    ],
    ['celular inválido', { type: 'WHATSAPP', phone: '1234' }],
    ['mensaje vacío', { type: 'WHATSAPP', phone: '1123456789', message: ' ' }],
    ['campo de otro destino', { type: 'CLUB', url: 'https://g.page/r/cafe' }],
    [
      'mensaje sin WhatsApp',
      { type: 'INSTAGRAM', username: 'cafe', message: 'Hola' },
    ],
    ['destino desconocido', { type: 'FACEBOOK' }],
  ])('rechaza %s', (_, body) => {
    expect(parse(body).success).toBe(false);
  });
});

describe('redirectUrl', () => {
  it('el club no redirige', () => {
    expect(redirectUrl({ type: 'CLUB' })).toBeNull();
  });

  it('Google va tal cual se cargó', () => {
    expect(
      redirectUrl({
        type: 'GOOGLE_REVIEWS',
        url: 'https://g.page/r/cafe/review',
      }),
    ).toBe('https://g.page/r/cafe/review');
  });

  it('Instagram va al perfil', () => {
    expect(
      redirectUrl({ type: 'INSTAGRAM', username: 'cafe.la_esquina' }),
    ).toBe('https://www.instagram.com/cafe.la_esquina/');
  });

  it('WhatsApp va a wa.me con el mensaje codificado', () => {
    const phone = '+5491123456789';
    expect(redirectUrl({ type: 'WHATSAPP', phone, message: null })).toBe(
      'https://wa.me/5491123456789',
    );
    expect(
      redirectUrl({
        type: 'WHATSAPP',
        phone,
        message: '¡Hola! ¿Tienen mesa & café?',
      }),
    ).toBe(
      'https://wa.me/5491123456789?text=%C2%A1Hola!%20%C2%BFTienen%20mesa%20%26%20caf%C3%A9%3F',
    );
  });
});

describe('columnas del destino', () => {
  it('ida y vuelta: solo el campo del destino tiene valor', () => {
    const data = toDestinationData({
      type: 'WHATSAPP',
      phone: '+5491123456789',
    });
    expect(data).toEqual({
      destination: 'WHATSAPP',
      googleReviewUrl: null,
      instagramUsername: null,
      whatsappPhoneE164: '+5491123456789',
      whatsappMessage: null,
    });
    expect(toDestination(data)).toEqual({
      type: 'WHATSAPP',
      phone: '+5491123456789',
      message: null,
    });
  });

  it('lista las columnas que cambiaron', () => {
    const before = toDestinationData({
      type: 'GOOGLE_REVIEWS',
      url: 'https://g.page/r/a',
    });
    const after = toDestinationData({ type: 'INSTAGRAM', username: 'cafe' });
    expect(changedDestinationFields(before, after)).toEqual([
      'destination',
      'googleReviewUrl',
      'instagramUsername',
    ]);
    expect(changedDestinationFields(after, after)).toEqual([]);
  });
});
