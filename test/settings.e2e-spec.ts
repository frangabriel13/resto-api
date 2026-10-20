import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import {
  createClub,
  joinClub,
  STAFF_PASSWORD,
  stampTokenFor,
  type ClubMember,
} from './helpers/club.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { loginStaff } from './helpers/sessions.js';

const SETTINGS = {
  primaryColor: '#FC5D00',
  secondaryColor: '#001D67',
  googleReviewUrl: 'https://g.page/r/cafe/review',
  stampCooldownMinutes: 30,
};

describe('Panel: configuración del comercio (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let ana: ClubMember;
  let employee: string;
  let owner: string;

  beforeEach(async () => {
    const sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    cafe = await createClub(prisma, 'cafe', [
      ['empleado@cafe.com', 'EMPLOYEE'],
      ['duena@cafe.com', 'OWNER'],
    ]);
    ana = await joinClub(app, sender, '11 2345-6789', 'Ana', cafe.merchantId);
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
    owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const getSettings = (cookie: string) =>
    request(app.getHttpServer()).get('/panel/settings').set('Cookie', cookie);
  const putSettings = (cookie: string, body: object) =>
    request(app.getHttpServer())
      .put('/panel/settings')
      .set('Cookie', cookie)
      .send(body);
  const setStatus = (status: MerchantStatus) =>
    prisma.merchant.update({
      where: { id: cafe.merchantId },
      data: { status },
    });
  const audits = () =>
    prisma.auditEvent.findMany({ where: { action: 'merchant.updated' } });
  const stamp = async (stampToken: string) =>
    request(app.getHttpServer())
      .post('/panel/stamps')
      .set('Cookie', employee)
      .send({ stampToken, idempotencyKey: randomUUID() });

  it('el OWNER ve la configuración; el EMPLOYEE no', async () => {
    const res = await getSettings(owner).expect(200);
    expect(res.body).toEqual({
      merchant: { name: 'cafe', slug: 'cafe', logoUrl: null, status: 'ACTIVE' },
      settings: {
        primaryColor: null,
        secondaryColor: null,
        googleReviewUrl: null,
        stampCooldownMinutes: 60,
      },
    });
    await getSettings(employee).expect(403);
    await putSettings(employee, SETTINGS).expect(403);
  });

  it('guarda los cambios y audita solo lo que cambió', async () => {
    const res = await putSettings(owner, SETTINGS).expect(200);
    expect(res.body.settings).toEqual(SETTINGS);

    await putSettings(owner, { ...SETTINGS, primaryColor: null }).expect(200);
    // Sin cambios: no audita.
    await putSettings(owner, { ...SETTINGS, primaryColor: null }).expect(200);

    const events = await audits();
    expect(events.map((e) => e.payload)).toEqual([
      {
        primaryColor: { from: null, to: '#FC5D00' },
        secondaryColor: { from: null, to: '#001D67' },
        googleReviewUrl: { from: null, to: 'https://g.page/r/cafe/review' },
        stampCooldownMinutes: { from: 60, to: 30 },
      },
      { primaryColor: { from: '#FC5D00', to: null } },
    ]);
    expect(events[0]).toMatchObject({
      actorType: 'STAFF',
      actorId: cafe.staffIds['duena@cafe.com'],
      entityId: cafe.merchantId,
    });
  });

  it('valida cada campo y no deja tocar lo que maneja FullSync', async () => {
    const invalid = [
      { ...SETTINGS, primaryColor: 'naranja' },
      { ...SETTINGS, googleReviewUrl: 'http://g.page/r/cafe' },
      { ...SETTINGS, googleReviewUrl: 'https://otro-sitio.com/resena' },
      { ...SETTINGS, stampCooldownMinutes: 1441 },
      { ...SETTINGS, name: 'Otro nombre' },
      { ...SETTINGS, logoUrl: 'https://cdn.com/logo.png' },
      { primaryColor: '#FC5D00' },
    ];
    for (const body of invalid) {
      const res = await putSettings(owner, body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await audits()).toHaveLength(0);
  });

  it('con el club pausado o finalizado no se cambia', async () => {
    for (const status of ['PAUSED', 'ENDED'] as const) {
      await setStatus(status);
      const res = await putSettings(owner, SETTINGS).expect(409);
      expect(res.body.code).toBe('MERCHANT_READ_ONLY');
      await getSettings(owner).expect(200);
    }
  });

  it('el cooldown nuevo aplica desde el próximo sello', async () => {
    const first = await stamp(await stampTokenFor(app, ana));
    expect(first.status).toBe(201);
    const blocked = await stamp(await stampTokenFor(app, ana));
    expect(blocked.body.code).toBe('COOLDOWN_ACTIVE');

    await putSettings(owner, { ...SETTINGS, stampCooldownMinutes: 0 }).expect(
      200,
    );

    const second = await stamp(await stampTokenFor(app, ana));
    expect(second.status).toBe(201);
    expect(second.body.stamp.cooldownOverride).toBe(false);
  });

  it('la tarjeta del cliente muestra la configuración nueva', async () => {
    await putSettings(owner, SETTINGS).expect(200);
    const card = await request(app.getHttpServer())
      .get(`/me/memberships/${ana.membershipId}`)
      .set('Cookie', ana.cookie)
      .expect(200);
    expect(card.body.merchant).toMatchObject({
      primaryColor: '#FC5D00',
      secondaryColor: '#001D67',
      googleReviewUrl: 'https://g.page/r/cafe/review',
    });
  });
});
