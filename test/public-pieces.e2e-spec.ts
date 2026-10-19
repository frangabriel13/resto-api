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
        primaryColor: '#6F4E37',
        secondaryColor: null,
        googleReviewUrl: 'https://g.page/r/cafe',
      },
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

  it('un comercio en preparación no muestra datos del club', async () => {
    await setStatus('DRAFT');
    const res = await find('mostrador123').expect(200);
    expect(res.body).toEqual({ state: 'CLUB_NOT_OPEN' });
  });

  it('una pieza inactiva no muestra datos del club', async () => {
    const res = await find('vieja1234567').expect(200);
    expect(res.body).toEqual({ state: 'PIECE_INACTIVE' });
  });

  it('un código inexistente da 404', async () => {
    const res = await find('no-existe').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
