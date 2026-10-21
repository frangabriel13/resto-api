import type { ErrorEvent, NodeOptions } from '@sentry/nestjs';

type SentryEnv = Partial<
  Record<
    | 'SENTRY_DSN'
    | 'SENTRY_ENVIRONMENT'
    | 'SENTRY_TRACES_SAMPLE_RATE'
    | 'NODE_ENV'
    | 'SOURCE_COMMIT',
    string
  >
>;

const SENSITIVE_HEADERS = new Set(['cookie', 'set-cookie', 'authorization']);

// Se arma antes que Nest (instrument.ts), así que lee process.env directo;
// la validación de las variables la hace igual env.ts al arrancar.
export function sentryOptions(env: SentryEnv): NodeOptions | null {
  if (!env.SENTRY_DSN) return null;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? 'development',
    // Coolify pone el commit desplegado en SOURCE_COMMIT.
    release: env.SOURCE_COMMIT || undefined,
    // En la v11 el SDK recolecta todo por defecto: acá se apaga lo que puede
    // traer teléfonos, códigos, contraseñas o cookies.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { allow: ['user-agent', 'content-type'] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend: scrubEvent,
  };
}

// Segunda capa, por si algo se escapa de `dataCollection`: el body lleva
// teléfonos, códigos OTP, contraseñas y el token de reset; la query, teléfonos
// buscados en el panel.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request } = event;
  if (!request) return event;
  delete request.cookies;
  delete request.data;
  delete request.query_string;
  if (request.url) request.url = request.url.split('?')[0];
  if (request.headers) {
    for (const name of Object.keys(request.headers)) {
      if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
        delete request.headers[name];
      }
    }
  }
  return event;
}
