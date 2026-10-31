import {
  applyPageChanges,
  pageBodySchema,
  toMerchantPage,
  toPublicPage,
  wifiQrPayload,
} from './merchant-page.js';

const EMPTY = {
  coverUrl: null,
  wifiSsid: null,
  wifiPassword: null,
  wifiSecurity: null,
  instagramUsername: null,
  tiktokUsername: null,
  whatsappPhoneE164: null,
  facebookUrl: null,
};
const parse = (body: object) => pageBodySchema.safeParse(body);

describe('wifiQrPayload', () => {
  it('arma el QR estándar con la clave', () => {
    expect(
      wifiQrPayload({ ssid: 'Cafe', password: 'clave1234', security: 'WPA' }),
    ).toBe('WIFI:T:WPA;S:Cafe;P:clave1234;;');
  });

  it('una red abierta va sin clave', () => {
    expect(
      wifiQrPayload({ ssid: 'Cafe Libre', password: null, security: 'NONE' }),
    ).toBe('WIFI:T:nopass;S:Cafe Libre;;');
  });

  it('escapa los caracteres especiales del formato', () => {
    expect(
      wifiQrPayload({
        ssid: 'Café;"Clientes"',
        password: 'a\\b:c,d;e',
        security: 'WPA',
      }),
    ).toBe('WIFI:T:WPA;S:Café\\;\\"Clientes\\";P:a\\\\b\\:c\\,d\\;e;;');
  });
});

describe('pageBodySchema', () => {
  it('normaliza las redes', () => {
    expect(
      parse({
        instagramUsername: '@Cafe.Esquina',
        tiktokUsername: '@Cafe_Esquina',
        whatsappPhone: '11 2345-6789',
        facebookUrl: 'https://www.facebook.com/cafeesquina',
      }).data,
    ).toEqual({
      instagramUsername: 'cafe.esquina',
      tiktokUsername: 'cafe_esquina',
      whatsappPhone: '+5491123456789',
      facebookUrl: 'https://www.facebook.com/cafeesquina',
    });
  });

  it.each([
    ['WPA sin clave', { wifi: { security: 'WPA', ssid: 'Cafe' } }],
    [
      'WPA con clave corta',
      { wifi: { security: 'WPA', ssid: 'Cafe', password: '1234567' } },
    ],
    [
      'red abierta con clave',
      { wifi: { security: 'NONE', ssid: 'Cafe', password: 'clave1234' } },
    ],
    ['red sin nombre', { wifi: { security: 'NONE', ssid: ' ' } }],
    [
      'red de más de 32 caracteres',
      { wifi: { security: 'NONE', ssid: 'a'.repeat(33) } },
    ],
    ['TikTok inválido', { tiktokUsername: 'con espacios' }],
    ['TikTok de un carácter', { tiktokUsername: 'a' }],
    [
      'Facebook de otro dominio',
      { facebookUrl: 'https://facebook.com.evil.com/x' },
    ],
    ['Facebook sin https', { facebookUrl: 'http://facebook.com/cafe' }],
    ['celular inválido', { whatsappPhone: '1234' }],
    ['la portada (llega con la subida)', { coverUrl: 'https://img.com/a.png' }],
  ])('rechaza %s', (_, body) => {
    expect(parse(body).success).toBe(false);
  });
});

describe('applyPageChanges', () => {
  const current = toMerchantPage({
    ...EMPTY,
    wifiSsid: 'Cafe',
    wifiPassword: 'clave1234',
    wifiSecurity: 'WPA',
    instagramUsername: 'cafe',
  });

  it('lista solo los campos que cambiaron', () => {
    const { data, changedFields } = applyPageChanges(current, {
      wifi: { security: 'NONE', ssid: 'Cafe' },
      instagramUsername: 'cafe',
      tiktokUsername: 'cafe',
    });

    expect(changedFields).toEqual(['wifi', 'tiktokUsername']);
    expect(data).toMatchObject({
      wifiSsid: 'Cafe',
      wifiPassword: null,
      wifiSecurity: 'NONE',
      instagramUsername: 'cafe',
      tiktokUsername: 'cafe',
    });
  });

  it('sin cambios no lista nada, y null borra el Wi-Fi', () => {
    expect(applyPageChanges(current, {}).changedFields).toEqual([]);
    const cleared = applyPageChanges(current, { wifi: null });
    expect(cleared.changedFields).toEqual(['wifi']);
    expect(cleared.data).toMatchObject({
      wifiSsid: null,
      wifiPassword: null,
      wifiSecurity: null,
    });
  });
});

describe('toPublicPage', () => {
  it('trae solo las redes cargadas, en orden fijo, y el QR del Wi-Fi', () => {
    const page = toPublicPage({
      ...EMPTY,
      wifiSsid: 'Cafe',
      wifiSecurity: 'NONE',
      facebookUrl: 'https://facebook.com/cafe',
      instagramUsername: 'cafe',
      whatsappPhoneE164: '+5491123456789',
    });

    expect(page).toEqual({
      wifi: {
        ssid: 'Cafe',
        password: null,
        security: 'NONE',
        qrPayload: 'WIFI:T:nopass;S:Cafe;;',
      },
      socials: [
        { type: 'INSTAGRAM', url: 'https://www.instagram.com/cafe/' },
        { type: 'WHATSAPP', url: 'https://wa.me/5491123456789' },
        { type: 'FACEBOOK', url: 'https://facebook.com/cafe' },
      ],
    });
  });

  it('sin datos, sin Wi-Fi ni redes', () => {
    expect(toPublicPage(EMPTY)).toEqual({ wifi: null, socials: [] });
  });
});
