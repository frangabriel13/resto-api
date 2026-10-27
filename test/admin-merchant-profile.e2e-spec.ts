import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { loginAdmin, loginStaff } from './helpers/sessions.js';

const PASSWORD = 'clave-de-admin';
const PROFILE = {
  contactName: 'Marta Contacto',
  contactPhone: '11 2345-6789',
  address: 'Av. Siempreviva 742',
  googleRatingInitial: 4.3,
  googleReviewsInitial: 128,
  googleDataTakenOn: '2026-10-20',
  notes: 'Quiere el cartel para la vidriera',
};
const EMPTY_PROFILE = {
  contactName: null,
  contactPhone: null,
  address: null,
  googleRatingInitial: null,
  googleReviewsInitial: null,
  googleDataTakenOn: null,
  notes: null,
};
const SECRET_VALUES = [
  'Marta Contacto',
  '+5491123456789',
  'Siempreviva',
  'vidriera',
];

describe('Admin: ficha comercial (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cookie: string;

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
  const createMerchant = async (profile?: object) =>
    (
      await send('post', '/admin/merchants', { name: 'Café', profile }).expect(
        201,
      )
    ).body;
  const patchProfile = (id: string, profile: object) =>
    send('patch', `/admin/merchants/${id}`, { profile });
  const auditOf = (action: string) =>
    prisma.auditEvent.findMany({
      where: { action },
      orderBy: { createdAt: 'asc' },
    });

  it('crea el comercio con su ficha, con el celular en E.164', async () => {
    const merchant = await createMerchant(PROFILE);

    const expected = { ...PROFILE, contactPhone: '+5491123456789' };
    expect(merchant.profile).toEqual(expected);
    const detail = await send('get', `/admin/merchants/${merchant.id}`).expect(
      200,
    );
    expect(detail.body.profile).toEqual(expected);
  });

  it('sin ficha responde los campos vacíos y no crea la fila', async () => {
    const merchant = await createMerchant();

    expect(merchant.profile).toEqual(EMPTY_PROFILE);
    expect(await prisma.merchantProfile.count()).toBe(0);
  });

  it('el alta audita qué campos de la ficha se cargaron, sin los valores', async () => {
    await createMerchant({ contactName: 'Marta Contacto', notes: 'vidriera' });

    const [created] = await auditOf('merchant.created');
    expect(created?.payload).toMatchObject({
      name: 'Café',
      profileFields: ['contactName', 'notes'],
    });
    expect(JSON.stringify(created?.payload)).not.toMatch(/Marta|vidriera/);
  });

  it('edita la ficha por partes y audita solo qué campos cambiaron', async () => {
    const merchant = await createMerchant(PROFILE);

    const res = await patchProfile(merchant.id, {
      contactName: null,
      notes: 'Pidió dos carteles',
      address: PROFILE.address,
    }).expect(200);

    expect(res.body.profile).toMatchObject({
      contactName: null,
      notes: 'Pidió dos carteles',
      address: PROFILE.address,
      googleRatingInitial: 4.3,
    });
    const audit = await auditOf('merchant_profile.updated');
    expect(audit.map((e) => e.payload)).toEqual([
      { changedFields: ['contactName', 'notes'] },
    ]);
    expect(await auditOf('merchant.updated')).toEqual([]);
  });

  it('sin cambios en la ficha no audita nada', async () => {
    const merchant = await createMerchant(PROFILE);

    await patchProfile(merchant.id, { notes: PROFILE.notes }).expect(200);
    await send('patch', `/admin/merchants/${merchant.id}`, {
      name: 'Café Nuevo',
    }).expect(200);

    expect(await auditOf('merchant_profile.updated')).toEqual([]);
    expect(await auditOf('merchant.updated')).toHaveLength(1);
  });

  it('carga la ficha de un comercio que no la tenía', async () => {
    const merchant = await createMerchant();

    const res = await patchProfile(merchant.id, {
      contactPhone: '+54 9 351 234-5678',
    }).expect(200);

    expect(res.body.profile).toEqual({
      ...EMPTY_PROFILE,
      contactPhone: '+5493512345678',
    });
  });

  it('valida los campos de la ficha', async () => {
    for (const profile of [
      { contactPhone: '1234' },
      { contactName: '' },
      { googleRatingInitial: 5.5, googleDataTakenOn: '2026-10-20' },
      { googleRatingInitial: 0.5, googleDataTakenOn: '2026-10-20' },
      { googleRatingInitial: 4.25, googleDataTakenOn: '2026-10-20' },
      { googleReviewsInitial: -1, googleDataTakenOn: '2026-10-20' },
      { googleDataTakenOn: 'ayer', googleRatingInitial: 4 },
      { notes: 'x'.repeat(2001) },
    ]) {
      const res = await send('post', '/admin/merchants', {
        name: 'Café',
        profile,
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.merchant.count()).toBe(0);
  });

  it('la fecha de los datos de Google va junto con la puntuación o las reseñas', async () => {
    for (const profile of [
      { googleRatingInitial: 4.5 },
      { googleReviewsInitial: 30 },
      { googleDataTakenOn: '2026-10-20' },
    ]) {
      const res = await send('post', '/admin/merchants', {
        name: 'Café',
        profile,
      }).expect(400);
      expect(res.body.details.issues).toEqual([
        { path: 'profile.googleDataTakenOn', message: expect.any(String) },
      ]);
    }

    const merchant = await createMerchant(PROFILE);
    await patchProfile(merchant.id, { googleDataTakenOn: null }).expect(400);
    await patchProfile(merchant.id, { googleRatingInitial: null }).expect(200);
    const cleared = await patchProfile(merchant.id, {
      googleReviewsInitial: null,
      googleDataTakenOn: null,
    }).expect(200);
    expect(cleared.body.profile.googleDataTakenOn).toBeNull();
  });

  it('la ficha no aparece en el listado, el panel ni lo público', async () => {
    const merchant = await createMerchant(PROFILE);
    await prisma.rewardRule.create({
      data: {
        merchantId: merchant.id,
        version: 1,
        stampsRequired: 8,
        rewardDescription: 'Café',
        active: true,
      },
    });
    await send('patch', `/admin/merchants/${merchant.id}`, {
      status: 'ACTIVE',
    }).expect(200);
    const piece = (
      await send('post', `/admin/merchants/${merchant.id}/pieces`, {
        label: 'Mostrador',
      }).expect(201)
    ).body;
    await prisma.staffUser.create({
      data: {
        email: 'duena@cafe.com',
        name: 'Dueña',
        passwordHash: await hashPassword(PASSWORD),
        mustChangePassword: false,
        memberships: { create: { merchantId: merchant.id, role: 'OWNER' } },
      },
    });
    const owner = await loginStaff(app, 'duena@cafe.com', PASSWORD);
    const asOwner = (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Cookie', owner.cookie)
        .expect(200);

    const responses = [
      await send('get', '/admin/merchants').expect(200),
      await request(app.getHttpServer())
        .get(`/public/pieces/${piece.publicCode}`)
        .expect(200),
      await asOwner('/auth/staff/me'),
      await asOwner('/panel/settings'),
      await asOwner('/panel/stats'),
    ];

    for (const res of responses) {
      for (const value of SECRET_VALUES) {
        expect(JSON.stringify(res.body)).not.toContain(value);
      }
    }
  });
});
