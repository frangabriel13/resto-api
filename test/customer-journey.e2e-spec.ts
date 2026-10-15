import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';

// El circuito del hito 4 tal como lo recorre el front: pieza → código →
// alta en el club → tarjeta, y la vuelta con la misma cuenta.
describe('Hito 4: alta del cliente y tarjeta (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sender: FakeOtpSender;

  beforeEach(async () => {
    sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    await createClub('Café La Esquina', 'cafe-la-esquina', 'mostrador123');
    await createClub('Heladería Polo', 'heladeria-polo', 'helado123456');
  });

  afterEach(async () => {
    await app.close();
  });

  const createClub = async (name: string, slug: string, publicCode: string) => {
    const merchant = await prisma.merchant.create({
      data: { name, slug, status: 'ACTIVE' },
    });
    await prisma.rewardRule.create({
      data: {
        merchantId: merchant.id,
        version: 1,
        stampsRequired: 8,
        rewardDescription: `Premio de ${name}`,
        conditions: 'Un sello por consumo',
        active: true,
      },
    });
    await prisma.piece.create({
      data: { merchantId: merchant.id, publicCode, label: 'Mostrador' },
    });
  };
  // Un navegador: guarda las cookies entre requests.
  const browser = () => request.agent(app.getHttpServer());
  const signIn = async (
    agent: ReturnType<typeof browser>,
    phone: string,
    name?: string,
  ) => {
    await agent.post('/auth/customer/otp/request').send({ phone }).expect(200);
    return agent
      .post('/auth/customer/otp/verify')
      .send({ phone, code: sender.lastCode, name })
      .expect(200);
  };
  const enterClub = async (agent: ReturnType<typeof browser>, code: string) => {
    const piece = await agent.get(`/public/pieces/${code}`).expect(200);
    const joined = await agent
      .post('/me/memberships')
      .send({ merchantId: piece.body.merchant.id, pieceCode: code })
      .expect(200);
    return { piece: piece.body, joined: joined.body };
  };
  const allowNewCode = () =>
    prisma.$executeRaw`UPDATE otp_challenges SET created_at = created_at - interval '2 minutes'`;

  it('primer uso: de la pieza a la tarjeta', async () => {
    const ana = browser();

    const piece = await ana.get('/public/pieces/mostrador123').expect(200);
    expect(piece.body).toMatchObject({
      state: 'ACTIVE',
      canJoin: true,
      rewardRule: {
        stampsRequired: 8,
        rewardDescription: 'Premio de Café La Esquina',
      },
    });

    const login = await signIn(ana, '11 2345-6789', 'Ana');
    expect(login.body).toMatchObject({
      customer: { name: 'Ana' },
      isNew: true,
    });

    const joined = await ana
      .post('/me/memberships')
      .send({ merchantId: piece.body.merchant.id, pieceCode: 'mostrador123' })
      .expect(200);
    expect(joined.body.isNew).toBe(true);

    const clubs = await ana.get('/me/memberships').expect(200);
    expect(clubs.body).toMatchObject([
      { id: joined.body.membership.id, merchant: { slug: 'cafe-la-esquina' } },
    ]);

    const card = await ana
      .get(`/me/memberships/${joined.body.membership.id}`)
      .expect(200);
    expect(card.body).toMatchObject({
      merchant: { name: 'Café La Esquina' },
      cycleRule: { stampsRequired: 8, conditions: 'Un sello por consumo' },
      cycle: 1,
      balance: 0,
      remaining: 8,
      totalStamps: 0,
      history: [],
    });
  });

  it('vuelve desde otro teléfono y recupera la misma cuenta y su club', async () => {
    const first = browser();
    await signIn(first, '11 2345-6789', 'Ana');
    const { joined } = await enterClub(first, 'mostrador123');
    await first.post('/auth/customer/logout').expect(204);
    await first.get('/me').expect(401);

    await allowNewCode();
    const second = browser();
    const login = await signIn(second, '011 15 2345-6789');

    expect(login.body).toMatchObject({
      customer: { name: 'Ana' },
      isNew: false,
    });
    const again = await enterClub(second, 'mostrador123');
    expect(again.joined).toMatchObject({
      isNew: false,
      membership: { id: joined.membership.id },
    });
  });

  it('con la misma cuenta se suma a otro club, con su tarjeta aparte', async () => {
    const ana = browser();
    await signIn(ana, '11 2345-6789', 'Ana');
    const cafe = await enterClub(ana, 'mostrador123');
    const heladeria = await enterClub(ana, 'helado123456');

    const clubs = await ana.get('/me/memberships').expect(200);
    expect(
      clubs.body
        .map((c: { merchant: { slug: string } }) => c.merchant.slug)
        .sort(),
    ).toEqual(['cafe-la-esquina', 'heladeria-polo']);
    const card = await ana
      .get(`/me/memberships/${heladeria.joined.membership.id}`)
      .expect(200);
    expect(card.body.cycleRule.rewardDescription).toBe(
      'Premio de Heladería Polo',
    );
    expect(cafe.joined.membership.id).not.toBe(heladeria.joined.membership.id);
  });

  it('en un teléfono compartido, cambiar de cuenta muestra solo los clubes de la nueva', async () => {
    const shared = browser();
    await signIn(shared, '11 2345-6789', 'Ana');
    await enterClub(shared, 'mostrador123');

    await shared.post('/auth/customer/logout').expect(204);
    await signIn(shared, '11 4567-8901', 'Beto');

    const me = await shared.get('/me').expect(200);
    expect(me.body.name).toBe('Beto');
    const clubs = await shared.get('/me/memberships').expect(200);
    expect(clubs.body).toEqual([]);
  });
});
