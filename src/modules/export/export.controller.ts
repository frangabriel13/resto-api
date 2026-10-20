import { Controller, Get, HttpStatus, StreamableFile } from '@nestjs/common';
import { ApiProduces, ApiResponse } from '@nestjs/swagger';
import { Panel } from '../auth/panel/panel.decorator.js';
import { Roles } from '../auth/panel/tenant.guard.js';
import { ExportService } from './export.service.js';

@Controller('panel/export')
@Panel()
@Roles('OWNER')
export class ExportController {
  constructor(private readonly exporter: ExportService) {}

  // Con el club finalizado también: el dueño puede llevarse sus datos.
  @Get()
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, schema: { type: 'string' } })
  async customers(): Promise<StreamableFile> {
    const { filename, csv } = await this.exporter.customers();
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
