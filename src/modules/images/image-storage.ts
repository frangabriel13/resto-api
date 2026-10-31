import { AppException } from '../../common/errors/app.exception.js';

export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

export interface ImageStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
  // La clave de una URL de este bucket; null si es de otro lado.
  keyOf(url: string): string | null;
}

// Sin las variables de R2 (tests, o un desarrollo sin bucket): la API levanta
// igual y solo la subida falla.
export class UnavailableImageStorage implements ImageStorage {
  put(): Promise<void> {
    throw new AppException('IMAGE_STORAGE_UNAVAILABLE');
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  publicUrl(): string {
    throw new AppException('IMAGE_STORAGE_UNAVAILABLE');
  }
  keyOf(): string | null {
    return null;
  }
}

export function keyFromPublicUrl(baseUrl: string, url: string): string | null {
  const prefix = `${baseUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
