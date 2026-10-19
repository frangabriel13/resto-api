import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import { arDayParamSchema } from '../../common/schemas.js';
import { Panel } from '../auth/panel/panel.decorator.js';
import {
  activityCursorSchema,
  activityPageSchema,
  type ActivityPage,
} from './activity.schemas.js';
import { ActivityService } from './activity.service.js';

@Controller('panel/activity')
@Panel()
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  // Días en hora de Buenos Aires, inclusive. Sin fechas, hoy.
  @Get()
  // Swagger no ve el `.optional()` de los schemas de parámetros.
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: activityPageSchema })
  list(
    @Query('from', { schema: arDayParamSchema }) from?: string,
    @Query('to', { schema: arDayParamSchema }) to?: string,
    @Query('cursor', { schema: activityCursorSchema }) cursor?: string,
  ): Promise<ActivityPage> {
    return this.activity.list({ from, to, cursor });
  }
}
