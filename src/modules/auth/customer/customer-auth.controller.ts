import {
  Body,
  Controller,
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
import {
  customerLoginSchema,
  otpRequestedSchema,
  requestOtpBodySchema,
  verifyOtpBodySchema,
  type CustomerLogin,
  type OtpRequested,
  type RequestOtpBody,
  type VerifyOtpBody,
} from './customer-auth.schemas.js';
import { SessionService } from '../sessions/session.service.js';
import { CustomerOtpService } from './customer-otp.service.js';

@Controller('auth/customer')
export class CustomerAuthController {
  constructor(
    private readonly otp: CustomerOtpService,
    private readonly sessions: SessionService,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: otpRequestedSchema })
  request(
    @Body({ schema: requestOtpBodySchema }) body: RequestOtpBody,
  ): Promise<OtpRequested> {
    return this.otp.request(body.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: customerLoginSchema })
  verify(
    @Body({ schema: verifyOtpBodySchema }) body: VerifyOtpBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CustomerLogin> {
    return this.otp.verify(body, req, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.end('customer', req, res);
  }
}
