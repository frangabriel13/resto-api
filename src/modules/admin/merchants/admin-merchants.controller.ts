import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiProduces, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { MerchantStatus } from '../../../generated/prisma/client.js';
import { AdminOnly } from '../../auth/admin/admin-only.decorator.js';
import { Auth } from '../../auth/sessions/auth.decorator.js';
import type { AuthSession } from '../../auth/sessions/session-kinds.js';
import {
  createMerchantBodySchema,
  deletionSummarySchema,
  merchantSchema,
  merchantSummarySchema,
  updateMerchantBodySchema,
  type CreateMerchantBody,
  type DeletionSummary,
  type MerchantResponse,
  type MerchantSummary,
  type UpdateMerchantBody,
} from './admin-merchants.schemas.js';
import { AdminMerchantExportService } from './admin-merchant-export.service.js';
import { AdminMerchantsService } from './admin-merchants.service.js';
import { MerchantDeletionService } from './merchant-deletion.service.js';

const uuid = { schema: z.uuid() };

@Controller('admin/merchants')
@AdminOnly()
export class AdminMerchantsController {
  constructor(
    private readonly merchants: AdminMerchantsService,
    private readonly deletion: MerchantDeletionService,
    private readonly exporter: AdminMerchantExportService,
  ) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: MerchantStatus })
  @ApiQuery({ name: 'archived', required: false, enum: ['true', 'false'] })
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: z.array(merchantSummarySchema),
  })
  list(
    @Query('status', { schema: z.enum(MerchantStatus).optional() })
    status?: MerchantStatus,
    @Query('archived', { schema: z.enum(['true', 'false']).optional() })
    archived?: 'true' | 'false',
  ): Promise<MerchantSummary[]> {
    return this.merchants.list(status, archived === 'true');
  }

  @Get(':id')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: merchantSchema })
  get(@Param('id', uuid) id: string): Promise<MerchantResponse> {
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
    @Param('id', uuid) id: string,
    @Body({ schema: updateMerchantBodySchema }) body: UpdateMerchantBody,
  ): Promise<MerchantResponse> {
    return this.merchants.update(auth.ownerId, id, body);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: merchantSchema })
  archive(
    @Auth() auth: AuthSession,
    @Param('id', uuid) id: string,
  ): Promise<MerchantResponse> {
    return this.merchants.archive(auth.ownerId, id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: merchantSchema })
  unarchive(
    @Auth() auth: AuthSession,
    @Param('id', uuid) id: string,
  ): Promise<MerchantResponse> {
    return this.merchants.unarchive(auth.ownerId, id);
  }

  @Get(':id/deletion-summary')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: deletionSummarySchema })
  deletionSummary(@Param('id', uuid) id: string): Promise<DeletionSummary> {
    return this.deletion.summary(id);
  }

  @Get(':id/export')
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, schema: { type: 'string' } })
  async export(
    @Auth() auth: AuthSession,
    @Param('id', uuid) id: string,
  ): Promise<StreamableFile> {
    const { filename, csv } = await this.exporter.customers(auth.ownerId, id);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  // confirmName: el nombre del comercio, como segunda confirmación.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async delete(
    @Auth() auth: AuthSession,
    @Param('id', uuid) id: string,
    @Query('confirmName', { schema: z.string().trim().min(1).max(100) })
    confirmName: string,
  ): Promise<void> {
    await this.deletion.delete(auth.ownerId, id, confirmName);
  }
}
