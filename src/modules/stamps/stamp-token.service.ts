import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deriveKey } from '../../common/crypto.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import {
  readStampToken,
  signStampToken,
  type StampToken,
} from './stamp-token.js';

const TOKEN_TTL_MS = 2 * 60 * 1000;
// Renovar a la mitad: el QR en pantalla siempre tiene un minuto de validez.
export const STAMP_TOKEN_REFRESH_SECONDS = 60;

@Injectable()
export class StampTokenService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.key = deriveKey(
      config.get('SECRET_KEY', { infer: true }),
      'stamp-token',
    );
  }

  issue(membershipId: string): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    return {
      token: signStampToken(this.key, membershipId, expiresAt),
      expiresAt,
    };
  }

  // Valida la firma; el vencimiento lo decide quien lo usa.
  readOrThrow(token: string): StampToken {
    const stampToken = readStampToken(this.key, token);
    if (!stampToken) throw new AppException('STAMP_TOKEN_INVALID');
    return stampToken;
  }
}
