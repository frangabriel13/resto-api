import { Module } from '@nestjs/common';
import { RewardRulesController } from './reward-rules.controller.js';
import { RewardRulesService } from './reward-rules.service.js';

@Module({
  controllers: [RewardRulesController],
  providers: [RewardRulesService],
})
export class RewardRulesModule {}
