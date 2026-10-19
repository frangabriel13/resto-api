import { setTimeout as sleep } from 'node:timers/promises';
import {
  Body,
  Controller,
  Get,
  INestApplication,
  Param,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AppException } from './../src/common/errors/app.exception.js';
import { hashPassword } from './../src/common/passwords.js';
import { TenantContext } from './../src/common/tenant/tenant-context.js';
import { Panel } from './../src/modules/auth/panel/panel.decorator.js';
import { Roles } from './../src/modules/auth/panel/tenant.guard.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { loginStaff } from './helpers/sessions.js';

@Controller('test-panel')
@Panel()
class TestPanelController {
  constructor(private readonly tenant: TenantContext) {}

  @Get('context')
  async context() {
    await sleep(20);
    const [row] = await this.tenant.db.$queryRaw<{ setting: string }[]>`
      SELECT current_setting('app.merchant_id', true) AS setting`;
    return { scope: this.tenant.scope, setting: row?.setting };
  }

  @Get('owner-only')
  @Roles('OWNER')
  ownerOnly() {
    return { ok: true };
  }

  @Get('pieces')
  pieces() {
    return this.tenant.db.piece.findMany({ orderBy: { label: 'asc' } });
  }

  @Get('pieces/:id')
  async piece(@Param('id') id: string) {
    return { piece: await this.tenant.db.piece.findUnique({ where: { id } }) };
  }

  @Post('pieces/:id/rename')
  rename(@Param('id') id: string) {
    return this.tenant.db.piece.update({
      where: { id },
      data: { label: 'Renombrada' },
    });
  }

  @Post('pieces')
  createPiece(@Body() body: { merchantId: string }) {
    return this.tenant.db.piece.create({
      data: {
        merchantId: body.merchantId,
        publicCode: `nueva-${Date.now()}`,
        label: 'Nueva',
      },
    });
  }

  @Post('fail')
  async fail() {
    await this.createPiece({ merchantId: this.tenant.scope.merchantId });
    throw new AppException('CONFLICT');
  }

  @Get('memberships')
  memberships() {
    return this.tenant.db.membership.findMany({ include: { customer: true } });
  }

  @Get('merchants')
  merchants() {
    return this.tenant.db.merchant.findMany();
  }

  @Get('customers')
  customers() {
    return this.tenant.db.customer.findMany();
  }
}

const PASSWORD = 'clave-correcta';

describe('Panel: comercio seleccionado y aislamiento (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let ids: {
    cafe: string;
    heladeria: string;
    pieceCafe: string;
    pieceHeladeria: string;
  };

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestPanelController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);
    ids = await createFixtures(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const login = (email: string) => loginStaff(app, email, PASSWORD);
  const get = (path: string, cookie: string) =>
    http().get(`/test-panel/${path}`).set('Cookie', cookie);
  const post = (path: string, cookie: string, body: object = {}) =>
    http().post(`/test-panel/${path}`).set('Cookie', cookie).send(body);
  const select = (cookie: string, merchantId: string) =>
    http()
      .post('/auth/staff/select-merchant')
      .set('Cookie', cookie)
      .send({ merchantId });

  describe('selección de comercio', () => {
    it('con un solo comercio queda seleccionado al entrar', async () => {
      const { body, cookie } = await login('empleado@cafe.com');
      expect(body.selectedMerchantId).toBe(ids.cafe);

      const res = await get('context', cookie).expect(200);
      expect(res.body).toMatchObject({
        scope: {
          merchantId: ids.cafe,
          role: 'EMPLOYEE',
          merchantStatus: 'ACTIVE',
        },
        setting: ids.cafe,
      });
    });

    it('con varios comercios hay que elegir uno', async () => {
      const { body, cookie } = await login('duena@cafe.com');
      expect(body.selectedMerchantId).toBeNull();
      const blocked = await get('context', cookie).expect(403);
      expect(blocked.body.code).toBe('MERCHANT_NOT_SELECTED');

      const selected = await select(cookie, ids.cafe).expect(200);
      expect(selected.body.selectedMerchantId).toBe(ids.cafe);
      const cafe = await get('context', cookie).expect(200);
      expect(cafe.body.scope).toMatchObject({
        merchantId: ids.cafe,
        role: 'OWNER',
      });

      await select(cookie, ids.heladeria).expect(200);
      const heladeria = await get('context', cookie).expect(200);
      expect(heladeria.body.scope).toMatchObject({
        merchantId: ids.heladeria,
        role: 'EMPLOYEE',
      });
    });

    it('no puede elegir un comercio ajeno ni uno del que lo dieron de baja', async () => {
      const employee = await login('empleado@cafe.com');
      const ajeno = await select(employee.cookie, ids.heladeria).expect(403);
      expect(ajeno.body.code).toBe('FORBIDDEN');

      const owner = await login('duena@cafe.com');
      await prisma.staffMembership.updateMany({
        where: { merchantId: ids.heladeria },
        data: { active: false },
      });
      await select(owner.cookie, ids.heladeria).expect(403);
    });

    it('si lo dan de baja con la sesión abierta, pierde el acceso', async () => {
      const { cookie } = await login('empleado@cafe.com');
      await prisma.staffMembership.updateMany({
        where: { staffUser: { email: 'empleado@cafe.com' } },
        data: { active: false },
      });

      const res = await get('context', cookie).expect(403);
      expect(res.body.code).toBe('MERCHANT_ACCESS_REVOKED');
      const me = await http()
        .get('/auth/staff/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(me.body.selectedMerchantId).toBeNull();
    });
  });

  it('las rutas solo para OWNER rechazan al EMPLOYEE', async () => {
    const employee = await login('empleado@cafe.com');
    const res = await get('owner-only', employee.cookie).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');

    const owner = await login('duena@cafe.com');
    await select(owner.cookie, ids.cafe);
    await get('owner-only', owner.cookie).expect(200);
  });

  describe('filtro por comercio', () => {
    it('solo ve los datos de su comercio', async () => {
      const { cookie } = await login('empleado@cafe.com');

      const pieces = await get('pieces', cookie).expect(200);
      expect(pieces.body.map((p: { id: string }) => p.id)).toEqual([
        ids.pieceCafe,
      ]);
      const memberships = await get('memberships', cookie).expect(200);
      expect(memberships.body).toMatchObject([
        { merchantId: ids.cafe, customer: { name: 'Ana' } },
      ]);
      const merchants = await get('merchants', cookie).expect(200);
      expect(merchants.body.map((m: { id: string }) => m.id)).toEqual([
        ids.cafe,
      ]);
    });

    it('no encuentra ni modifica registros de otro comercio', async () => {
      const { cookie } = await login('empleado@cafe.com');

      const found = await get(`pieces/${ids.pieceHeladeria}`, cookie).expect(
        200,
      );
      expect(found.body.piece).toBeNull();
      await post(`pieces/${ids.pieceHeladeria}/rename`, cookie).expect(500);
      const piece = await prisma.piece.findUniqueOrThrow({
        where: { id: ids.pieceHeladeria },
      });
      expect(piece.label).toBe('Mostrador heladería');
    });

    it('crea en su comercio y rechaza crear en otro', async () => {
      const { cookie } = await login('empleado@cafe.com');

      await post('pieces', cookie, { merchantId: ids.cafe }).expect(201);
      await post('pieces', cookie, { merchantId: ids.heladeria }).expect(500);
      expect(
        await prisma.piece.count({ where: { merchantId: ids.heladeria } }),
      ).toBe(1);
    });

    it('no deja leer clientes sin pasar por una membresía', async () => {
      const { cookie } = await login('empleado@cafe.com');
      const res = await get('customers', cookie).expect(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('transacción por request', () => {
    it('si la operación falla, no queda nada guardado', async () => {
      const { cookie } = await login('empleado@cafe.com');
      await post('fail', cookie).expect(409);
      expect(
        await prisma.piece.count({ where: { merchantId: ids.cafe } }),
      ).toBe(1);
    });

    it('el comercio no queda configurado en la conexión', async () => {
      const { cookie } = await login('empleado@cafe.com');
      await get('context', cookie).expect(200);

      // El pool de runtime es el que reutilizan los requests.
      const runtime = app.get(PrismaService);
      for (let i = 0; i < 5; i++) {
        const [row] = await runtime.$queryRaw<{ setting: string | null }[]>`
          SELECT current_setting('app.merchant_id', true) AS setting`;
        expect(row?.setting || null).toBeNull();
      }
    });

    it('requests simultáneos de comercios distintos no se mezclan', async () => {
      const employee = await login('empleado@cafe.com');
      const owner = await login('duena@cafe.com');
      await select(owner.cookie, ids.heladeria);

      const calls = Array.from({ length: 6 }, (_, i) => {
        const [cookie, expected] =
          i % 2 === 0
            ? [employee.cookie, ids.cafe]
            : [owner.cookie, ids.heladeria];
        return get('context', cookie).then((res) => ({ res, expected }));
      });

      for (const { res, expected } of await Promise.all(calls)) {
        expect(res.body.scope.merchantId).toBe(expected);
        expect(res.body.setting).toBe(expected);
      }
    });
  });
});

async function createFixtures(prisma: PrismaAdminService) {
  const passwordHash = await hashPassword(PASSWORD);
  const [cafe, heladeria] = await Promise.all(
    ['cafe', 'heladeria'].map((slug) =>
      prisma.merchant.create({ data: { name: slug, slug, status: 'ACTIVE' } }),
    ),
  );
  const staff = { passwordHash, mustChangePassword: false };
  await prisma.staffUser.create({
    data: {
      ...staff,
      email: 'duena@cafe.com',
      name: 'Dueña',
      memberships: {
        create: [
          { merchantId: cafe!.id, role: 'OWNER' },
          { merchantId: heladeria!.id, role: 'EMPLOYEE' },
        ],
      },
    },
  });
  await prisma.staffUser.create({
    data: {
      ...staff,
      email: 'empleado@cafe.com',
      name: 'Empleado',
      memberships: { create: { merchantId: cafe!.id, role: 'EMPLOYEE' } },
    },
  });

  const pieces = [];
  for (const [merchant, label, name, phone] of [
    [cafe!, 'Mostrador café', 'Ana', '+5491100000001'],
    [heladeria!, 'Mostrador heladería', 'Beto', '+5491100000002'],
  ] as const) {
    const rule = await prisma.rewardRule.create({
      data: {
        merchantId: merchant.id,
        version: 1,
        stampsRequired: 8,
        rewardDescription: 'Premio',
        active: true,
      },
    });
    const customer = await prisma.customer.create({
      data: { name, phoneE164: phone },
    });
    await prisma.membership.create({
      data: {
        merchantId: merchant.id,
        customerId: customer.id,
        currentCycleRewardRuleId: rule.id,
      },
    });
    pieces.push(
      await prisma.piece.create({
        data: {
          merchantId: merchant.id,
          publicCode: `pieza-${merchant.slug}`,
          label,
        },
      }),
    );
  }

  return {
    cafe: cafe!.id,
    heladeria: heladeria!.id,
    pieceCafe: pieces[0]!.id,
    pieceHeladeria: pieces[1]!.id,
  };
}
