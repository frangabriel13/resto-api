import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { loginAdmin } from './helpers/sessions.js';

const PASSWORD = 'clave-de-admin';

describe('Admin: destino de las piezas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cookie: string;
  let piecesPath: string;

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    await prisma.platformAdmin.create({
      data: {
        email: 'admin@fullsync.com',
        name: 'Admin',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    cookie = await loginAdmin(app, 'admin@fullsync.com', PASSWORD);
    const merchant = await prisma.merchant.create({
      data: { name: 'Café', slug: 'cafe' },
    });
    piecesPath = `/admin/merchants/${merchant.id}/pieces`;
  });

  afterEach(async () => {
    await app.close();
  });

  const send = (
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
  ) =>
    request(app.getHttpServer())[method](path).set('Cookie', cookie).send(body);
  const createPiece = async (destination?: object) =>
    (
      await send('post', piecesPath, { label: 'Vidriera', destination }).expect(
        201,
      )
    ).body;
  const auditPayloads = async (action: string) =>
    (
      await prisma.auditEvent.findMany({
        where: { action },
        orderBy: { createdAt: 'asc' },
      })
    ).map((event) => event.payload);

  it('sin destino, la pieza muestra el club', async () => {
    const piece = await createPiece();

    expect(piece).toMatchObject({
      destination: { type: 'CLUB' },
      redirectUrl: null,
    });
  });

  it('crea piezas con cada destino externo y su link armado', async () => {
    const google = await createPiece({
      type: 'GOOGLE_REVIEWS',
      url: 'https://g.page/r/cafe/review',
    });
    const instagram = await createPiece({
      type: 'INSTAGRAM',
      username: '@CafeLaEsquina',
    });
    const whatsapp = await createPiece({
      type: 'WHATSAPP',
      phone: '11 2345-6789',
      message: 'Hola, quiero reservar',
    });

    expect(google).toMatchObject({
      destination: {
        type: 'GOOGLE_REVIEWS',
        url: 'https://g.page/r/cafe/review',
      },
      redirectUrl: 'https://g.page/r/cafe/review',
    });
    expect(instagram).toMatchObject({
      destination: { type: 'INSTAGRAM', username: 'cafelaesquina' },
      redirectUrl: 'https://www.instagram.com/cafelaesquina/',
    });
    expect(whatsapp).toMatchObject({
      destination: {
        type: 'WHATSAPP',
        phone: '+5491123456789',
        message: 'Hola, quiero reservar',
      },
      redirectUrl:
        'https://wa.me/5491123456789?text=Hola%2C%20quiero%20reservar',
    });
    expect(await auditPayloads('piece.created')).toMatchObject([
      { destination: 'GOOGLE_REVIEWS' },
      { destination: 'INSTAGRAM' },
      { destination: 'WHATSAPP' },
    ]);
    const list = await send('get', piecesPath).expect(200);
    expect(list.body).toEqual([google, instagram, whatsapp]);
  });

  it('valida el destino', async () => {
    for (const destination of [
      { type: 'GOOGLE_REVIEWS', url: 'https://otro-sitio.com/resena' },
      { type: 'GOOGLE_REVIEWS' },
      { type: 'INSTAGRAM', username: 'no vale' },
      { type: 'WHATSAPP', phone: '1234' },
      { type: 'CLUB', url: 'https://g.page/r/cafe' },
      { type: 'FACEBOOK' },
    ]) {
      const res = await send('post', piecesPath, {
        label: 'Vidriera',
        destination,
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.piece.count()).toBe(0);
  });

  it('cambiar el destino borra los campos del anterior y audita sin los valores', async () => {
    const piece = await createPiece({
      type: 'WHATSAPP',
      phone: '11 2345-6789',
      message: 'Hola',
    });

    const res = await send('patch', `${piecesPath}/${piece.id}`, {
      destination: { type: 'INSTAGRAM', username: 'cafe' },
    }).expect(200);

    expect(res.body).toMatchObject({
      publicCode: piece.publicCode,
      destination: { type: 'INSTAGRAM', username: 'cafe' },
    });
    expect(
      await prisma.piece.findUniqueOrThrow({ where: { id: piece.id } }),
    ).toMatchObject({
      destination: 'INSTAGRAM',
      instagramUsername: 'cafe',
      whatsappPhoneE164: null,
      whatsappMessage: null,
    });
    const [updated] = await auditPayloads('piece.updated');
    expect(updated).toEqual({
      destination: 'INSTAGRAM',
      destinationFields: [
        'destination',
        'instagramUsername',
        'whatsappPhoneE164',
        'whatsappMessage',
      ],
    });
    expect(JSON.stringify(updated)).not.toContain('2345');
  });

  it('cambiar solo el nombre o el estado no toca el destino', async () => {
    const piece = await createPiece({ type: 'INSTAGRAM', username: 'cafe' });

    const res = await send('patch', `${piecesPath}/${piece.id}`, {
      label: 'Caja',
      active: false,
    }).expect(200);

    expect(res.body).toMatchObject({
      label: 'Caja',
      active: false,
      destination: { type: 'INSTAGRAM', username: 'cafe' },
    });
    expect(await auditPayloads('piece.updated')).toEqual([
      { label: 'Caja', active: false },
    ]);
  });
});
