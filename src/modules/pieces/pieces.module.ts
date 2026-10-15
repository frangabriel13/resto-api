import { Module } from '@nestjs/common';
import { PublicPiecesController } from './public-pieces.controller.js';
import { PublicPiecesService } from './public-pieces.service.js';

@Module({
  controllers: [PublicPiecesController],
  providers: [PublicPiecesService],
})
export class PiecesModule {}
