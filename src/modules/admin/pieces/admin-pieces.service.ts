import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import type { Piece, Prisma } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { NfcPasswordService } from '../../pieces/nfc-password.service.js';
import { generatePieceCode } from '../../pieces/piece-code.js';
import { destinationUrlSchemaByType } from '../../pieces/piece-fields.js';
import type {
  CreatePieceBody,
  PieceResponse,
  PieceScanStats,
  RevealedPassword,
  UpdatePieceBody,
} from './admin-pieces.schemas.js';

const CODE_ATTEMPTS = 3;
const RECENT_SCANS_LIMIT = 50;

type DestinationInput = {
  destinationType?: Piece['destinationType'];
  destinationUrl?: string | null;
};

@Injectable()
export class AdminPiecesService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
    private readonly nfcPassword: NfcPasswordService,
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
    const destinationUrl = resolveDestinationUrl(body, null);
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.createWithCode(
          adminId,
          merchantId,
          body,
          destinationUrl,
        );
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

      const destinationChanged =
        body.destinationType !== undefined ||
        body.destinationUrl !== undefined;
      const destinationUrl = destinationChanged
        ? resolveDestinationUrl(body, found)
        : undefined;

      const data: Prisma.PieceUpdateInput = {
        label: body.label,
        active: body.active,
        destinationType: body.destinationType,
        nfcChipType: body.nfcChipType,
      };
      if (destinationChanged) data.destinationUrl = destinationUrl;
      if (body.fulfillmentStatus && body.fulfillmentStatus !== found.fulfillmentStatus) {
        data.fulfillmentStatus = body.fulfillmentStatus;
        if (body.fulfillmentStatus === 'PROGRAMMED' && !found.programmedAt) {
          data.programmedAt = new Date();
        }
        if (body.fulfillmentStatus === 'DELIVERED' && !found.deliveredAt) {
          data.deliveredAt = new Date();
        }
      }

      const piece = await tx.piece.update({ where: { id: pieceId }, data });
      // Un solo evento por request: destination_changed en vez de updated
      // cuando lo que cambió fue el destino, así el historial no lo repite.
      await this.recordAudit(
        tx,
        adminId,
        piece,
        destinationChanged ? 'piece.destination_changed' : 'piece.updated',
        { ...body },
      );
      return toResponse(piece);
    });
  }

  // Solo esto decide la contraseña: create() no la deja vacía por las dudas
  // y esto es lo único que la cambia después. Reemplaza la que hubiera.
  async setPassword(
    adminId: string,
    merchantId: string,
    pieceId: string,
    plainPassword: string,
  ): Promise<PieceResponse> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.piece.findFirst({
        where: { id: pieceId, merchantId },
      });
      if (!found) throw new AppException('NOT_FOUND');
      const piece = await tx.piece.update({
        where: { id: pieceId },
        data: { nfcPasswordEncrypted: this.nfcPassword.encrypt(plainPassword) },
      });
      await this.recordAudit(tx, adminId, piece, 'piece.password_regenerated', {});
      return toResponse(piece);
    });
  }

  // Devuelve la contraseña en texto plano una sola vez; queda auditado quién
  // la pidió y cuándo.
  async revealPassword(
    adminId: string,
    merchantId: string,
    pieceId: string,
  ): Promise<RevealedPassword> {
    return this.prisma.$transaction(async (tx) => {
      const piece = await tx.piece.findFirst({
        where: { id: pieceId, merchantId },
      });
      if (!piece) throw new AppException('NOT_FOUND');
      if (!piece.nfcPasswordEncrypted) throw new AppException('NOT_FOUND');
      await this.recordAudit(tx, adminId, piece, 'piece.password_revealed', {});
      return { nfcPassword: this.nfcPassword.decrypt(piece.nfcPasswordEncrypted) };
    });
  }

  // Retira el chip actual (roto o perdido) y crea uno nuevo con la misma
  // configuración de destino, pero código y contraseña propios: son un
  // chip físico distinto.
  async replace(
    adminId: string,
    merchantId: string,
    pieceId: string,
  ): Promise<PieceResponse> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.replaceOnce(adminId, merchantId, pieceId);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === CODE_ATTEMPTS) throw error;
      }
    }
  }

  private replaceOnce(
    adminId: string,
    merchantId: string,
    pieceId: string,
  ): Promise<PieceResponse> {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.piece.findFirst({
        where: { id: pieceId, merchantId },
      });
      if (!old) throw new AppException('NOT_FOUND');
      if (old.fulfillmentStatus === 'REPLACED') {
        throw new AppException('PIECE_ALREADY_REPLACED');
      }

      await tx.piece.update({
        where: { id: pieceId },
        data: { active: false, fulfillmentStatus: 'REPLACED' },
      });
      const replacement = await tx.piece.create({
        data: {
          merchantId,
          label: old.label,
          publicCode: generatePieceCode(),
          destinationType: old.destinationType,
          destinationUrl: old.destinationUrl,
          nfcChipType: old.nfcChipType,
          saleId: old.saleId,
          fulfillmentStatus: 'PENDING',
          replacesPieceId: old.id,
        },
      });
      await this.recordAudit(tx, adminId, replacement, 'piece.replaced', {
        replacesPieceId: old.id,
      });
      return toResponse(replacement);
    });
  }

  async scanStats(merchantId: string, pieceId: string): Promise<PieceScanStats> {
    const piece = await this.prisma.piece.findFirst({
      where: { id: pieceId, merchantId },
      select: { id: true },
    });
    if (!piece) throw new AppException('NOT_FOUND');
    const [total, possibleBotCount, recent] = await Promise.all([
      this.prisma.pieceScan.count({ where: { pieceId } }),
      this.prisma.pieceScan.count({ where: { pieceId, possibleBot: true } }),
      this.prisma.pieceScan.findMany({
        where: { pieceId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_SCANS_LIMIT,
      }),
    ]);
    return {
      total,
      possibleBotCount,
      recent: recent.map((scan) => ({
        id: scan.id,
        createdAt: scan.createdAt.toISOString(),
        userAgent: scan.userAgent,
        referer: scan.referer,
        possibleBot: scan.possibleBot,
      })),
    };
  }

  private createWithCode(
    adminId: string,
    merchantId: string,
    body: CreatePieceBody,
    destinationUrl: string | null,
  ): Promise<PieceResponse> {
    return this.prisma.$transaction(async (tx) => {
      const piece = await tx.piece.create({
        data: {
          merchantId,
          label: body.label,
          publicCode: generatePieceCode(),
          destinationType: body.destinationType,
          destinationUrl,
          nfcChipType: body.nfcChipType,
          nfcPasswordEncrypted: body.nfcPassword
            ? this.nfcPassword.encrypt(body.nfcPassword)
            : null,
          saleId: body.saleId,
          fulfillmentStatus: body.saleId ? 'PENDING' : 'DELIVERED',
        },
      });
      await this.recordAudit(tx, adminId, piece, 'piece.created', {
        label: piece.label,
        publicCode: piece.publicCode,
        destinationType: piece.destinationType,
      });
      return toResponse(piece);
    });
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    adminId: string,
    piece: Piece,
    action:
      | 'piece.created'
      | 'piece.updated'
      | 'piece.destination_changed'
      | 'piece.password_revealed'
      | 'piece.password_regenerated'
      | 'piece.replaced',
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

// CLUBSY nunca tiene URL propia; los demás la exigen y además restringen el
// host según el tipo (ver piece-fields.ts). `current` es la pieza antes del
// update, para saber a qué tipo aplicar la URL si el body no manda las dos
// cosas juntas.
function resolveDestinationUrl(
  body: DestinationInput,
  current: Piece | null,
): string | null {
  const type = body.destinationType ?? current?.destinationType ?? 'CLUBSY';
  const url = body.destinationUrl !== undefined
    ? body.destinationUrl
    : current?.destinationUrl ?? null;

  if (type === 'CLUBSY') {
    if (url) throw new AppException('INVALID_DESTINATION_URL');
    return null;
  }
  if (!url) throw new AppException('INVALID_DESTINATION_URL');
  const schema = destinationUrlSchemaByType[type];
  const result = schema.safeParse(url);
  if (!result.success) throw new AppException('INVALID_DESTINATION_URL');
  return result.data;
}

function toResponse(piece: Piece): PieceResponse {
  return {
    id: piece.id,
    publicCode: piece.publicCode,
    type: piece.type,
    label: piece.label,
    active: piece.active,
    destinationType: piece.destinationType,
    destinationUrl: piece.destinationUrl,
    nfcChipType: piece.nfcChipType,
    hasNfcPassword: piece.nfcPasswordEncrypted !== null,
    fulfillmentStatus: piece.fulfillmentStatus,
    saleId: piece.saleId,
    replacesPieceId: piece.replacesPieceId,
    programmedAt: piece.programmedAt?.toISOString() ?? null,
    deliveredAt: piece.deliveredAt?.toISOString() ?? null,
    createdAt: piece.createdAt.toISOString(),
  };
}
