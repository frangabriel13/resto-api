import { Module } from '@nestjs/common';
import { PieceScansService } from './piece-scans.service.js';
import { PublicPiecesController } from './public-pieces.controller.js';
import { PublicPiecesService } from './public-pieces.service.js';

@Module({
  controllers: [PublicPiecesController],
  providers: [PublicPiecesService, PieceScansService],
})
export class PiecesModule {}
