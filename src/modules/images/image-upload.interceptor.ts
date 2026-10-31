import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { AppException } from '../../common/errors/app.exception.js';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// En memoria y con el límite puesto: un archivo grande se corta antes de
// leerlo entero. Los errores de multer pasan a nuestros códigos.
const receiveFile = multer({
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 },
}).single('file');

@Injectable()
export class ImageUploadInterceptor implements NestInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    await new Promise<void>((resolve, reject) =>
      receiveFile(request, http.getResponse<Response>(), (error: unknown) =>
        error ? reject(toAppException(error)) : resolve(),
      ),
    );
    if (!request.file) throw missingFile();
    return next.handle();
  }
}

function toAppException(error: unknown): AppException {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return new AppException('IMAGE_TOO_LARGE');
  }
  return missingFile();
}

function missingFile(): AppException {
  return new AppException('VALIDATION_ERROR', undefined, {
    issues: [{ path: 'file', message: 'Mandá una imagen en el campo "file".' }],
  });
}
