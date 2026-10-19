import { Module } from '@nestjs/common';
import { PanelMembershipsModule } from '../memberships/panel-memberships.module.js';
import { StampTokenService } from './stamp-token.service.js';
import { StampsController } from './stamps.controller.js';
import { StampsService } from './stamps.service.js';

@Module({
  imports: [PanelMembershipsModule],
  controllers: [StampsController],
  providers: [StampTokenService, StampsService],
  exports: [StampTokenService],
})
export class StampsModule {}
