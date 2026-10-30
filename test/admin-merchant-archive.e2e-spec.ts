import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { LOCK_WAIT_MS, whileRowLocked } from './helpers/row-lock.js';
import { loginAdmin } from './helpers/sessions.js';

const PASSWORD = 'clave-de-admin';
const IN_AN_HOUR = () => new Date(Date.now() + 60 * 60 * 1000);

describe('Admin: archivar y borrar comercios (e2e)', () => {
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
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
  ) =>
    request(app.getHttpServer())[method](path).set('Cookie', cookie).send(body);
  const createMerchant = async (name: string, status?: MerchantStatus) => {
    const merchant = (
      await send('post', '/admin/merchants', { name }).expect(201)
    ).body;
    if (status) {
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { status },
      });
    }
    return merchant as { id: string; name: string; slug: string };
  };
  const createPiece = async (merchantId: string, label = 'Mostrador') =>
    (
      await send('post', `/admin/merchants/${merchantId}/pieces`, {
        label,
      }).expect(201)
    ).body as { id: string; publicCode: string };
  const archive = (id: string) =>
    send('post', `/admin/merchants/${id}/archive`);
  const unarchive = (id: string) =>
    send('post', `/admin/merchants/${id}/unarchive`);
  const remove = (id: string, confirmName?: string) =>
    send('delete', `/admin/merchants/${id}`).query(
      confirmName === undefined ? {} : { confirmName },
    );
  const auditCount = (action: string) =>
    prisma.auditEvent.count({ where: { action } });

  describe('archivar', () => {
    it('archiva un comercio en preparación o finalizado y desactiva sus piezas', async () => {
      const draft = await createMerchant('En preparación');
      const ended = await createMerchant('Finalizado', 'ENDED');
      const piece = await createPiece(draft.id);
      await createPiece(draft.id, 'Mesa');

      const res = await archive(draft.id).expect(200);
      await archive(ended.id).expect(200);

      expect(res.body.archivedAt).toEqual(expect.any(String));
      expect(
        await prisma.piece.count({
          where: { merchantId: draft.id, active: true },
        }),
      ).toBe(0);
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'merchant.archived', merchantId: draft.id },
      });
      expect(audit.payload).toEqual({ deactivatedPieces: 2 });
      const scan = await request(app.getHttpServer())
        .post(`/public/pieces/${piece.publicCode}/scans`)
        .expect(200);
      expect(scan.body).toEqual({ state: 'PIECE_INACTIVE' });
    });

    it('no archiva un club abierto', async () => {
      for (const status of ['ACTIVE', 'PAUSED'] as const) {
        const merchant = await createMerchant(`Club ${status}`, status);
        const res = await archive(merchant.id).expect(409);
        expect(res.body.code).toBe('MERCHANT_NOT_ARCHIVABLE');
      }
      expect(
        await prisma.merchant.count({ where: { archivedAt: { not: null } } }),
      ).toBe(0);
    });

    it('archivar o desarchivar dos veces, aun a la vez, audita una sola vez', async () => {
      const merchant = await createMerchant('Café');

      await Promise.all([archive(merchant.id), archive(merchant.id)]);
      await archive(merchant.id).expect(200);
      await Promise.all([unarchive(merchant.id), unarchive(merchant.id)]);
      await unarchive(merchant.id).expect(200);

      expect(await auditCount('merchant.archived')).toBe(1);
      expect(await auditCount('merchant.unarchived')).toBe(1);
    });

    it('desarchivar no reactiva las piezas', async () => {
      const merchant = await createMerchant('Café');
      await createPiece(merchant.id);
      await archive(merchant.id).expect(200);

      const res = await unarchive(merchant.id).expect(200);

      expect(res.body.archivedAt).toBeNull();
      expect(await prisma.piece.findMany()).toMatchObject([{ active: false }]);
    });

    it('el listado separa los archivados', async () => {
      const archivedDraft = await createMerchant('Archivado en preparación');
      const archivedEnded = await createMerchant(
        'Archivado finalizado',
        'ENDED',
      );
      await createMerchant('Visible');
      await archive(archivedDraft.id).expect(200);
      await archive(archivedEnded.id).expect(200);

      const names = async (query: object) =>
        (
          await send('get', '/admin/merchants').query(query).expect(200)
        ).body.map((m: { name: string }) => m.name);

      expect(await names({})).toEqual(['Visible']);
      expect(await names({ archived: 'false' })).toEqual(['Visible']);
      expect(await names({ archived: 'true' })).toEqual([
        'Archivado finalizado',
        'Archivado en preparación',
      ]);
      expect(await names({ archived: 'true', status: 'ENDED' })).toEqual([
        'Archivado finalizado',
      ]);
      await send('get', '/admin/merchants')
        .query({ archived: 'si' })
        .expect(400);
    });

    it('archivado no se edita, pero se ve y se puede ver la contraseña NFC', async () => {
      const merchant = await createMerchant('Café');
      const piece = await createPiece(merchant.id);
      await archive(merchant.id).expect(200);
      const path = `/admin/merchants/${merchant.id}`;

      for (const res of [
        await send('patch', path, { name: 'Otro' }),
        await send('patch', path, { status: 'ACTIVE' }),
        await send('post', `${path}/pieces`, { label: 'Nueva' }),
        await send('patch', `${path}/pieces/${piece.id}`, { active: true }),
        await send('post', `${path}/owner`, {
          email: 'duena@cafe.com',
          name: 'Dueña',
        }),
      ]) {
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('MERCHANT_ARCHIVED');
      }
      await send('get', path).expect(200);
      await send('get', `${path}/pieces`).expect(200);
      await send(
        'post',
        `${path}/pieces/${piece.id}/nfc-password/reveal`,
      ).expect(200);
    });
  });

  describe('borrar', () => {
    const createStaff = (email: string, merchantIds: string[]) =>
      prisma.staffUser.create({
        data: {
          email,
          name: email,
          passwordHash: 'x',
          memberships: {
            create: merchantIds.map((merchantId) => ({
              merchantId,
              role: 'OWNER' as const,
            })),
          },
        },
      });
    const createSession = (staffUserId: string, selectedMerchantId: string) =>
      prisma.staffSession.create({
        data: {
          staffUserId,
          selectedMerchantId,
          tokenHash: randomUUID(),
          expiresAt: IN_AN_HOUR(),
        },
      });
    const addRule = (merchantId: string) =>
      prisma.rewardRule.create({
        data: {
          merchantId,
          version: 1,
          stampsRequired: 8,
          rewardDescription: 'Café',
          active: true,
        },
      });

    it('borra un comercio sin clientes con todo lo suyo y deja un evento de plataforma', async () => {
      const merchant = await createMerchant('Café La Esquina');
      const other = await createMerchant('Heladería');
      await send('patch', `/admin/merchants/${merchant.id}`, {
        profile: { notes: 'Le vendimos dos carteles' },
      }).expect(200);
      await addRule(merchant.id);
      const pieces = [
        await createPiece(merchant.id),
        await createPiece(merchant.id, 'Vidriera'),
      ];
      const otherPiece = await createPiece(other.id);
      for (const piece of [...pieces, otherPiece]) {
        await request(app.getHttpServer())
          .post(`/public/pieces/${piece.publicCode}/scans`)
          .expect(200);
      }
      const exclusive = await createStaff('duena@cafe.com', [merchant.id]);
      const shared = await createStaff('socio@ambos.com', [
        merchant.id,
        other.id,
      ]);
      await createSession(exclusive.id, merchant.id);
      await prisma.passwordResetToken.create({
        data: {
          staffUserId: exclusive.id,
          tokenHash: randomUUID(),
          expiresAt: IN_AN_HOUR(),
        },
      });
      const sharedSession = await createSession(shared.id, merchant.id);

      await remove(merchant.id, 'Café La Esquina').expect(204);

      const byMerchant = { where: { merchantId: merchant.id } };
      expect(
        await prisma.merchant.findUnique({ where: { id: merchant.id } }),
      ).toBeNull();
      expect({
        pieces: await prisma.piece.count(byMerchant),
        scans: await prisma.pieceScan.count(byMerchant),
        nfcPasswords: await prisma.pieceNfcPassword.count(byMerchant),
        rules: await prisma.rewardRule.count(byMerchant),
        profiles: await prisma.merchantProfile.count(byMerchant),
        staff: await prisma.staffMembership.count(byMerchant),
        audit: await prisma.auditEvent.count(byMerchant),
      }).toEqual({
        pieces: 0,
        scans: 0,
        nfcPasswords: 0,
        rules: 0,
        profiles: 0,
        staff: 0,
        audit: 0,
      });
      expect(
        await prisma.staffUser.findUnique({ where: { id: exclusive.id } }),
      ).toBeNull();
      expect(
        await prisma.staffSession.count({
          where: { staffUserId: exclusive.id },
        }),
      ).toBe(0);
      expect(await prisma.passwordResetToken.count()).toBe(0);
      expect(
        await prisma.staffMembership.findMany({
          where: { staffUserId: shared.id },
        }),
      ).toMatchObject([{ merchantId: other.id }]);
      expect(
        await prisma.staffSession.findUniqueOrThrow({
          where: { id: sharedSession.id },
        }),
      ).toMatchObject({ selectedMerchantId: null, revokedAt: null });

      const byOther = { where: { merchantId: other.id } };
      expect(await prisma.piece.count(byOther)).toBe(1);
      expect(await prisma.pieceScan.count(byOther)).toBe(1);
      expect(await prisma.auditEvent.count(byOther)).toBeGreaterThan(0);

      expect(
        await prisma.auditEvent.findMany({ where: { merchantId: null } }),
      ).toMatchObject([
        {
          actorType: 'PLATFORM_ADMIN',
          action: 'merchant.deleted',
          entityType: 'merchant',
          entityId: merchant.id,
          payload: {
            name: 'Café La Esquina',
            slug: 'cafe-la-esquina',
            pieces: 2,
            staffUsers: 1,
          },
        },
      ]);
    });

    it('sin archivar, con clientes no se borra, aunque hayan salido del club', async () => {
      for (const leftAt of [null, new Date()]) {
        const merchant = await createMerchant(`Café ${leftAt ? 'B' : 'A'}`);
        const rule = await addRule(merchant.id);
        await createPiece(merchant.id);
        const customer = await prisma.customer.create({
          data: {
            name: 'Ana',
            phoneE164: leftAt ? '+5491123456780' : '+5491123456789',
          },
        });
        await prisma.membership.create({
          data: {
            merchantId: merchant.id,
            customerId: customer.id,
            currentCycleRewardRuleId: rule.id,
            leftAt,
          },
        });

        const summary = await send(
          'get',
          `/admin/merchants/${merchant.id}/deletion-summary`,
        ).expect(200);
        const res = await remove(merchant.id, merchant.name).expect(409);

        expect(summary.body).toMatchObject({
          archived: false,
          canDelete: false,
          customers: 1,
        });
        expect(res.body).toMatchObject({
          code: 'MERCHANT_HAS_CUSTOMERS',
          details: { customers: 1 },
        });
        expect(
          await prisma.piece.count({ where: { merchantId: merchant.id } }),
        ).toBe(1);
      }
      expect(await auditCount('merchant.deleted')).toBe(0);
    });

    it('espera el bloqueo del comercio: un cliente que se suma mientras tanto lo impide', async () => {
      const merchant = await createMerchant('Café');
      const rule = await addRule(merchant.id);
      const customer = await prisma.customer.create({
        data: { name: 'Ana', phoneE164: '+5491123456789' },
      });
      let pending: Promise<request.Response> | undefined;

      await whileRowLocked('merchants', merchant.id, async (tx) => {
        pending = remove(merchant.id, 'Café').then((res) => res);
        await sleep(LOCK_WAIT_MS);
        await tx.membership.create({
          data: {
            merchantId: merchant.id,
            customerId: customer.id,
            currentCycleRewardRuleId: rule.id,
          },
        });
      });

      const res = await pending!;
      expect(res.body.code).toBe('MERCHANT_HAS_CUSTOMERS');
      expect(await prisma.merchant.count()).toBe(1);
    });

    it('pide escribir el nombre del comercio para confirmar', async () => {
      const merchant = await createMerchant('Café La Esquina');

      await remove(merchant.id).expect(400);
      const wrong = await remove(merchant.id, 'Café').expect(400);
      expect(wrong.body.details.issues).toEqual([
        { path: 'confirmName', message: expect.any(String) },
      ]);
      expect(await prisma.merchant.count()).toBe(1);

      await remove(merchant.id, '  café la esquina ').expect(204);
      expect(await prisma.merchant.count()).toBe(0);
    });

    it('un comercio inexistente da 404 y sin sesión de admin no entra', async () => {
      const merchant = await createMerchant('Café');

      await remove(randomUUID(), 'Café').expect(404);
      await request(app.getHttpServer())
        .delete(`/admin/merchants/${merchant.id}`)
        .query({ confirmName: 'Café' })
        .expect(401);
      expect(await prisma.merchant.count()).toBe(1);
    });
  });
});
