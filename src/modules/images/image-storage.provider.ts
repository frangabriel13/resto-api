import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { IMAGE_STORAGE, UnavailableImageStorage } from './image-storage.js';
import { R2ImageStorage } from './r2-image-storage.js';

export const imageStorageProvider: Provider = {
  provide: IMAGE_STORAGE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const get = <K extends keyof Env>(key: K) =>
      config.get(key, { infer: true });
    const accountId = get('R2_ACCOUNT_ID');
    const accessKeyId = get('R2_ACCESS_KEY_ID');
    const secretAccessKey = get('R2_SECRET_ACCESS_KEY');
    const bucket = get('R2_BUCKET');
    const publicUrl = get('IMAGES_PUBLIC_URL');
    // El schema de env garantiza que van todas o ninguna.
    if (
      !accountId ||
      !accessKeyId ||
      !secretAccessKey ||
      !bucket ||
      !publicUrl
    ) {
      return new UnavailableImageStorage();
    }
    return new R2ImageStorage({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicUrl,
    });
  },
};
