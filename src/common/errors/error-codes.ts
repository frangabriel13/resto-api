import { HttpStatus } from '@nestjs/common';

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
  INVALID_CREDENTIALS: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'El email o la contraseña no son correctos.',
  },
  NO_ACTIVE_MERCHANT: {
    status: HttpStatus.FORBIDDEN,
    message: 'Tu usuario no está habilitado en ningún comercio.',
  },
  PASSWORD_CHANGE_REQUIRED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Tenés que cambiar tu contraseña antes de seguir.',
  },
  MERCHANT_NOT_SELECTED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Elegí con qué comercio querés trabajar.',
  },
  MERCHANT_ACCESS_REVOKED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Ya no tenés acceso a este comercio.',
  },
  OTP_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El código no es correcto.',
  },
  OTP_EXPIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El código venció o ya se usó. Pedí uno nuevo.',
  },
  OTP_TOO_MANY_ATTEMPTS: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Hiciste demasiados intentos. Pedí un código nuevo.',
  },
  OTP_RESEND_TOO_SOON: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Esperá un momento antes de pedir otro código.',
  },
  OTP_LIMIT_REACHED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Pediste demasiados códigos. Probá de nuevo más tarde.',
  },
  NAME_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Decinos tu nombre para crear tu cuenta.',
  },
  MERCHANT_NOT_ACCEPTING_MEMBERS: {
    status: HttpStatus.CONFLICT,
    message: 'Este club no está recibiendo nuevos miembros.',
  },
  MERCHANT_READ_ONLY: {
    status: HttpStatus.CONFLICT,
    message:
      'El club está pausado o finalizado: el panel está en modo consulta.',
  },
  SLUG_TAKEN: {
    status: HttpStatus.CONFLICT,
    message: 'Ya hay un comercio con ese slug.',
  },
  SLUG_LOCKED: {
    status: HttpStatus.CONFLICT,
    message:
      'El slug solo se puede cambiar mientras el comercio está en preparación.',
  },
  INVALID_STATUS_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'El comercio no puede pasar a ese estado.',
  },
  ACTIVE_RULE_REQUIRED: {
    status: HttpStatus.CONFLICT,
    message:
      'Para activar el comercio tiene que tener una regla de premio activa.',
  },
  STAFF_ALREADY_IN_MERCHANT: {
    status: HttpStatus.CONFLICT,
    message: 'Esa persona ya forma parte del comercio.',
  },
  CURRENT_PASSWORD_INCORRECT: {
    status: HttpStatus.BAD_REQUEST,
    message: 'La contraseña actual no es correcta.',
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
