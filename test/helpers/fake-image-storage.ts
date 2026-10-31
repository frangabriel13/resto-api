import { AppException } from './../../src/common/errors/app.exception.js';
import {
  keyFromPublicUrl,
  type ImageStorage,
} from './../../src/modules/images/image-storage.js';

export const FAKE_IMAGES_URL = 'https://img.test';

// El bucket en memoria: qué quedó guardado, con qué tipo.
export class FakeImageStorage implements ImageStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  failingPut = false;
  failingDelete = false;

  put(key: string, body: Buffer, contentType: string) {
    if (this.failingPut) {
      return Promise.reject(new AppException('IMAGE_UPLOAD_FAILED'));
    }
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }

  delete(key: string) {
    if (this.failingDelete) return Promise.reject(new Error('R2 caído'));
    this.objects.delete(key);
    return Promise.resolve();
  }

  publicUrl(key: string) {
    return `${FAKE_IMAGES_URL}/${key}`;
  }

  keyOf(url: string) {
    return keyFromPublicUrl(FAKE_IMAGES_URL, url);
  }

  keys(): string[] {
    return [...this.objects.keys()];
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Lo justo para pasar la detección por contenido; no hace falta que sea una
// imagen válida entera.
export function fakePng(size = 64): Buffer {
  const file = Buffer.alloc(size);
  Buffer.from(PNG_SIGNATURE).copy(file);
  return file;
}
