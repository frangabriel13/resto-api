import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from './api-error.schema.js';
import { AppException } from './app.exception.js';
import { errorCatalog, type ErrorCode } from './error-codes.js';

// Convierte cualquier excepción al formato `ApiError`. Los errores que no son
// HTTP se responden como INTERNAL_ERROR sin detalles y se loguean completos.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const body = this.toApiError(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(body.statusCode)
      .json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        ...(exception.details && { details: exception.details }),
      };
    }
    // Excepciones propias de Nest o de librerías (ruta inexistente, JSON mal
    // formado, throttler, …): se mapean a un código genérico con el mensaje
    // en español del catálogo.
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const code = codeForStatus(statusCode);
      return { statusCode, code, message: errorCatalog[code].message };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: errorCatalog.INTERNAL_ERROR.message,
    };
  }
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}
