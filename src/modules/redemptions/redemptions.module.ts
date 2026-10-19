import { Module } from '@nestjs/common';
import { PanelMembershipsModule } from '../memberships/panel-memberships.module.js';
import { StampsModule } from '../stamps/stamps.module.js';
import { RedemptionsController } from './redemptions.controller.js';
import { RedemptionsService } from './redemptions.service.js';

@Module({
  imports: [StampsModule, PanelMembershipsModule],
  controllers: [RedemptionsController],
  providers: [RedemptionsService],
})
export class RedemptionsModule {}
