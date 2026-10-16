import { Module } from '@nestjs/common';
import { StampsModule } from '../stamps/stamps.module.js';
import { MeMembershipsController } from './me-memberships.controller.js';
import { MeMembershipsService } from './me-memberships.service.js';

@Module({
  imports: [StampsModule],
  controllers: [MeMembershipsController],
  providers: [MeMembershipsService],
})
export class MembershipsModule {}
