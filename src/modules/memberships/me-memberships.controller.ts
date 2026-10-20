import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { CustomerRoute } from '../auth/customer/customer-route.decorator.js';
import {
  joinClubBodySchema,
  joinClubResultSchema,
  membershipSummarySchema,
  stampTokenSchema,
  updateConsentBodySchema,
  type JoinClubBody,
  type JoinClubResult,
  type MembershipSummary,
  type StampTokenResponse,
  type UpdateConsentBody,
} from './me-memberships.schemas.js';
import { MeMembershipsService } from './me-memberships.service.js';
import {
  membershipCardSchema,
  type MembershipCard,
} from './membership-card.schemas.js';

@Controller('me/memberships')
@CustomerRoute()
export class MeMembershipsController {
  constructor(private readonly memberships: MeMembershipsService) {}

  @Get()
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: z.array(membershipSummarySchema),
  })
  list(): Promise<MembershipSummary[]> {
    return this.memberships.list();
  }

  @Get(':id')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: membershipCardSchema })
  getCard(
    @Param('id', { schema: z.uuid() }) id: string,
  ): Promise<MembershipCard> {
    return this.memberships.getCard(id);
  }

  @Get(':id/stamp-token')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: stampTokenSchema })
  stampToken(
    @Param('id', { schema: z.uuid() }) id: string,
  ): Promise<StampTokenResponse> {
    return this.memberships.issueStampToken(id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: joinClubResultSchema })
  join(
    @Body({ schema: joinClubBodySchema }) body: JoinClubBody,
  ): Promise<JoinClubResult> {
    return this.memberships.join(body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@Param('id', { schema: z.uuid() }) id: string): Promise<void> {
    return this.memberships.leave(id);
  }

  @Patch(':id/consent')
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: membershipSummarySchema,
  })
  updateConsent(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: updateConsentBodySchema }) body: UpdateConsentBody,
  ): Promise<MembershipSummary> {
    return this.memberships.updateConsent(id, body.marketingConsent);
  }
}
