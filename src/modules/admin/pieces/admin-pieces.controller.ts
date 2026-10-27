import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
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
  nfcPasswordSchema,
  pieceSchema,
  updatePieceBodySchema,
  type CreatePieceBody,
  type NfcPasswordResponse,
  type PieceResponse,
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

  // POST: queda auditado y, en una pieza vieja, genera la contraseña.
  @Post(':pieceId/nfc-password/reveal')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: nfcPasswordSchema })
  revealNfcPassword(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('pieceId', uuid) pieceId: string,
  ): Promise<NfcPasswordResponse> {
    return this.pieces.revealNfcPassword(auth.ownerId, merchantId, pieceId);
  }
}
