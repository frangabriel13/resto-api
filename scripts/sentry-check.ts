// Manda un evento de prueba con el SENTRY_DSN configurado: sirve para ver que
// llegan los errores sin tener que romper la API.
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';
import { sentryOptions } from '../src/config/sentry.js';

const options = sentryOptions(process.env);
if (!options) {
  console.error('Falta SENTRY_DSN: configuralo para probar la conexión.');
  process.exit(1);
}
Sentry.init(options);
const eventId = Sentry.captureMessage('Prueba de conexión de Clubsy API');
const sent = await Sentry.flush(5000);
console.log(
  sent
    ? `Evento ${eventId} enviado a ${options.environment}. Buscalo en Sentry.`
    : 'No se pudo enviar el evento: revisá el DSN y la conexión.',
);
process.exit(sent ? 0 : 1);
