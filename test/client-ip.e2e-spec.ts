import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { trustInternalProxies } from './../src/common/trust-proxy.js';

// Supertest se conecta por loopback, como el proxy de Coolify o el front en
// la red interna: la IP del cliente sale de X-Forwarded-For.
describe('IP del cliente detrás del proxy (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    trustInternalProxies(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const LIMIT = 10;
  const login = (forwardedFor: string) =>
    request(app.getHttpServer())
      .post('/auth/staff/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ email: 'nadie@cafe.com', password: 'una-clave-cualquiera' });
  const exhaust = async (forwardedFor: string) => {
    for (let i = 0; i < LIMIT; i++) await login(forwardedFor).expect(401);
  };

  it('cada cliente tiene su propio límite de intentos', async () => {
    await exhaust('203.0.113.1');

    await login('203.0.113.1').expect(429);
    await login('203.0.113.2').expect(401);
  });

  it('una IP inventada por el cliente no sirve para saltear el límite', async () => {
    await exhaust('203.0.113.1');

    // El proxy agrega la IP real a la derecha de lo que mandó el cliente.
    await login('198.51.100.7, 203.0.113.1').expect(429);
    await login('10.0.0.5, 203.0.113.1').expect(429);
  });

  it('/health responde si la base está disponible', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' });
  });
});
