import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { setupOpenApi } from './common/openapi.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Para que onModuleDestroy cierre los pools de Postgres al recibir SIGTERM.
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupOpenApi(app);
  }
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
