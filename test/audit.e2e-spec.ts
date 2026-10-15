import { randomUUID } from 'node:crypto';
import { Controller, INestApplication, Param, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AppException } from './../src/common/errors/app.exception.js';
import { hashPassword } from './../src/common/passwords.js';
import { AuditService } from './../src/modules/audit/audit.service.js';
import { Panel } from './../src/modules/auth/panel/panel.decorator.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { loginStaff } from './helpers/sessions.js';

@Controller('test-audit')
@Panel()
class TestAuditController {
  constructor(private readonly audit: AuditService) {}

  @Post(':entityId')
  async record(@Param('entityId') entityId: string) {
    await this.audit.record({
      action: 'stamp.created',
      entityId,
      payload: { cooldownOverride: true },
    });
  }

  @Post(':entityId/fail')
  async recordAndFail(@Param('entityId') entityId: string) {
    await this.record(entityId);
    throw new AppException('CONFLICT');
  }
}

describe('Auditoría (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let ids: { merchant: string; staff: string };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestAuditController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const merchant = await prisma.merchant.create({
      data: { name: 'Café', slug: 'cafe' },
    });
    const staff = await prisma.staffUser.create({
      data: {
        email: 'empleado@cafe.com',
        name: 'Empleado',
        passwordHash: await hashPassword('clave-correcta'),
        mustChangePassword: false,
        memberships: { create: { merchantId: merchant.id, role: 'EMPLOYEE' } },
      },
    });
    ids = { merchant: merchant.id, staff: staff.id };
    ({ cookie } = await loginStaff(app, 'empleado@cafe.com', 'clave-correcta'));
  });

  afterEach(async () => {
    await app.close();
  });

  it('registra la acción con el comercio y el staff de la sesión', async () => {
    const entityId = randomUUID();
    await request(app.getHttpServer())
      .post(`/test-audit/${entityId}`)
      .set('Cookie', cookie)
      .expect(201);

    expect(await prisma.auditEvent.findMany()).toMatchObject([
      {
        merchantId: ids.merchant,
        actorType: 'STAFF',
        actorId: ids.staff,
        action: 'stamp.created',
        entityType: 'stamp',
        entityId,
        payload: { cooldownOverride: true },
      },
    ]);
  });

  it('si la acción falla, no queda registro', async () => {
    await request(app.getHttpServer())
      .post(`/test-audit/${randomUUID()}/fail`)
      .set('Cookie', cookie)
      .expect(409);

    expect(await prisma.auditEvent.count()).toBe(0);
  });
});
