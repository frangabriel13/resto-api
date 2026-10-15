import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { Panel } from '../auth/panel/panel.decorator.js';
import { Roles } from '../auth/panel/tenant.guard.js';
import {
  createRewardRuleBodySchema,
  rewardRuleSchema,
  type CreateRewardRuleBody,
  type RewardRuleResponse,
} from './reward-rules.schemas.js';
import { RewardRulesService } from './reward-rules.service.js';

@Controller('panel/reward-rules')
@Panel()
@Roles('OWNER')
export class RewardRulesController {
  constructor(private readonly rules: RewardRulesService) {}

  @Get()
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: z.array(rewardRuleSchema),
  })
  list(): Promise<RewardRuleResponse[]> {
    return this.rules.list();
  }

  @Post()
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: rewardRuleSchema })
  create(
    @Body({ schema: createRewardRuleBodySchema }) body: CreateRewardRuleBody,
  ): Promise<RewardRuleResponse> {
    return this.rules.create(body);
  }
}
