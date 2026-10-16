import { Module } from '@nestjs/common';
import { PanelCustomersController } from './panel-customers.controller.js';
import { PanelCustomersService } from './panel-customers.service.js';

@Module({
  controllers: [PanelCustomersController],
  providers: [PanelCustomersService],
})
export class PanelCustomersModule {}
