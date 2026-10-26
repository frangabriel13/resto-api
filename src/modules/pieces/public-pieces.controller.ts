import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import {
  pieceVisitSchema,
  publicPieceSchema,
  type PieceVisit,
  type PublicPiece,
} from './public-pieces.schemas.js';
import { PublicPiecesService } from './public-pieces.service.js';

const codeParam = { schema: z.string().max(64) };

@Controller('public/pieces')
export class PublicPiecesController {
  constructor(private readonly pieces: PublicPiecesService) {}

  @Get(':code')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: publicPieceSchema })
  find(@Param('code', codeParam) code: string): Promise<PublicPiece> {
    return this.pieces.findByCode(code);
  }

  // La consulta el middleware del front en cada visita a /p/:code, antes de
  // decidir si redirige. Mismo límite que find: una sola de las dos corre
  // por visita real.
  @Get(':code/visit')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: pieceVisitSchema })
  visit(
    @Param('code', codeParam) code: string,
    @Req() req: Request,
  ): Promise<PieceVisit> {
    return this.pieces.resolveVisit(code, req);
  }
}
