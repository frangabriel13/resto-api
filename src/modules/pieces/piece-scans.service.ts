import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { deriveKey, hmacHex } from '../../common/crypto.js';
import { ErrorReporter } from '../../common/errors/error-reporter.js';
import type { Env } from '../../config/env.js';
import { PrismaAdminService } from '../../prisma/prisma-admin.service.js';
import { isLikelyBot } from './bot-detection.js';

const MAX_HEADER_LENGTH = 512;
// Alcanza para contar visitas repetidas de una misma IP sin guardarla.
const IP_HASH_LENGTH = 16;

// Log de escaneo de /p/{code}: sin cookies ni datos personales, mejor
// esfuerzo (nunca puede ser la causa de que un escaneo no redirija).
@Injectable()
export class PieceScansService {
  private readonly ipHashKey: Buffer;

  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly reporter: ErrorReporter,
    config: ConfigService<Env, true>,
  ) {
    this.ipHashKey = deriveKey(
      config.get('SECRET_KEY', { infer: true }),
      'piece_scan_ip',
    );
  }

  async record(
    pieceId: string,
    merchantId: string,
    req: Request,
  ): Promise<void> {
    try {
      const userAgent = req.headers['user-agent']?.slice(
        0,
        MAX_HEADER_LENGTH,
      );
      await this.prisma.pieceScan.create({
        data: {
          pieceId,
          merchantId,
          userAgent,
          referer: req.headers.referer?.slice(0, MAX_HEADER_LENGTH),
          ipHash: req.ip
            ? hmacHex(this.ipHashKey, req.ip).slice(0, IP_HASH_LENGTH)
            : undefined,
          possibleBot: isLikelyBot(userAgent),
        },
      });
    } catch (error) {
      this.reporter.report(error);
    }
  }
}
