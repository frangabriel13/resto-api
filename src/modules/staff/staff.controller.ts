import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { Panel } from '../auth/panel/panel.decorator.js';
import { Roles } from '../auth/panel/tenant.guard.js';
import {
  createdStaffSchema,
  createStaffBodySchema,
  passwordResetSchema,
  staffMemberSchema,
  updateStaffBodySchema,
  type CreatedStaff,
  type CreateStaffBody,
  type PasswordReset,
  type StaffMember,
} from './staff.schemas.js';
import { StaffService } from './staff.service.js';

@Controller('panel/staff')
@Panel()
@Roles('OWNER')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: z.array(staffMemberSchema),
  })
  list(): Promise<StaffMember[]> {
    return this.staff.list();
  }

  @Post()
  @ApiResponse({
    status: HttpStatus.CREATED,
    standardSchema: createdStaffSchema,
  })
  create(
    @Body({ schema: createStaffBodySchema }) body: CreateStaffBody,
  ): Promise<CreatedStaff> {
    return this.staff.create(body);
  }

  @Patch(':staffUserId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: staffMemberSchema })
  update(
    @Param('staffUserId', { schema: z.uuid() }) staffUserId: string,
    @Body({ schema: updateStaffBodySchema }) body: { active: boolean },
  ): Promise<StaffMember> {
    return this.staff.setActive(staffUserId, body.active);
  }

  @Post(':staffUserId/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: passwordResetSchema })
  resetPassword(
    @Param('staffUserId', { schema: z.uuid() }) staffUserId: string,
  ): Promise<PasswordReset> {
    return this.staff.resetPassword(staffUserId);
  }
}
