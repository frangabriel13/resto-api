import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { loginStaff } from './helpers/sessions.js';

const PASSWORD = 'clave-correcta';
const rule = (stampsRequired: number, rewardDescription = 'Café gratis') => ({
  stampsRequired,
  rewardDescription,
  conditions: 'De lunes a viernes',
});

describe('Panel: reglas de premio (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let merchantId: string;
  let owner: string;

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    const passwordHash = await hashPassword(PASSWORD);
    const [cafe, otro] = await Promise.all(
      ['cafe', 'otro'].map((slug) =>
        prisma.merchant.create({ data: { name: slug, slug } }),
      ),
    );
    merchantId = cafe!.id;
    await prisma.rewardRule.create({
      data: {
        merchantId: otro!.id,
        version: 1,
        stampsRequired: 5,
        rewardDescription: 'De otro comercio',
        active: true,
      },
    });
    for (const [email, role] of [
      ['duena@cafe.com', 'OWNER'],
      ['empleado@cafe.com', 'EMPLOYEE'],
    ] as const) {
      await prisma.staffUser.create({
        data: {
          email,
          name: email,
          passwordHash,
          mustChangePassword: false,
          memberships: { create: { merchantId, role } },
        },
      });
    }
    owner = (await loginStaff(app, 'duena@cafe.com', PASSWORD)).cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const create = (cookie: string, body: object) =>
    request(app.getHttpServer())
      .post('/panel/reward-rules')
      .set('Cookie', cookie)
      .send(body);
  const list = (cookie: string) =>
    request(app.getHttpServer())
      .get('/panel/reward-rules')
      .set('Cookie', cookie);
  const setStatus = (status: MerchantStatus) =>
    prisma.merchant.update({ where: { id: merchantId }, data: { status } });

  it('la primera regla queda como versión 1 activa', async () => {
    const res = await create(owner, rule(8)).expect(201);

    expect(res.body).toMatchObject({
      version: 1,
      stampsRequired: 8,
      rewardDescription: 'Café gratis',
      conditions: 'De lunes a viernes',
      active: true,
    });
    const listed = await list(owner).expect(200);
    expect(listed.body).toEqual([res.body]);
    expect(
      await prisma.auditEvent.findMany({ where: { merchantId } }),
    ).toMatchObject([
      {
        action: 'reward_rule.created',
        entityId: res.body.id,
        actorType: 'STAFF',
      },
    ]);
  });

  it('cambiarla crea una versión nueva y las membresías conservan la de su ciclo', async () => {
    const v1 = (await create(owner, rule(8)).expect(201)).body;
    const customer = await prisma.customer.create({
      data: { name: 'Ana', phoneE164: '+5491100000001' },
    });
    const membership = await prisma.membership.create({
      data: {
        merchantId,
        customerId: customer.id,
        currentCycleRewardRuleId: v1.id,
      },
    });

    const v2 = (await create(owner, rule(10, 'Medialunas')).expect(201)).body;

    expect(v2).toMatchObject({ version: 2, active: true, stampsRequired: 10 });
    const listed = await list(owner).expect(200);
    expect(listed.body).toMatchObject([
      { id: v2.id, version: 2, active: true },
      { id: v1.id, version: 1, active: false, stampsRequired: 8 },
    ]);
    const unchanged = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(unchanged.currentCycleRewardRuleId).toBe(v1.id);
  });

  it('dos altas simultáneas quedan como versiones consecutivas con una sola activa', async () => {
    const results = await Promise.all([
      create(owner, rule(8)),
      create(owner, rule(9)),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);

    const rules = await prisma.rewardRule.findMany({
      where: { merchantId },
      orderBy: { version: 'asc' },
    });
    expect(rules.map((r) => [r.version, r.active])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('solo el OWNER las ve y las cambia', async () => {
    const employee = await loginStaff(app, 'empleado@cafe.com', PASSWORD);
    expect((await list(employee.cookie).expect(403)).body.code).toBe(
      'FORBIDDEN',
    );
    await create(employee.cookie, rule(8)).expect(403);
  });

  it('valida los datos', async () => {
    for (const body of [
      rule(0),
      rule(51),
      rule(8, ''),
      { stampsRequired: 8, rewardDescription: 'Café' },
    ]) {
      const res = await create(owner, body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('con el club pausado o finalizado no se puede cambiar', async () => {
    await create(owner, rule(8)).expect(201);

    for (const status of ['PAUSED', 'ENDED'] as const) {
      await setStatus(status);
      const res = await create(owner, rule(10)).expect(409);
      expect(res.body.code).toBe('MERCHANT_READ_ONLY');
      await list(owner).expect(200);
    }
  });
});
