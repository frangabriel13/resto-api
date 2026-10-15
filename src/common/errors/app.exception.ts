import { HttpException } from '@nestjs/common';
import { errorCatalog, type ErrorCode } from './error-codes.js';

export type ErrorDetails = Record<string, unknown>;

// Error de la API con código del catálogo. El status HTTP sale del catálogo;
// si no se pasa mensaje, se usa el de respaldo del código.
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string = errorCatalog[code].message,
    readonly details?: ErrorDetails,
  ) {
    super(message, errorCatalog[code].status);
  }
}
