import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import type { Piece, Prisma } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { generatePieceCode } from '../../pieces/piece-code.js';
import {
  changedDestinationFields,
  redirectUrl,
  toDestination,
  toDestinationData,
} from '../../pieces/piece-destination.js';
import type {
  CreatePieceBody,
  NfcPasswordResponse,
  PieceResponse,
  UpdatePieceBody,
} from './admin-pieces.schemas.js';
import { NfcPasswordsService } from './nfc-passwords.service.js';

const CODE_ATTEMPTS = 3;

@Injectable()
export class AdminPiecesService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
    private readonly nfcPasswords: NfcPasswordsService,
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
      const found = await findInMerchant(tx, merchantId, pieceId);
      const { destination, ...fields } = body;
      const destinationData = destination && toDestinationData(destination);
      const piece = await tx.piece.update({
        where: { id: pieceId },
        data: { ...fields, ...destinationData },
      });
      // Del destino, solo qué cambió: el WhatsApp puede ser un celular personal.
      await this.recordAudit(tx, adminId, piece, 'piece.updated', {
        ...fields,
        ...(destinationData && {
          destination: piece.destination,
          destinationFields: changedDestinationFields(found, destinationData),
        }),
      });
      return toResponse(piece);
    });
  }

  // La contraseña nunca va en la auditoría: solo que alguien la vio.
  async revealNfcPassword(
    adminId: string,
    merchantId: string,
    pieceId: string,
  ): Promise<NfcPasswordResponse> {
    return this.prisma.$transaction(async (tx) => {
      const piece = await findInMerchant(tx, merchantId, pieceId);
      const { password, generated } = await this.nfcPasswords.reveal(tx, piece);
      await this.recordAudit(
        tx,
        adminId,
        piece,
        'piece.nfc_password_revealed',
        { generated },
      );
      return { password };
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
          ...(body.destination && toDestinationData(body.destination)),
        },
      });
      await this.nfcPasswords.create(tx, piece);
      await this.recordAudit(tx, adminId, piece, 'piece.created', {
        label: piece.label,
        publicCode: piece.publicCode,
        destination: piece.destination,
      });
      return toResponse(piece);
    });
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    adminId: string,
    piece: Piece,
    action: 'piece.created' | 'piece.updated' | 'piece.nfc_password_revealed',
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

async function findInMerchant(
  tx: Prisma.TransactionClient,
  merchantId: string,
  pieceId: string,
): Promise<Piece> {
  const piece = await tx.piece.findFirst({
    where: { id: pieceId, merchantId },
  });
  if (!piece) throw new AppException('NOT_FOUND');
  return piece;
}

function toResponse(piece: Piece): PieceResponse {
  const destination = toDestination(piece);
  return {
    id: piece.id,
    publicCode: piece.publicCode,
    type: piece.type,
    label: piece.label,
    active: piece.active,
    destination,
    redirectUrl: redirectUrl(destination),
    createdAt: piece.createdAt.toISOString(),
  };
}
