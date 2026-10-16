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
import {
  createStampBodySchema,
  scanBodySchema,
  scanResultSchema,
  stampResultSchema,
  voidStampBodySchema,
  voidStampResultSchema,
  type CreateStampBody,
  type ScanBody,
  type ScanResult,
  type StampResult,
  type VoidStampBody,
  type VoidStampResult,
} from './stamps.schemas.js';
import { StampsService } from './stamps.service.js';

@Controller('panel')
@Panel()
export class StampsController {
  constructor(private readonly stamps: StampsService) {}

  @Post('scans')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: scanResultSchema })
  scan(@Body({ schema: scanBodySchema }) body: ScanBody): Promise<ScanResult> {
    return this.stamps.scan(body.stampToken);
  }

  @Post('stamps')
  @ApiResponse({
    status: HttpStatus.CREATED,
    standardSchema: stampResultSchema,
  })
  create(
    @Body({ schema: createStampBodySchema }) body: CreateStampBody,
  ): Promise<StampResult> {
    return this.stamps.create(body);
  }

  @Post('stamps/:id/void')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: voidStampResultSchema })
  void(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: voidStampBodySchema }) body: VoidStampBody,
  ): Promise<VoidStampResult> {
    return this.stamps.void(id, body.reason);
  }
}
