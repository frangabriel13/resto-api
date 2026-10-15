import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
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
  constructor(private readonly me: MeService) {}

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
}
