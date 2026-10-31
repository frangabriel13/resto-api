import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiResponse } from '@nestjs/swagger';
import { Panel } from '../auth/panel/panel.decorator.js';
import { Roles } from '../auth/panel/tenant.guard.js';
import {
  settingsViewSchema,
  updateSettingsBodySchema,
  type SettingsView,
  type UpdateSettingsBody,
} from './settings.schemas.js';
import { ImageUploadInterceptor } from '../images/image-upload.interceptor.js';
import { IMAGE_FILE_BODY } from '../images/image-upload.openapi.js';
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
    @Body({ schema: updateSettingsBodySchema }) body: UpdateSettingsBody,
  ): Promise<SettingsView> {
    return this.settings.update(body);
  }

  // El logo no: lo maneja FullSync desde el admin.
  @Put('cover')
  @UseInterceptors(ImageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMAGE_FILE_BODY)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: settingsViewSchema })
  uploadCover(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SettingsView> {
    return this.settings.replaceCover(file.buffer);
  }

  @Delete('cover')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: settingsViewSchema })
  removeCover(): Promise<SettingsView> {
    return this.settings.replaceCover(null);
  }
}
