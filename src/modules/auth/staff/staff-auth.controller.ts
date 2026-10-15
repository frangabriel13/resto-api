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
import {
  changeStaffPasswordBodySchema,
  selectMerchantBodySchema,
  staffAccountSchema,
  type ChangeStaffPasswordBody,
  type SelectMerchantBody,
  type StaffAccount,
} from './staff-auth.schemas.js';
import { StaffAuthService } from './staff-auth.service.js';
import { AllowPendingPasswordChange, StaffGuard } from './staff.guard.js';

@Controller('auth/staff')
export class StaffAuthController {
  constructor(
    private readonly staffAuth: StaffAuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: staffAccountSchema })
  login(
    @Body({ schema: loginBodySchema }) body: LoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StaffAccount> {
    return this.staffAuth.login(body.email, body.password, req, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.end('staff', req, res);
  }

  @Get('me')
  @UseGuards(StaffGuard)
  @AllowPendingPasswordChange()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: staffAccountSchema })
  me(@Auth() auth: AuthSession): Promise<StaffAccount> {
    return this.staffAuth.getAccount(auth);
  }

  @Post('select-merchant')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffGuard)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: staffAccountSchema })
  selectMerchant(
    @Auth() auth: AuthSession,
    @Body({ schema: selectMerchantBodySchema }) body: SelectMerchantBody,
  ): Promise<StaffAccount> {
    return this.staffAuth.selectMerchant(auth, body.merchantId);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(StaffGuard)
  @AllowPendingPasswordChange()
  async changePassword(
    @Auth() auth: AuthSession,
    @Body({ schema: changeStaffPasswordBodySchema })
    body: ChangeStaffPasswordBody,
  ): Promise<void> {
    await this.staffAuth.changePassword(
      auth.ownerId,
      body.currentPassword,
      body.newPassword,
    );
    await this.sessions.endOthers(auth);
  }
}
