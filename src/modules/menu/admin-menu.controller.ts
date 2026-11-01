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
import { AdminOnly } from '../auth/admin/admin-only.decorator.js';
import { Auth } from '../auth/sessions/auth.decorator.js';
import type { AuthSession } from '../auth/sessions/session-kinds.js';
import { AdminMenuService } from './admin-menu.service.js';
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

const uuid = { schema: z.uuid() };

@Controller('admin/merchants/:merchantId/menu')
@AdminOnly()
export class AdminMenuController {
  constructor(private readonly menu: AdminMenuService) {}

  @Get()
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  get(@Param('merchantId', uuid) merchantId: string): Promise<Menu> {
    return this.menu.get(merchantId);
  }

  @Put('label')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  setLabel(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Body({ schema: menuLabelBodySchema }) body: MenuLabelBody,
  ): Promise<Menu> {
    return this.menu.apply(auth.ownerId, merchantId, setMenuLabel(body.label));
  }

  @Post('categories')
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: menuSchema })
  createCategory(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Body({ schema: createMenuCategoryBodySchema })
    body: CreateMenuCategoryBody,
  ): Promise<Menu> {
    return this.menu.apply(auth.ownerId, merchantId, createMenuCategory(body));
  }

  @Patch('categories/:categoryId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  updateCategory(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('categoryId', uuid) categoryId: string,
    @Body({ schema: updateMenuCategoryBodySchema })
    body: UpdateMenuCategoryBody,
  ): Promise<Menu> {
    return this.menu.apply(
      auth.ownerId,
      merchantId,
      updateMenuCategory(categoryId, body),
    );
  }

  @Delete('categories/:categoryId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  deleteCategory(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('categoryId', uuid) categoryId: string,
  ): Promise<Menu> {
    return this.menu.apply(
      auth.ownerId,
      merchantId,
      deleteMenuCategory(categoryId),
    );
  }

  @Post('categories/:categoryId/move')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  moveCategory(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('categoryId', uuid) categoryId: string,
    @Body({ schema: moveMenuBodySchema }) body: MoveMenuBody,
  ): Promise<Menu> {
    return this.menu.apply(
      auth.ownerId,
      merchantId,
      moveMenuCategory(categoryId, body.direction),
    );
  }

  @Post('categories/:categoryId/items')
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: menuSchema })
  createItem(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('categoryId', uuid) categoryId: string,
    @Body({ schema: createMenuItemBodySchema }) body: CreateMenuItemBody,
  ): Promise<Menu> {
    return this.menu.apply(
      auth.ownerId,
      merchantId,
      createMenuItem(categoryId, body),
    );
  }

  @Patch('items/:itemId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  updateItem(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('itemId', uuid) itemId: string,
    @Body({ schema: updateMenuItemBodySchema }) body: UpdateMenuItemBody,
  ): Promise<Menu> {
    return this.menu.apply(
      auth.ownerId,
      merchantId,
      updateMenuItem(itemId, body),
    );
  }

  @Delete('items/:itemId')
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  deleteItem(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('itemId', uuid) itemId: string,
  ): Promise<Menu> {
    return this.menu.apply(auth.ownerId, merchantId, deleteMenuItem(itemId));
  }

  @Post('items/:itemId/move')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, standardSchema: menuSchema })
  moveItem(
    @Auth() auth: AuthSession,
    @Param('merchantId', uuid) merchantId: string,
    @Param('itemId', uuid) itemId: string,
    @Body({ schema: moveMenuBodySchema }) body: MoveMenuBody,
  ): Promise<Menu> {
    return this.menu.apply(
      auth.ownerId,
      merchantId,
      moveMenuItem(itemId, body.direction),
    );
  }
}
