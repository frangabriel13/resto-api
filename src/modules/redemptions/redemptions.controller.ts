import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { Panel } from '../auth/panel/panel.decorator.js';
import { Roles } from '../auth/panel/tenant.guard.js';
import {
  createRedemptionBodySchema,
  redemptionResultSchema,
  voidRedemptionBodySchema,
  voidRedemptionResultSchema,
  type CreateRedemptionBody,
  type RedemptionResult,
  type VoidRedemptionBody,
  type VoidRedemptionResult,
} from './redemptions.schemas.js';
import { RedemptionsService } from './redemptions.service.js';

@Controller('panel/redemptions')
@Panel()
export class RedemptionsController {
  constructor(private readonly redemptions: RedemptionsService) {}

  @Post()
  @ApiResponse({
    status: HttpStatus.CREATED,
    standardSchema: redemptionResultSchema,
  })
  create(
    @Body({ schema: createRedemptionBodySchema }) body: CreateRedemptionBody,
  ): Promise<RedemptionResult> {
    return this.redemptions.create(body);
  }

  @Post(':id/void')
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: voidRedemptionResultSchema,
  })
  void(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: voidRedemptionBodySchema }) body: VoidRedemptionBody,
  ): Promise<VoidRedemptionResult> {
    return this.redemptions.void(id, body.reason);
  }
}
