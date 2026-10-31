import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { AppException } from '../../common/errors/app.exception.js';
import { keyFromPublicUrl, type ImageStorage } from './image-storage.js';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

// El nombre de cada imagen es nuevo en cada subida: se puede cachear para siempre.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export class R2ImageStorage implements ImageStorage {
  private readonly client: S3Client;

  constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: CACHE_CONTROL,
        }),
      );
    } catch (error) {
      throw new AppException('IMAGE_UPLOAD_FAILED', undefined, undefined, {
        cause: r2Error(error),
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    } catch (error) {
      throw r2Error(error);
    }
  }

  publicUrl(key: string): string {
    return `${this.config.publicUrl}/${key}`;
  }

  keyOf(url: string): string | null {
    return keyFromPublicUrl(this.config.publicUrl, url);
  }
}

// Solo el tipo y el estado: el mensaje del SDK puede traer la URL firmada.
function r2Error(error: unknown): Error {
  if (error instanceof S3ServiceException) {
    return new Error(
      `R2 ${error.name} (HTTP ${error.$metadata.httpStatusCode ?? '?'})`,
    );
  }
  return new Error(`R2 ${error instanceof Error ? error.name : 'error'}`);
}
