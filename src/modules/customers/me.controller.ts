import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  Res,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SessionService } from '../auth/sessions/session.service.js';
import { CustomerRoute } from '../auth/customer/customer-route.decorator.js';
import {
  meSchema,
  updateMeBodySchema,
  type MeResponse,
  type UpdateMeBody,
} from './me.schemas.js';
import { MeService } from './me.service.js';

@Controller('me')
@CustomerRoute()
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: meSchema })
  get(): Promise<MeResponse> {
    return this.me.get();
  }

  @Patch()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: meSchema })
  update(
    @Body({ schema: updateMeBodySchema }) body: UpdateMeBody,
  ): Promise<MeResponse> {
    return this.me.updateName(body.name);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.me.deleteAccount();
    await this.sessions.end('customer', req, res);
  }
}
