import type { NestExpressApplication } from '@nestjs/platform-express';

// En producción solo el proxy de Coolify y el front (red interna de docker,
// direcciones privadas) están entre el cliente y la API. Express toma de
// X-Forwarded-For la primera IP de derecha a izquierda que no es de estas:
// una IP inventada por el cliente queda a la izquierda y se ignora.
export function trustInternalProxies(app: NestExpressApplication): void {
  app.set('trust proxy', 'loopback, uniquelocal');
}
