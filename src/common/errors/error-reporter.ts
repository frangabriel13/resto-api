import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

// Sin SENTRY_DSN, Sentry no está inicializado y esto no manda nada. Es un
// provider para que los tests lo reemplacen y vean qué se reporta.
@Injectable()
export class ErrorReporter {
  report(error: unknown): void {
    Sentry.captureException(error);
  }
}
