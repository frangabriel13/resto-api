import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin/admin-auth.controller.js';
import { AdminAuthService } from './admin/admin-auth.service.js';
import { StaffAuthController } from './staff/staff-auth.controller.js';
import { StaffAuthService } from './staff/staff-auth.service.js';

@Module({
  controllers: [StaffAuthController, AdminAuthController],
  providers: [StaffAuthService, AdminAuthService],
})
export class AuthModule {}
