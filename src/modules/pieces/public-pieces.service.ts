import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaAdminService } from '../../prisma/prisma-admin.service.js';
import { PieceScansService } from './piece-scans.service.js';
import type { PieceVisit, PublicPiece } from './public-pieces.schemas.js';

@Injectable()
export class PublicPiecesService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly scans: PieceScansService,
  ) {}

  // Lo llama el middleware del front antes de decidir si redirige o deja
  // pasar a la página de siempre (club). redirect solo es true con la pieza
  // activa y un destino propio (no CLUBSY): ahí es donde hay que cortar
  // camino con un 307 real, sin pasar por el landing del club.
  async resolveVisit(publicCode: string, req: Request): Promise<PieceVisit> {
    const piece = await this.prisma.piece.findUnique({
      where: { publicCode },
    });
    if (!piece) return { redirect: false };
    await this.scans.record(piece.id, piece.merchantId, req);
    if (piece.active && piece.destinationType !== 'CLUBSY' && piece.destinationUrl) {
      return { redirect: true, url: piece.destinationUrl };
    }
    return { redirect: false };
  }

  async findByCode(publicCode: string): Promise<PublicPiece> {
    const piece = await this.prisma.piece.findUnique({
      where: { publicCode },
      include: {
        merchant: {
          include: { rewardRules: { where: { active: true } } },
        },
      },
    });
    if (!piece) throw new AppException('NOT_FOUND');
    if (!piece.active) return { state: 'PIECE_INACTIVE' };

    const { merchant } = piece;
    if (merchant.status === 'DRAFT') return { state: 'CLUB_NOT_OPEN' };

    const [rule] = merchant.rewardRules;
    return {
      state: merchant.status,
      canJoin: merchant.status === 'ACTIVE',
      merchant: {
        id: merchant.id,
        name: merchant.name,
        slug: merchant.slug,
        logoUrl: merchant.logoUrl,
        primaryColor: merchant.primaryColor,
        secondaryColor: merchant.secondaryColor,
        googleReviewUrl: merchant.googleReviewUrl,
      },
      rewardRule: rule
        ? {
            stampsRequired: rule.stampsRequired,
            rewardDescription: rule.rewardDescription,
            conditions: rule.conditions,
          }
        : null,
    };
  }
}
