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
  Put,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { Panel } from '../auth/panel/panel.decorator.js';
import { Roles } from '../auth/panel/tenant.guard.js';
import {
  createMenuCategory,
  createMenuItem,
  deleteMenuCategory,
  deleteMenuItem,
  moveMenuCategory,
  moveMenuItem,
  setMenuLabel,
  updateMenuCategory,
  updateMenuItem,
} from './menu-editor.js';
import {
  createMenuCategoryBodySchema,
  createMenuItemBodySchema,
  menuLabelBodySchema,
  menuSchema,
  moveMenuBodySchema,
  updateMenuCategoryBodySchema,
  updateMenuItemBodySchema,
  type CreateMenuCategoryBody,
  type CreateMenuItemBody,
  type Menu,
  type MenuLabelBody,
  type MoveMenuBody,
  type UpdateMenuCategoryBody,
  type UpdateMenuItemBody,
} from './menu.schemas.js';
import { PanelMenuService } from './panel-menu.service.js';

const uuid = { schema: z.uuid() };

@Controller('panel/menu')
@Panel()
@Roles('OWNER')
export class PanelMenuController {
  constructor(private readonly menu: PanelMenuService) {}

  @Get()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  get(): Promise<Menu> {
    return this.menu.get();
  }

  @Put('label')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  setLabel(
    @Body({ schema: menuLabelBodySchema }) body: MenuLabelBody,
  ): Promise<Menu> {
    return this.menu.apply(setMenuLabel(body.label));
  }

  @Post('categories')
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: menuSchema })
  createCategory(
    @Body({ schema: createMenuCategoryBodySchema })
    body: CreateMenuCategoryBody,
  ): Promise<Menu> {
    return this.menu.apply(createMenuCategory(body));
  }

  @Patch('categories/:categoryId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  updateCategory(
    @Param('categoryId', uuid) categoryId: string,
    @Body({ schema: updateMenuCategoryBodySchema })
    body: UpdateMenuCategoryBody,
  ): Promise<Menu> {
    return this.menu.apply(updateMenuCategory(categoryId, body));
  }

  @Delete('categories/:categoryId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  deleteCategory(@Param('categoryId', uuid) categoryId: string): Promise<Menu> {
    return this.menu.apply(deleteMenuCategory(categoryId));
  }

  @Post('categories/:categoryId/move')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  moveCategory(
    @Param('categoryId', uuid) categoryId: string,
    @Body({ schema: moveMenuBodySchema }) body: MoveMenuBody,
  ): Promise<Menu> {
    return this.menu.apply(moveMenuCategory(categoryId, body.direction));
  }

  @Post('categories/:categoryId/items')
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: menuSchema })
  createItem(
    @Param('categoryId', uuid) categoryId: string,
    @Body({ schema: createMenuItemBodySchema }) body: CreateMenuItemBody,
  ): Promise<Menu> {
    return this.menu.apply(createMenuItem(categoryId, body));
  }

  @Patch('items/:itemId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  updateItem(
    @Param('itemId', uuid) itemId: string,
    @Body({ schema: updateMenuItemBodySchema }) body: UpdateMenuItemBody,
  ): Promise<Menu> {
    return this.menu.apply(updateMenuItem(itemId, body));
  }

  @Delete('items/:itemId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  deleteItem(@Param('itemId', uuid) itemId: string): Promise<Menu> {
    return this.menu.apply(deleteMenuItem(itemId));
  }

  @Post('items/:itemId/move')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  moveItem(
    @Param('itemId', uuid) itemId: string,
    @Body({ schema: moveMenuBodySchema }) body: MoveMenuBody,
  ): Promise<Menu> {
    return this.menu.apply(moveMenuItem(itemId, body.direction));
  }
}
