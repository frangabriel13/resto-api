import { Module } from '@nestjs/common';
import { AdminMerchantsController } from './merchants/admin-merchants.controller.js';
import { AdminMerchantsService } from './merchants/admin-merchants.service.js';
import { AdminOwnersController } from './owners/admin-owners.controller.js';
import { AdminOwnersService } from './owners/admin-owners.service.js';
import { AdminPiecesController } from './pieces/admin-pieces.controller.js';
import { AdminPiecesService } from './pieces/admin-pieces.service.js';

@Module({
  controllers: [
    AdminMerchantsController,
    AdminPiecesController,
    AdminOwnersController,
  ],
  providers: [AdminMerchantsService, AdminPiecesService, AdminOwnersService],
})
export class AdminModule {}
