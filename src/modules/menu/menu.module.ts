import { Module } from '@nestjs/common';
import { AdminMenuController } from './admin-menu.controller.js';
import { AdminMenuService } from './admin-menu.service.js';
import { PanelMenuController } from './panel-menu.controller.js';
import { PanelMenuService } from './panel-menu.service.js';

@Module({
  controllers: [AdminMenuController, PanelMenuController],
  providers: [AdminMenuService, PanelMenuService],
})
export class MenuModule {}
