import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';

describe('Entrada pública por pieza (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let merchantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const merchant = await prisma.merchant.create({
      data: {
        name: 'Café La Esquina',
        slug: 'cafe-la-esquina',
        primaryColor: '#6F4E37',
        googleReviewUrl: 'https://g.page/r/cafe',
        status: 'ACTIVE',
      },
    });
    merchantId = merchant.id;
    await prisma.rewardRule.createMany({
      data: [
        {
          merchantId,
          version: 1,
          stampsRequired: 6,
          rewardDescription: 'Vieja',
          active: false,
        },
        {
          merchantId,
          version: 2,
          stampsRequired: 8,
          rewardDescription: 'Un café de regalo',
          conditions: 'De lunes a viernes',
          active: true,
        },
      ],
    });
    await prisma.piece.createMany({
      data: [
        { merchantId, publicCode: 'mostrador123', label: 'Mostrador' },
        {
          merchantId,
          publicCode: 'vieja1234567',
          label: 'Vieja',
          active: false,
        },
      ],
    });
  });

  const find = (code: string) =>
    request(app.getHttpServer()).get(`/public/pieces/${code}`);
  const setStatus = (status: MerchantStatus) =>
    prisma.merchant.update({ where: { id: merchantId }, data: { status } });

  it('muestra el club activo con su marca, la regla vigente y el link de reseña', async () => {
    const res = await find('mostrador123').expect(200);

    expect(res.body).toEqual({
      state: 'ACTIVE',
      canJoin: true,
      merchant: {
        id: merchantId,
        name: 'Café La Esquina',
        slug: 'cafe-la-esquina',
        logoUrl: null,
        coverUrl: null,
        primaryColor: '#6F4E37',
        secondaryColor: null,
        googleReviewUrl: 'https://g.page/r/cafe',
      },
      page: { wifi: null, socials: [] },
      rewardRule: {
        stampsRequired: 8,
        rewardDescription: 'Un café de regalo',
        conditions: 'De lunes a viernes',
      },
    });
  });

  it('con el club pausado o finalizado lo muestra, pero no deja sumarse', async () => {
    for (const status of ['PAUSED', 'ENDED'] as const) {
      await setStatus(status);
      const res = await find('mostrador123').expect(200);
      expect(res.body).toMatchObject({
        state: status,
        canJoin: false,
        merchant: { googleReviewUrl: 'https://g.page/r/cafe' },
      });
    }
  });

  it('en preparación muestra la página del comercio, sin el club', async () => {
    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        status: 'DRAFT',
        coverUrl: 'https://img.clubsy.com.ar/portada.webp',
        wifiSsid: 'Cafe Clientes',
        wifiPassword: 'clave1234',
        wifiSecurity: 'WPA',
        tiktokUsername: 'cafe',
      },
    });

    const res = await find('mostrador123').expect(200);

    expect(res.body).toMatchObject({
      state: 'CLUB_NOT_OPEN',
      canJoin: false,
      merchant: {
        name: 'Café La Esquina',
        coverUrl: 'https://img.clubsy.com.ar/portada.webp',
        googleReviewUrl: 'https://g.page/r/cafe',
      },
      page: {
        wifi: {
          ssid: 'Cafe Clientes',
          password: 'clave1234',
          security: 'WPA',
          qrPayload: 'WIFI:T:WPA;S:Cafe Clientes;P:clave1234;;',
        },
        socials: [{ type: 'TIKTOK', url: 'https://www.tiktok.com/@cafe' }],
      },
      rewardRule: null,
    });
  });

  it('una pieza inactiva no muestra datos del club', async () => {
    const res = await find('vieja1234567').expect(200);
    expect(res.body).toEqual({ state: 'PIECE_INACTIVE' });
  });

  it('un código inexistente da 404', async () => {
    const res = await find('no-existe').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  describe('escaneos', () => {
    const REVIEW_URL = 'https://g.page/r/cafe/review';

    beforeEach(async () => {
      await prisma.piece.createMany({
        data: [
          {
            merchantId,
            publicCode: 'resenas12345',
            label: 'Cartel de reseñas',
            destination: 'GOOGLE_REVIEWS',
            googleReviewUrl: REVIEW_URL,
          },
          {
            merchantId,
            publicCode: 'instaviejo12',
            label: 'Instagram viejo',
            destination: 'INSTAGRAM',
            instagramUsername: 'cafe',
            active: false,
          },
        ],
      });
    });

    const scan = (code: string) =>
      request(app.getHttpServer()).post(`/public/pieces/${code}/scans`);
    const scans = () =>
      prisma.pieceScan.findMany({
        include: { piece: { select: { publicCode: true } } },
        orderBy: { scannedAt: 'asc' },
      });

    it('un destino externo redirige y queda registrado, sin caché', async () => {
      const res = await scan('resenas12345').expect(200);

      expect(res.body).toEqual({ state: 'REDIRECT', url: REVIEW_URL });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(await scans()).toMatchObject([
        {
          merchantId,
          destination: 'GOOGLE_REVIEWS',
          piece: { publicCode: 'resenas12345' },
        },
      ]);
    });

    it('redirige aunque el club no esté abierto o haya terminado', async () => {
      for (const status of ['DRAFT', 'ENDED'] as const) {
        await setStatus(status);
        const res = await scan('resenas12345').expect(200);
        expect(res.body).toEqual({ state: 'REDIRECT', url: REVIEW_URL });
      }
      expect(await scans()).toHaveLength(2);
    });

    it('una pieza del club responde lo mismo que la consulta y queda registrada', async () => {
      const scanned = await scan('mostrador123').expect(200);
      const found = await find('mostrador123').expect(200);

      expect(scanned.body).toEqual(found.body);
      expect(await scans()).toMatchObject([{ destination: 'CLUB' }]);
    });

    it('una pieza inactiva no redirige ni se registra', async () => {
      const res = await scan('instaviejo12').expect(200);

      expect(res.body).toEqual({ state: 'PIECE_INACTIVE' });
      expect(await scans()).toEqual([]);
    });

    it('consultar la pieza no registra un escaneo, aunque redirija', async () => {
      const res = await find('resenas12345').expect(200);

      expect(res.body).toEqual({ state: 'REDIRECT', url: REVIEW_URL });
      expect(await scans()).toEqual([]);
    });

    it('un código inexistente da 404 y no registra nada', async () => {
      await scan('no-existe').expect(404);
      expect(await scans()).toEqual([]);
    });
  });
});
