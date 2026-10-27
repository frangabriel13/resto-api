import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly } from '../../auth/admin/admin-only.decorator.js';
import { Auth } from '../../auth/sessions/auth.decorator.js';
import type { AuthSession } from '../../auth/sessions/session-kinds.js';
import {
  createSaleBodySchema,
  saleSchema,
  updateSaleBodySchema,
  type CreateSaleBody,
  type SaleResponse,
  type UpdateSaleBody,
} from './admin-sales.schemas.js';
import { AdminSalesService } from './admin-sales.service.js';

const uuid = { schema: z.uuid() };

@Controller('admin')
@AdminOnly()
export class AdminSalesController {
  constructor(private readonly sales: AdminSalesService) {}

  // Sin merchantId: tablero de ventas general. Con merchantId: historial de
  // ventas de un comercio (lo usa su ficha).
  @Get('sales')
  @ApiQuery({ name: 'merchantId', required: false })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: z.array(saleSchema) })
  list(
    @Query('merchantId', { schema: z.uuid().optional() }) merchantId?: string,
  ): Promise<SaleResponse[]> {
    return this.sales.list(merchantId);
  }

  @Post('merchants/:merchantId/sales')
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: saleSchema })
  create(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Body({ schema: createSaleBodySchema }) body: CreateSaleBody,
  ): Promise<SaleResponse> {
    return this.sales.create(auth.ownerId, merchantId, body);
  }

  @Patch('sales/:saleId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: saleSchema })
  update(
    @Auth() auth: AuthSession,
    @Param('saleId', uuid) saleId: string,
    @Body({ schema: updateSaleBodySchema }) body: UpdateSaleBody,
  ): Promise<SaleResponse> {
    return this.sales.update(auth.ownerId, saleId, body);
  }
}
