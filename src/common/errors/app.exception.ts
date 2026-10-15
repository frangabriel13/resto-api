import { HttpException } from '@nestjs/common';
import { errorCatalog, type ErrorCode } from './error-codes.js';

export type ErrorDetails = Record<string, unknown>;

export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string = errorCatalog[code].message,
    readonly details?: ErrorDetails,
  ) {
    super(message, errorCatalog[code].status);
  }
}
