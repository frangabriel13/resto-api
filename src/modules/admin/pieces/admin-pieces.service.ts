import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import type { Piece, Prisma } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { generatePieceCode } from '../../pieces/piece-code.js';
import type {
  CreatePieceBody,
  PieceResponse,
  UpdatePieceBody,
} from './admin-pieces.schemas.js';

const CODE_ATTEMPTS = 3;

@Injectable()
export class AdminPiecesService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  async list(merchantId: string): Promise<PieceResponse[]> {
    await this.assertMerchantExists(merchantId);
    const pieces = await this.prisma.piece.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
    return pieces.map(toResponse);
  }

  async create(
    adminId: string,
    merchantId: string,
    body: CreatePieceBody,
  ): Promise<PieceResponse> {
    await this.assertMerchantExists(merchantId);
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.createWithCode(adminId, merchantId, body);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === CODE_ATTEMPTS) throw error;
      }
    }
  }

  async update(
    adminId: string,
    merchantId: string,
    pieceId: string,
    body: UpdatePieceBody,
  ): Promise<PieceResponse> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.piece.findFirst({
        where: { id: pieceId, merchantId },
      });
      if (!found) throw new AppException('NOT_FOUND');
      const piece = await tx.piece.update({
        where: { id: pieceId },
        data: body,
      });
      await this.recordAudit(tx, adminId, piece, 'piece.updated', body);
      return toResponse(piece);
    });
  }

  private createWithCode(
    adminId: string,
    merchantId: string,
    body: CreatePieceBody,
  ): Promise<PieceResponse> {
    return this.prisma.$transaction(async (tx) => {
      const piece = await tx.piece.create({
        data: {
          merchantId,
          label: body.label,
          publicCode: generatePieceCode(),
        },
      });
      await this.recordAudit(tx, adminId, piece, 'piece.created', {
        label: piece.label,
        publicCode: piece.publicCode,
      });
      return toResponse(piece);
    });
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    adminId: string,
    piece: Piece,
    action: 'piece.created' | 'piece.updated',
    payload: Prisma.InputJsonObject,
  ) {
    return this.audit.recordAdmin(tx, adminId, piece.merchantId, {
      action,
      entityId: piece.id,
      payload,
    });
  }

  private async assertMerchantExists(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new AppException('NOT_FOUND');
  }
}

function toResponse(piece: Piece): PieceResponse {
  return {
    id: piece.id,
    publicCode: piece.publicCode,
    type: piece.type,
    label: piece.label,
    active: piece.active,
    createdAt: piece.createdAt.toISOString(),
  };
}
