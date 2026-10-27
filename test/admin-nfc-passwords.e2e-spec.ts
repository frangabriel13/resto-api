import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { loginAdmin } from './helpers/sessions.js';

const PASSWORD = 'clave-de-admin';

describe('Admin: contraseña NFC de las piezas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cookie: string;
  let merchantId: string;
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
    merchantId = (
      await prisma.merchant.create({
        data: { name: 'Café', slug: 'cafe', status: 'ACTIVE' },
      })
    ).id;
    piecesPath = `/admin/merchants/${merchantId}/pieces`;
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
  const createPiece = async () =>
    (await send('post', piecesPath, { label: 'Vidriera' }).expect(201)).body;
  // Una pieza de antes de la 9.3, sin contraseña.
  const createOldPiece = (publicCode: string) =>
    prisma.piece.create({ data: { merchantId, publicCode, label: 'Vieja' } });
  const reveal = (pieceId: string, path = piecesPath) =>
    send('post', `${path}/${pieceId}/nfc-password/reveal`);
  const revealedAudit = () =>
    prisma.auditEvent.findMany({
      where: { action: 'piece.nfc_password_revealed' },
      orderBy: { createdAt: 'asc' },
    });

  it('se genera al crear la pieza, cifrada, y se ve siempre la misma', async () => {
    const piece = await createPiece();

    const first = await reveal(piece.id).expect(200);
    const second = await reveal(piece.id).expect(200);

    expect(first.body.password).toMatch(/^[0-9A-F]{8}$/);
    expect(second.body).toEqual(first.body);
    expect(first.headers['cache-control']).toBe('no-store');
    const stored = await prisma.pieceNfcPassword.findUniqueOrThrow({
      where: { pieceId: piece.id },
    });
    expect(stored.encrypted).toMatch(/^v1\./);
    expect(stored.encrypted).not.toContain(first.body.password);
  });

  it('cada vez que se ve queda auditado, sin la contraseña', async () => {
    const piece = await createPiece();
    const { password } = (await reveal(piece.id).expect(200)).body;

    const audit = await revealedAudit();
    expect(audit).toMatchObject([
      {
        merchantId,
        actorType: 'PLATFORM_ADMIN',
        entityType: 'piece',
        entityId: piece.id,
        payload: { generated: false },
      },
    ]);
    const allPayloads = await prisma.auditEvent.findMany();
    expect(JSON.stringify(allPayloads)).not.toContain(password);
  });

  it('a una pieza sin contraseña se la genera una sola vez', async () => {
    const piece = await createOldPiece('vieja1234567');

    const first = await reveal(piece.id).expect(200);
    const second = await reveal(piece.id).expect(200);

    expect(second.body).toEqual(first.body);
    expect((await revealedAudit()).map((e) => e.payload)).toEqual([
      { generated: true },
      { generated: false },
    ]);
  });

  it('con varios pedidos a la vez, todos ven la misma contraseña', async () => {
    const piece = await createOldPiece('vieja1234567');

    const responses = await Promise.all(
      Array.from({ length: 4 }, () => reveal(piece.id)),
    );

    const passwords = new Set(responses.map((res) => res.body.password));
    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    expect(passwords.size).toBe(1);
    expect(await prisma.pieceNfcPassword.count()).toBe(1);
    const generated = (await revealedAudit()).filter(
      (e) => (e.payload as { generated: boolean }).generated,
    );
    expect(generated).toHaveLength(1);
  });

  it('nunca aparece en los listados, las respuestas de la pieza ni lo público', async () => {
    const created = await send('post', piecesPath, {
      label: 'Vidriera',
    }).expect(201);
    const { id, publicCode } = created.body;
    const { password } = (await reveal(id).expect(200)).body;

    const responses = [
      created,
      await send('get', piecesPath).expect(200),
      await send('patch', `${piecesPath}/${id}`, { label: 'Caja' }).expect(200),
      await send('get', `/admin/merchants/${merchantId}`).expect(200),
      await request(app.getHttpServer())
        .get(`/public/pieces/${publicCode}`)
        .expect(200),
      await request(app.getHttpServer())
        .post(`/public/pieces/${publicCode}/scans`)
        .expect(200),
    ];

    for (const res of responses) {
      expect(JSON.stringify(res.body)).not.toContain(password);
      expect(res.body).not.toHaveProperty('nfcPassword');
    }
  });

  it('una pieza de otro comercio o inexistente da 404', async () => {
    const piece = await createPiece();
    const other = await prisma.merchant.create({
      data: { name: 'Heladería', slug: 'heladeria' },
    });

    await reveal(piece.id, `/admin/merchants/${other.id}/pieces`).expect(404);
    await reveal(randomUUID()).expect(404);
    expect(await revealedAudit()).toEqual([]);
  });

  it('si no se puede descifrar (otra clave), da un error interno sin detalles', async () => {
    const piece = await createOldPiece('vieja1234567');
    await prisma.pieceNfcPassword.create({
      data: {
        pieceId: piece.id,
        merchantId,
        encrypted: 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAA',
      },
    });

    const res = await reveal(piece.id).expect(500);

    expect(res.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: expect.any(String),
    });
    expect(await revealedAudit()).toEqual([]);
  });

  it('sin sesión de admin no entra', async () => {
    const piece = await createPiece();

    await request(app.getHttpServer())
      .post(`${piecesPath}/${piece.id}/nfc-password/reveal`)
      .expect(401);
  });
});
