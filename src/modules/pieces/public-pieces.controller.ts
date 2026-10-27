import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import {
  publicPieceSchema,
  type PublicPiece,
} from './public-pieces.schemas.js';
import { PublicPiecesService } from './public-pieces.service.js';

const codeSchema = z.string().max(64);

@Controller('public/pieces')
export class PublicPiecesController {
  constructor(private readonly pieces: PublicPiecesService) {}

  @Get(':code')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: publicPieceSchema })
  find(
    @Param('code', { schema: codeSchema }) code: string,
  ): Promise<PublicPiece> {
    return this.pieces.findByCode(code);
  }

  @Post(':code/scans')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: publicPieceSchema })
  scan(
    @Param('code', { schema: codeSchema }) code: string,
  ): Promise<PublicPiece> {
    return this.pieces.scan(code);
  }
}
