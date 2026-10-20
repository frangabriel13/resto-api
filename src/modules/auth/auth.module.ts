import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin/admin-auth.controller.js';
import { AdminAuthService } from './admin/admin-auth.service.js';
import { CustomerAuthController } from './customer/customer-auth.controller.js';
import { CustomerOtpService } from './customer/customer-otp.service.js';
import { ConsoleOtpSender, OTP_SENDER } from './customer/otp-sender.js';
import { PasswordResetController } from './staff/password-reset/password-reset.controller.js';
import { PasswordResetService } from './staff/password-reset/password-reset.service.js';
import { StaffAuthController } from './staff/staff-auth.controller.js';
import { StaffAuthService } from './staff/staff-auth.service.js';

@Module({
  controllers: [
    StaffAuthController,
    PasswordResetController,
    AdminAuthController,
    CustomerAuthController,
  ],
  providers: [
    StaffAuthService,
    PasswordResetService,
    AdminAuthService,
    CustomerOtpService,
    { provide: OTP_SENDER, useClass: ConsoleOtpSender },
  ],
})
export class AuthModule {}
