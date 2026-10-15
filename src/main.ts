import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupOpenApi } from './common/openapi.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Los requests llegan por el proxy de Next: sin esto, todos los clientes
  // tendrían la IP del proxy y compartirían el límite de intentos.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupOpenApi(app);
  }
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
