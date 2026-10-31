import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [ImagesModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
