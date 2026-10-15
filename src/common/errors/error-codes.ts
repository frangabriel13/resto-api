import { HttpStatus } from '@nestjs/common';

// Catálogo de códigos de error de la API. El `code` es estable: el front
// decide qué mostrar en base a él. El `message` es un texto de respaldo en
// español. Los códigos de dominio (COOLDOWN_ACTIVE, TOKEN_EXPIRED, …) se
// agregan en la tarea que los empieza a usar.
export const errorCatalog = {
  BAD_REQUEST: {
    status: HttpStatus.BAD_REQUEST,
    message: 'La solicitud no es válida.',
  },
  VALIDATION_ERROR: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Los datos enviados no son válidos.',
  },
  UNAUTHENTICATED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Tenés que iniciar sesión.',
  },
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: 'No tenés permiso para hacer esto.',
  },
  NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'No encontramos lo que buscás.',
  },
  CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'La operación entra en conflicto con el estado actual.',
  },
  RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Demasiados intentos. Probá de nuevo en un rato.',
  },
  INTERNAL_ERROR: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Ocurrió un error inesperado.',
  },
} as const satisfies Record<string, { status: HttpStatus; message: string }>;

export type ErrorCode = keyof typeof errorCatalog;

export const errorCodes = Object.keys(errorCatalog) as [
  ErrorCode,
  ...ErrorCode[],
];
