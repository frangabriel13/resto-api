import { z } from 'zod';
import { WifiSecurity, type Merchant } from '../../generated/prisma/client.js';
import { arMobileSchema } from '../customers/phone-schema.js';
import {
  facebookUrlSchema,
  instagramUsernameSchema,
  tiktokUsernameSchema,
} from './merchant-fields.js';
import { instagramUrl, tiktokUrl, whatsappUrl } from './social-links.js';

const ssidSchema = z.string().trim().min(1).max(32);

// El estándar WPA pide de 8 a 63 caracteres; una red abierta va sin clave.
const wifiBodySchema = z
  .discriminatedUnion('security', [
    z.strictObject({ security: z.literal('NONE'), ssid: ssidSchema }),
    z.strictObject({
      security: z.literal('WPA'),
      ssid: ssidSchema,
      password: z.string().min(8).max(63),
    }),
    z.strictObject({
      security: z.literal('WEP'),
      ssid: ssidSchema,
      password: z.string().min(5).max(26),
    }),
  ])
  .meta({ id: 'WifiBody' });

export const pageBodySchema = z
  .strictObject({
    wifi: wifiBodySchema.nullable(),
    instagramUsername: instagramUsernameSchema.nullable(),
    tiktokUsername: tiktokUsernameSchema.nullable(),
    whatsappPhone: arMobileSchema.nullable(),
    facebookUrl: facebookUrlSchema.nullable(),
  })
  .partial()
  .meta({ id: 'MerchantPageBody' });

const wifiSchema = z.object({
  ssid: z.string(),
  password: z.string().nullable(),
  security: z.enum(WifiSecurity),
});

export const merchantPageSchema = z
  .object({
    coverUrl: z.string().nullable(),
    wifi: wifiSchema.nullable(),
    instagramUsername: z.string().nullable(),
    tiktokUsername: z.string().nullable(),
    whatsappPhone: z.string().nullable(),
    facebookUrl: z.string().nullable(),
  })
  .meta({ id: 'MerchantPage' });

const SOCIAL_TYPES = ['INSTAGRAM', 'TIKTOK', 'WHATSAPP', 'FACEBOOK'] as const;

export const publicPageSchema = z
  .object({
    // qrPayload: el texto del QR estándar, para conectar otro celular.
    wifi: wifiSchema.extend({ qrPayload: z.string() }).nullable(),
    // Solo las cargadas, en este orden: Instagram, TikTok, WhatsApp, Facebook.
    socials: z.array(z.object({ type: z.enum(SOCIAL_TYPES), url: z.string() })),
  })
  .meta({ id: 'PublicMerchantPage' });

export type PageBody = z.infer<typeof pageBodySchema>;
export type MerchantPage = z.infer<typeof merchantPageSchema>;
export type PublicPage = z.infer<typeof publicPageSchema>;
type Wifi = z.infer<typeof wifiSchema>;
type EditablePage = Omit<MerchantPage, 'coverUrl'>;

type PageColumns = Pick<
  Merchant,
  | 'coverUrl'
  | 'wifiSsid'
  | 'wifiPassword'
  | 'wifiSecurity'
  | 'instagramUsername'
  | 'tiktokUsername'
  | 'whatsappPhoneE164'
  | 'facebookUrl'
>;

export const NO_PAGE: MerchantPage = {
  coverUrl: null,
  wifi: null,
  instagramUsername: null,
  tiktokUsername: null,
  whatsappPhone: null,
  facebookUrl: null,
};

export function toMerchantPage(merchant: PageColumns): MerchantPage {
  return {
    coverUrl: merchant.coverUrl,
    wifi: toWifi(merchant),
    instagramUsername: merchant.instagramUsername,
    tiktokUsername: merchant.tiktokUsername,
    whatsappPhone: merchant.whatsappPhoneE164,
    facebookUrl: merchant.facebookUrl,
  };
}

// La portada no se edita acá: llega con la subida de imágenes.
export function applyPageChanges(
  current: MerchantPage,
  changes: PageBody = {},
) {
  const { coverUrl: _, ...editable } = current;
  const { wifi, ...socials } = changes;
  const next: EditablePage = {
    ...editable,
    ...socials,
    ...(wifi !== undefined && { wifi: toWifiOrNull(wifi) }),
  };
  const changedFields = (Object.keys(next) as (keyof EditablePage)[]).filter(
    (field) => JSON.stringify(next[field]) !== JSON.stringify(editable[field]),
  );
  return { data: toPageData(next), changedFields };
}

export function toPublicPage(merchant: PageColumns): PublicPage {
  const wifi = toWifi(merchant);
  return {
    wifi: wifi && { ...wifi, qrPayload: wifiQrPayload(wifi) },
    socials: socialLinks(merchant),
  };
}

// Formato "WIFI:T:WPA;S:<red>;P:<clave>;;": \ ; , : y " van escapados, o
// el celular lee mal la red.
export function wifiQrPayload({ ssid, password, security }: Wifi): string {
  const escape = (value: string) => value.replace(/([\\;,:"])/g, '\\$1');
  const type = security === 'NONE' ? 'nopass' : security;
  const pass = password === null ? '' : `P:${escape(password)};`;
  return `WIFI:T:${type};S:${escape(ssid)};${pass};`;
}

function socialLinks(merchant: PageColumns): PublicPage['socials'] {
  const { instagramUsername, tiktokUsername, whatsappPhoneE164, facebookUrl } =
    merchant;
  const links: [(typeof SOCIAL_TYPES)[number], string | null][] = [
    ['INSTAGRAM', instagramUsername && instagramUrl(instagramUsername)],
    ['TIKTOK', tiktokUsername && tiktokUrl(tiktokUsername)],
    ['WHATSAPP', whatsappPhoneE164 && whatsappUrl(whatsappPhoneE164)],
    ['FACEBOOK', facebookUrl],
  ];
  return links.flatMap(([type, url]) => (url ? [{ type, url }] : []));
}

function toWifi(merchant: PageColumns): Wifi | null {
  const { wifiSsid, wifiPassword, wifiSecurity } = merchant;
  if (!wifiSsid || !wifiSecurity) return null;
  return { ssid: wifiSsid, password: wifiPassword, security: wifiSecurity };
}

function toWifiOrNull(body: PageBody['wifi']): Wifi | null {
  if (!body) return null;
  return {
    ssid: body.ssid,
    password: 'password' in body ? body.password : null,
    security: body.security,
  };
}

function toPageData(page: EditablePage) {
  return {
    wifiSsid: page.wifi?.ssid ?? null,
    wifiPassword: page.wifi?.password ?? null,
    wifiSecurity: page.wifi?.security ?? null,
    instagramUsername: page.instagramUsername,
    tiktokUsername: page.tiktokUsername,
    whatsappPhoneE164: page.whatsappPhone,
    facebookUrl: page.facebookUrl,
  };
}
