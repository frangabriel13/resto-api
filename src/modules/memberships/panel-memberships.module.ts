import { Module } from '@nestjs/common';
import { PanelMembershipsService } from './panel-memberships.service.js';

// Separado de MembershipsModule, que importa StampsModule: así sellos y
// canjes lo usan sin dependencias circulares.
@Module({
  providers: [PanelMembershipsService],
  exports: [PanelMembershipsService],
})
export class PanelMembershipsModule {}
