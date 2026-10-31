import { Inject, Injectable, Logger } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorReporter } from '../../common/errors/error-reporter.js';
import { detectImageType } from './image-type.js';
import { IMAGE_STORAGE, type ImageStorage } from './image-storage.js';

export type ImageKind = 'logo' | 'cover';

const randomName = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
    private readonly reporter: ErrorReporter,
  ) {}

  // Devuelve la URL pública de la imagen subida.
  async upload(
    merchantId: string,
    kind: ImageKind,
    file: Buffer,
  ): Promise<string> {
    const type = detectImageType(file);
    if (!type) throw new AppException('IMAGE_TYPE_NOT_ALLOWED');
    const key = `merchants/${merchantId}/${kind}-${randomName()}.${type.extension}`;
    await this.storage.put(key, file, type.contentType);
    return this.storage.publicUrl(key);
  }

  // Se llama después del commit: si falla, la imagen queda huérfana en el
  // bucket (se reporta), pero el comercio nunca apunta a una que ya no existe.
  // Una URL que no es del bucket (un logo pegado a mano) no se toca.
  async discard(url: string | null): Promise<void> {
    const key = url && this.storage.keyOf(url);
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`No se pudo borrar una imagen vieja del bucket`);
      this.reporter.report(error);
    }
  }
}
