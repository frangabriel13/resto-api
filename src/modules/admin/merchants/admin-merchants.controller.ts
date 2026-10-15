import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly } from '../../auth/admin/admin-only.decorator.js';
import { Auth } from '../../auth/sessions/auth.decorator.js';
import type { AuthSession } from '../../auth/sessions/session-kinds.js';
import {
  createMerchantBodySchema,
  merchantSchema,
  merchantSummarySchema,
  updateMerchantBodySchema,
  type CreateMerchantBody,
  type MerchantResponse,
  type MerchantSummary,
  type UpdateMerchantBody,
} from './admin-merchants.schemas.js';
import { AdminMerchantsService } from './admin-merchants.service.js';

@Controller('admin/merchants')
@AdminOnly()
export class AdminMerchantsController {
  constructor(private readonly merchants: AdminMerchantsService) {}

  @Get()
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: z.array(merchantSummarySchema),
  })
  list(): Promise<MerchantSummary[]> {
    return this.merchants.list();
  }

  @Get(':id')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: merchantSchema })
  get(
    @Param('id', { schema: z.uuid() }) id: string,
  ): Promise<MerchantResponse> {
    return this.merchants.get(id);
  }

  @Post()
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: merchantSchema })
  create(
    @Auth() auth: AuthSession,
    @Body({ schema: createMerchantBodySchema }) body: CreateMerchantBody,
  ): Promise<MerchantResponse> {
    return this.merchants.create(auth.ownerId, body);
  }

  @Patch(':id')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: merchantSchema })
  update(
    @Auth() auth: AuthSession,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: updateMerchantBodySchema }) body: UpdateMerchantBody,
  ): Promise<MerchantResponse> {
    return this.merchants.update(auth.ownerId, id, body);
  }
}
