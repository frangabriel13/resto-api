import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { Panel } from '../auth/panel/panel.decorator.js';
import {
  panelMembershipSchema,
  type PanelMembership,
} from '../memberships/panel-membership.schemas.js';
import {
  customerDetailSchema,
  customerSearchTermSchema,
  type CustomerDetail,
} from './panel-customers.schemas.js';
import { PanelCustomersService } from './panel-customers.service.js';

@Controller('panel/customers')
@Panel()
export class PanelCustomersController {
  constructor(private readonly customers: PanelCustomersService) {}

  @Get()
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: z.array(panelMembershipSchema),
  })
  search(
    @Query('query', { schema: customerSearchTermSchema }) query: string,
  ): Promise<PanelMembership[]> {
    return this.customers.search(query);
  }

  @Get(':membershipId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: customerDetailSchema })
  detail(
    @Param('membershipId', { schema: z.uuid() }) membershipId: string,
  ): Promise<CustomerDetail> {
    return this.customers.detail(membershipId);
  }
}
