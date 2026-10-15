import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly } from '../../auth/admin/admin-only.decorator.js';
import { Auth } from '../../auth/sessions/auth.decorator.js';
import type { AuthSession } from '../../auth/sessions/session-kinds.js';
import {
  createdOwnerSchema,
  createOwnerBodySchema,
  type CreatedOwner,
  type CreateOwnerBody,
} from './admin-owners.schemas.js';
import { AdminOwnersService } from './admin-owners.service.js';

@Controller('admin/merchants/:merchantId/owner')
@AdminOnly()
export class AdminOwnersController {
  constructor(private readonly owners: AdminOwnersService) {}

  @Post()
  @ApiResponse({
    status: HttpStatus.CREATED,
    standardSchema: createdOwnerSchema,
  })
  create(
    @Auth() auth: AuthSession,
    @Param('merchantId', { schema: z.uuid() }) merchantId: string,
    @Body({ schema: createOwnerBodySchema }) body: CreateOwnerBody,
  ): Promise<CreatedOwner> {
    return this.owners.create(auth.ownerId, merchantId, body);
  }
}
