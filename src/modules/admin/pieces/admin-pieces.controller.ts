import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly } from '../../auth/admin/admin-only.decorator.js';
import { Auth } from '../../auth/sessions/auth.decorator.js';
import type { AuthSession } from '../../auth/sessions/session-kinds.js';
import {
  createPieceBodySchema,
  pieceSchema,
  pieceScanStatsSchema,
  revealedPasswordSchema,
  setNfcPasswordBodySchema,
  updatePieceBodySchema,
  type CreatePieceBody,
  type PieceResponse,
  type PieceScanStats,
  type RevealedPassword,
  type SetNfcPasswordBody,
  type UpdatePieceBody,
} from './admin-pieces.schemas.js';
import { AdminPiecesService } from './admin-pieces.service.js';

const uuid = { schema: z.uuid() };

@Controller('admin/merchants/:merchantId/pieces')
@AdminOnly()
export class AdminPiecesController {
  constructor(private readonly pieces: AdminPiecesService) {}

  @Get()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: z.array(pieceSchema) })
  list(
    @Param('merchantId', uuid) merchantId: string,
  ): Promise<PieceResponse[]> {
    return this.pieces.list(merchantId);
  }

  @Post()
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: pieceSchema })
  create(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Body({ schema: createPieceBodySchema }) body: CreatePieceBody,
  ): Promise<PieceResponse> {
    return this.pieces.create(auth.ownerId, merchantId, body);
  }

  @Patch(':pieceId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: pieceSchema })
  update(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('pieceId', uuid) pieceId: string,
    @Body({ schema: updatePieceBodySchema }) body: UpdatePieceBody,
  ): Promise<PieceResponse> {
    return this.pieces.update(auth.ownerId, merchantId, pieceId, body);
  }

  // Cambia o pone por primera vez la contraseña del chip. No se puede leer
  // de vuelta por acá: para eso está reveal-password, aparte y auditado.
  @Post(':pieceId/nfc-password')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: pieceSchema })
  setPassword(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('pieceId', uuid) pieceId: string,
    @Body({ schema: setNfcPasswordBodySchema }) body: SetNfcPasswordBody,
  ): Promise<PieceResponse> {
    return this.pieces.setPassword(
      auth.ownerId,
      merchantId,
      pieceId,
      body.nfcPassword,
    );
  }

  // Devuelve la contraseña en texto plano una sola vez. Cada pedido queda
  // auditado (quién y cuándo), no solo que exista el endpoint.
  @Post(':pieceId/reveal-password')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: revealedPasswordSchema })
  revealPassword(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('pieceId', uuid) pieceId: string,
  ): Promise<RevealedPassword> {
    return this.pieces.revealPassword(auth.ownerId, merchantId, pieceId);
  }

  // Retira el chip actual (roto o perdido) y crea uno nuevo con la misma
  // configuración de destino, con su propio código y sin la contraseña
  // anterior (es otro chip físico).
  @Post(':pieceId/replace')
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: pieceSchema })
  replace(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('pieceId', uuid) pieceId: string,
  ): Promise<PieceResponse> {
    return this.pieces.replace(auth.ownerId, merchantId, pieceId);
  }

  @Get(':pieceId/scans')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: pieceScanStatsSchema })
  scans(
    @Param('merchantId', uuid) merchantId: string,
    @Param('pieceId', uuid) pieceId: string,
  ): Promise<PieceScanStats> {
    return this.pieces.scanStats(merchantId, pieceId);
  }
}
