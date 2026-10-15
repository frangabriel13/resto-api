export const DEMO_MERCHANT_SLUG = 'cafe-demo';
export const DEMO_PIECE_CODE = 'cafe-demo';
export const DEMO_STAFF_EMAIL_DOMAIN = '@demo.fullsync.test';
export const DEMO_OWNER_EMAIL = `dueno${DEMO_STAFF_EMAIL_DOMAIN}`;
export const DEMO_EMPLOYEE_EMAIL = `empleado${DEMO_STAFF_EMAIL_DOMAIN}`;
// Rango inexistente (ningún número local argentino empieza con 0): nunca le
// llega un mensaje a una persona real.
export const DEMO_PHONE_PREFIX = '+549110000';

export const DEMO_MERCHANT = {
  name: 'Café Demo',
  slug: DEMO_MERCHANT_SLUG,
  primaryColor: '#6F4E37',
  secondaryColor: '#F5E6D3',
  status: 'ACTIVE',
} as const;

export const DEMO_RULE = {
  version: 1,
  stampsRequired: 8,
  rewardDescription: 'Un café con medialuna de regalo',
  conditions: 'Un sello por consumo. Válido en el local, de lunes a sábado.',
  active: true,
} as const;

export type DemoCustomer = {
  name: string;
  phoneSuffix: string;
  marketingConsent: boolean;
  cycle1Stamps: number;
  // Si se indica, canjeó al completar el ciclo 1 y siguió juntando en el 2.
  cycle2Stamps?: number;
  manualFirstStamp?: boolean;
  voidedStamp?: boolean;
};

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    name: '[DEMO] Ana Gómez',
    phoneSuffix: '0001',
    marketingConsent: false,
    cycle1Stamps: 3,
    voidedStamp: true,
  },
  {
    name: '[DEMO] Bruno Díaz',
    phoneSuffix: '0002',
    marketingConsent: true,
    cycle1Stamps: 7,
  },
  {
    name: '[DEMO] Carla Pérez',
    phoneSuffix: '0003',
    marketingConsent: false,
    cycle1Stamps: 8,
  },
  {
    name: '[DEMO] Diego Romero',
    phoneSuffix: '0004',
    marketingConsent: true,
    cycle1Stamps: 9,
    cycle2Stamps: 2,
  },
  {
    name: '[DEMO] Elena Suárez',
    phoneSuffix: '0005',
    marketingConsent: true,
    cycle1Stamps: 1,
    manualFirstStamp: true,
  },
  {
    name: '[DEMO] Facundo Ruiz',
    phoneSuffix: '0006',
    marketingConsent: false,
    cycle1Stamps: 0,
  },
];
