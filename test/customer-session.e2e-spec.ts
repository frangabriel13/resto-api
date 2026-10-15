import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { CustomerOnly } from './../src/modules/auth/customer/customer.guard.js';
import { OTP_SENDER } from './../src/modules/auth/customer/otp-sender.js';
import { Auth } from './../src/modules/auth/sessions/auth.decorator.js';
import type { AuthSession } from './../src/modules/auth/sessions/session-kinds.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { FakeOtpSender } from './helpers/fake-otp-sender.js';
import { loginCustomer } from './helpers/sessions.js';

@Controller('test-customer')
@CustomerOnly()
class TestCustomerController {
  @Get('me')
  me(@Auth() auth: AuthSession) {
    return auth;
  }
}

describe('Cliente: sesión y logout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let customer: { id: string; cookie: string };

  beforeEach(async () => {
    const sender = new FakeOtpSender();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestCustomerController],
    })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const login = await loginCustomer(app, sender, '11 2345-6789', 'Ana');
    customer = { id: login.body.customer.id, cookie: login.cookie };
  });

  afterEach(async () => {
    await app.close();
  });

  const me = (cookie?: string) => {
    const req = request(app.getHttpServer()).get('/test-customer/me');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('con la sesión del cliente entra a sus rutas', async () => {
    const res = await me(customer.cookie).expect(200);
    expect(res.body).toMatchObject({ kind: 'customer', ownerId: customer.id });
    await me().expect(401);
  });

  it('cerrar sesión la invalida', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/customer/logout')
      .set('Cookie', customer.cookie)
      .expect(204);

    expect(res.headers['set-cookie']?.[0]).toMatch(/^fs_customer=;/);
    await me(customer.cookie).expect(401);
  });

  it('sin sesión, cerrar sesión no falla', async () => {
    await request(app.getHttpServer())
      .post('/auth/customer/logout')
      .expect(204);
  });

  it('una cuenta borrada pierde el acceso y su sesión queda revocada', async () => {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { deletedAt: new Date(), name: null, phoneE164: null },
    });

    const res = await me(customer.cookie).expect(401);

    expect(res.body.code).toBe('UNAUTHENTICATED');
    const session = await prisma.customerSession.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(session.revokedAt).not.toBeNull();
  });
});
