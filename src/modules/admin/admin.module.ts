import { Module } from '@nestjs/common';
import { AdminMerchantsController } from './merchants/admin-merchants.controller.js';
import { AdminMerchantsService } from './merchants/admin-merchants.service.js';
import { AdminOwnersController } from './owners/admin-owners.controller.js';
import { AdminOwnersService } from './owners/admin-owners.service.js';
import { AdminPiecesController } from './pieces/admin-pieces.controller.js';
import { AdminPiecesService } from './pieces/admin-pieces.service.js';
import { AdminSalesController } from './sales/admin-sales.controller.js';
import { AdminSalesService } from './sales/admin-sales.service.js';
import { NfcPasswordService } from '../pieces/nfc-password.service.js';

@Module({
  controllers: [
    AdminMerchantsController,
    AdminPiecesController,
    AdminOwnersController,
    AdminSalesController,
  ],
  providers: [
    AdminMerchantsService,
    AdminPiecesService,
    AdminOwnersService,
    AdminSalesService,
    NfcPasswordService,
  ],
})
export class AdminModule {}
