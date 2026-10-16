import { Module } from '@nestjs/common';
import { StampTokenService } from './stamp-token.service.js';
import { StampsController } from './stamps.controller.js';
import { StampsService } from './stamps.service.js';

@Module({
  controllers: [StampsController],
  providers: [StampTokenService, StampsService],
  exports: [StampTokenService],
})
export class StampsModule {}
