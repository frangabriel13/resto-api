// Va antes que Nest (`node --import ./dist/instrument.js dist/main`): en ESM,
// Sentry tiene que inicializarse antes de que se carguen los demás módulos.
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';
import { sentryOptions } from './config/sentry.js';

const options = sentryOptions(process.env);
if (options) Sentry.init(options);
