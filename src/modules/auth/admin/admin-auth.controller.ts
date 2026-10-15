import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { loginBodySchema, type LoginBody } from '../login.schemas.js';
import { Auth } from '../sessions/auth.decorator.js';
import type { AuthSession } from '../sessions/session-kinds.js';
import { SessionService } from '../sessions/session.service.js';
import { adminAccountSchema, type AdminAccount } from './admin-auth.schemas.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminOnly } from './admin-only.decorator.js';

@Controller('auth/admin')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: adminAccountSchema })
  login(
    @Body({ schema: loginBodySchema }) body: LoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminAccount> {
    return this.adminAuth.login(body.email, body.password, req, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.end('admin', req, res);
  }

  @Get('me')
  @AdminOnly()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: adminAccountSchema })
  me(@Auth() auth: AuthSession): Promise<AdminAccount> {
    return this.adminAuth.getAccount(auth.ownerId);
  }
}
