import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type {
  Merchant,
  Piece,
  RewardRule,
} from '../../generated/prisma/client.js';
import { PrismaAdminService } from '../../prisma/prisma-admin.service.js';
import { toPublicPage } from '../merchants/merchant-page.js';
import { redirectUrl, toDestination } from './piece-destination.js';
import type { PublicPiece } from './public-pieces.schemas.js';

type PieceWithClub = Piece & {
  merchant: Merchant & { rewardRules: RewardRule[] };
};

@Injectable()
export class PublicPiecesService {
  constructor(private readonly prisma: PrismaAdminService) {}

  async findByCode(publicCode: string): Promise<PublicPiece> {
    return toPublicPiece(await this.findOrFail(publicCode));
  }

  // Lo llama el front una vez por escaneo; una pieza inactiva no tiene destino.
  async scan(publicCode: string): Promise<PublicPiece> {
    const piece = await this.findOrFail(publicCode);
    if (piece.active) {
      await this.prisma.pieceScan.create({
        data: {
          pieceId: piece.id,
          merchantId: piece.merchantId,
          destination: piece.destination,
        },
      });
    }
    return toPublicPiece(piece);
  }

  private async findOrFail(publicCode: string): Promise<PieceWithClub> {
    const piece = await this.prisma.piece.findUnique({
      where: { publicCode },
      include: {
        merchant: {
          include: { rewardRules: { where: { active: true } } },
        },
      },
    });
    if (!piece) throw new AppException('NOT_FOUND');
    return piece;
  }
}

// Los destinos externos no dependen del estado del club.
function toPublicPiece(piece: PieceWithClub): PublicPiece {
  if (!piece.active) return { state: 'PIECE_INACTIVE' };
  const url = redirectUrl(toDestination(piece));
  if (url) return { state: 'REDIRECT', url };

  const { merchant } = piece;
  const draft = merchant.status === 'DRAFT';
  const [rule] = draft ? [] : merchant.rewardRules;
  return {
    state: merchant.status === 'DRAFT' ? 'CLUB_NOT_OPEN' : merchant.status,
    canJoin: merchant.status === 'ACTIVE',
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      logoUrl: merchant.logoUrl,
      coverUrl: merchant.coverUrl,
      primaryColor: merchant.primaryColor,
      secondaryColor: merchant.secondaryColor,
      googleReviewUrl: merchant.googleReviewUrl,
    },
    page: toPublicPage(merchant),
    rewardRule: rule
      ? {
          stampsRequired: rule.stampsRequired,
          rewardDescription: rule.rewardDescription,
          conditions: rule.conditions,
        }
      : null,
  };
}
