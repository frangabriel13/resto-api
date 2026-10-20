import { Body, Controller, Get, HttpStatus, Put } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Panel } from '../auth/panel/panel.decorator.js';
import { Roles } from '../auth/panel/tenant.guard.js';
import {
  merchantSettingsSchema,
  settingsViewSchema,
  type MerchantSettings,
  type SettingsView,
} from './settings.schemas.js';
import { SettingsService } from './settings.service.js';

@Controller('panel/settings')
@Panel()
@Roles('OWNER')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: settingsViewSchema })
  get(): Promise<SettingsView> {
    return this.settings.get();
  }

  @Put()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: settingsViewSchema })
  update(
    @Body({ schema: merchantSettingsSchema }) body: MerchantSettings,
  ): Promise<SettingsView> {
    return this.settings.update(body);
  }
}
