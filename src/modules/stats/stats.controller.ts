import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import { arDayParamSchema } from '../../common/schemas.js';
import { Panel } from '../auth/panel/panel.decorator.js';
import { statsSchema, type Stats } from './stats.schemas.js';
import { StatsService } from './stats.service.js';

@Controller('panel/stats')
@Panel()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  // Sin fechas, los últimos 30 días hasta hoy.
  @Get()
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: statsSchema })
  get(
    @Query('from', { schema: arDayParamSchema }) from?: string,
    @Query('to', { schema: arDayParamSchema }) to?: string,
  ): Promise<Stats> {
    return this.stats.get({ from, to });
  }
}
