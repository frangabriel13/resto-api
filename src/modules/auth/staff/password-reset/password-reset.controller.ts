import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  confirmPasswordResetBodySchema,
  requestPasswordResetBodySchema,
  type ConfirmPasswordResetBody,
  type RequestPasswordResetBody,
} from './password-reset.schemas.js';
import { PasswordResetService } from './password-reset.service.js';

@Controller('auth/staff/password-reset')
@UseGuards(ThrottlerGuard)
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Post('request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(
    @Body({ schema: requestPasswordResetBodySchema })
    body: RequestPasswordResetBody,
  ): Promise<void> {
    return this.passwordReset.request(body.email);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(
    @Body({ schema: confirmPasswordResetBodySchema })
    body: ConfirmPasswordResetBody,
  ): Promise<void> {
    return this.passwordReset.confirm(body.token, body.newPassword);
  }
}
