import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';

const healthSchema = z
  .object({ status: z.literal('ok') })
  .meta({ id: 'Health' });

// Para el healthcheck del contenedor: sin base, la API no sirve.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: healthSchema })
  async check(): Promise<z.infer<typeof healthSchema>> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
