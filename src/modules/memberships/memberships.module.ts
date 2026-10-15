import { Module } from '@nestjs/common';
import { MeMembershipsController } from './me-memberships.controller.js';
import { MeMembershipsService } from './me-memberships.service.js';

@Module({
  controllers: [MeMembershipsController],
  providers: [MeMembershipsService],
})
export class MembershipsModule {}
