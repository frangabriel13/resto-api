import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaAdminService } from '../../prisma/prisma-admin.service.js';
import type { PublicPiece } from './public-pieces.schemas.js';

@Injectable()
export class PublicPiecesService {
  constructor(private readonly prisma: PrismaAdminService) {}

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
