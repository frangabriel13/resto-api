import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditEventInput } from '../audit/audit.service.js';
import { fieldChanges } from '../settings/field-changes.js';
import type {
  CreateMenuCategoryBody,
  CreateMenuItemBody,
  Menu,
  MoveMenuBody,
  UpdateMenuCategoryBody,
  UpdateMenuItemBody,
} from './menu.schemas.js';

export const MAX_MENU_CATEGORIES = 30;
export const MAX_MENU_ITEMS = 300;

// Lo que cambia entre el admin y el panel: con qué cliente se escribe y cómo
// se audita. Quien la arma ya tiene bloqueado el comercio, así los límites y
// las posiciones no se pisan entre dos pedidos a la vez.
export type MenuScope = {
  db: Pick<Prisma.TransactionClient, 'merchant' | 'menuCategory' | 'menuItem'>;
  merchantId: string;
  record: (event: AuditEventInput) => Promise<void>;
};

export type MenuChange = (scope: MenuScope) => Promise<void>;

type Positioned = { id: string; position: number };
type Direction = MoveMenuBody['direction'];

export async function readMenu({ db, merchantId }: MenuScope): Promise<Menu> {
  const { menuLabel } = await db.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    select: { menuLabel: true },
  });
  const categories = await db.menuCategory.findMany({
    where: { merchantId },
    orderBy: { position: 'asc' },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  return {
    label: menuLabel,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      visible: category.visible,
      items: category.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        priceFrom: item.priceFrom,
        visible: item.visible,
      })),
    })),
  };
}

export const setMenuLabel =
  (label: Menu['label']): MenuChange =>
  async ({ db, merchantId, record }) => {
    const { menuLabel } = await db.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { menuLabel: true },
    });
    if (menuLabel === label) return;
    await db.merchant.update({
      where: { id: merchantId },
      data: { menuLabel: label },
    });
    await record({
      action: 'menu.label_updated',
      entityId: merchantId,
      payload: { from: menuLabel, to: label },
    });
  };

export const createMenuCategory =
  (body: CreateMenuCategoryBody): MenuChange =>
  async ({ db, merchantId, record }) => {
    const count = await db.menuCategory.count({ where: { merchantId } });
    assertWithinLimit(count, MAX_MENU_CATEGORIES, 'categories');
    const last = await db.menuCategory.aggregate({
      where: { merchantId },
      _max: { position: true },
    });
    const category = await db.menuCategory.create({
      data: { ...body, merchantId, position: nextPosition(last._max.position) },
    });
    await record({
      action: 'menu_category.created',
      entityId: category.id,
      payload: { ...body },
    });
  };

export const updateMenuCategory =
  (id: string, body: UpdateMenuCategoryBody): MenuChange =>
  async (scope) => {
    const category = await findCategory(scope, id);
    const changes = fieldChanges(category, body);
    if (Object.keys(changes).length === 0) return;
    await scope.db.menuCategory.update({
      where: { id, merchantId: scope.merchantId },
      data: body,
    });
    await scope.record({
      action: 'menu_category.updated',
      entityId: id,
      payload: changes as Prisma.InputJsonObject,
    });
  };

// Se lleva sus ítems (FK en cascada).
export const deleteMenuCategory =
  (id: string): MenuChange =>
  async (scope) => {
    const { db, merchantId } = scope;
    const category = await findCategory(scope, id);
    const items = await db.menuItem.count({
      where: { merchantId, categoryId: id },
    });
    await db.menuCategory.delete({ where: { id, merchantId } });
    await scope.record({
      action: 'menu_category.deleted',
      entityId: id,
      payload: { name: category.name, items },
    });
  };

export const moveMenuCategory =
  (id: string, direction: Direction): MenuChange =>
  async (scope) => {
    const { db, merchantId } = scope;
    const category = await findCategory(scope, id);
    const neighbor = await db.menuCategory.findFirst({
      where: { merchantId, position: positionTowards(category, direction) },
      orderBy: { position: orderTowards(direction) },
    });
    if (!neighbor) return;
    const update = (target: Positioned, position: number) =>
      db.menuCategory.update({
        where: { id: target.id, merchantId },
        data: { position },
      });
    await update(category, neighbor.position);
    await update(neighbor, category.position);
    await scope.record({
      action: 'menu_category.moved',
      entityId: id,
      payload: { direction },
    });
  };

export const createMenuItem =
  (categoryId: string, body: CreateMenuItemBody): MenuChange =>
  async (scope) => {
    const { db, merchantId } = scope;
    await findCategory(scope, categoryId);
    const count = await db.menuItem.count({ where: { merchantId } });
    assertWithinLimit(count, MAX_MENU_ITEMS, 'items');
    const item = await db.menuItem.create({
      data: {
        ...body,
        ...resolvePrice(NO_PRICE, body),
        merchantId,
        categoryId,
        position: await nextItemPosition(scope, categoryId),
      },
    });
    await scope.record({
      action: 'menu_item.created',
      entityId: item.id,
      payload: { ...body, categoryId },
    });
  };

export const updateMenuItem =
  (id: string, body: UpdateMenuItemBody): MenuChange =>
  async (scope) => {
    const { db, merchantId } = scope;
    const item = await findItem(scope, id);
    const data = { ...body, ...resolvePrice(item, body) };
    const changes = fieldChanges(item, data);
    if (Object.keys(changes).length === 0) return;
    const moved = data.categoryId && data.categoryId !== item.categoryId;
    if (moved) await findCategory(scope, data.categoryId!);
    await db.menuItem.update({
      where: { id, merchantId },
      data: {
        ...data,
        // Al cambiar de categoría queda al final de la nueva.
        ...(moved && {
          position: await nextItemPosition(scope, data.categoryId!),
        }),
      },
    });
    await scope.record({
      action: 'menu_item.updated',
      entityId: id,
      payload: changes as Prisma.InputJsonObject,
    });
  };

export const deleteMenuItem =
  (id: string): MenuChange =>
  async (scope) => {
    const item = await findItem(scope, id);
    await scope.db.menuItem.delete({
      where: { id, merchantId: scope.merchantId },
    });
    await scope.record({
      action: 'menu_item.deleted',
      entityId: id,
      payload: { name: item.name, categoryId: item.categoryId },
    });
  };

export const moveMenuItem =
  (id: string, direction: Direction): MenuChange =>
  async (scope) => {
    const { db, merchantId } = scope;
    const item = await findItem(scope, id);
    const neighbor = await db.menuItem.findFirst({
      where: {
        merchantId,
        categoryId: item.categoryId,
        position: positionTowards(item, direction),
      },
      orderBy: { position: orderTowards(direction) },
    });
    if (!neighbor) return;
    const update = (target: Positioned, position: number) =>
      db.menuItem.update({
        where: { id: target.id, merchantId },
        data: { position },
      });
    await update(item, neighbor.position);
    await update(neighbor, item.position);
    await scope.record({
      action: 'menu_item.moved',
      entityId: id,
      payload: { direction },
    });
  };

const NO_PRICE = { price: null, priceFrom: false };

// Sin precio no hay "desde": sacar el precio saca el "desde", y pedirlo sin
// precio es un error.
export function resolvePrice(
  current: { price: number | null; priceFrom: boolean },
  body: { price?: number | null; priceFrom?: boolean },
) {
  const price = body.price === undefined ? current.price : body.price;
  const priceFrom = body.priceFrom ?? (price !== null && current.priceFrom);
  if (priceFrom && price === null) {
    throw new AppException('VALIDATION_ERROR', undefined, {
      issues: [
        { path: 'priceFrom', message: 'El "desde" va junto con un precio.' },
      ],
    });
  }
  return { price, priceFrom };
}

function assertWithinLimit(
  count: number,
  limit: number,
  kind: 'categories' | 'items',
) {
  if (count >= limit) {
    throw new AppException('MENU_LIMIT_REACHED', undefined, { kind, limit });
  }
}

async function findCategory({ db, merchantId }: MenuScope, id: string) {
  const category = await db.menuCategory.findFirst({
    where: { id, merchantId },
  });
  if (!category) throw new AppException('NOT_FOUND');
  return category;
}

async function findItem({ db, merchantId }: MenuScope, id: string) {
  const item = await db.menuItem.findFirst({ where: { id, merchantId } });
  if (!item) throw new AppException('NOT_FOUND');
  return item;
}

async function nextItemPosition(
  { db, merchantId }: MenuScope,
  categoryId: string,
) {
  const last = await db.menuItem.aggregate({
    where: { merchantId, categoryId },
    _max: { position: true },
  });
  return nextPosition(last._max.position);
}

function nextPosition(max: number | null): number {
  return (max ?? 0) + 1;
}

function positionTowards({ position }: Positioned, direction: Direction) {
  return direction === 'up' ? { lt: position } : { gt: position };
}

function orderTowards(direction: Direction) {
  return direction === 'up' ? ('desc' as const) : ('asc' as const);
}
