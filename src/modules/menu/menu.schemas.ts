import { z } from 'zod';
import { MenuLabel } from '../../generated/prisma/client.js';

const nameSchema = z.string().trim().min(1).max(80);
const descriptionSchema = z.string().trim().min(1).max(300);
const priceSchema = z.number().int().min(1).max(99_999_999);

export const menuLabelBodySchema = z
  .strictObject({ label: z.enum(MenuLabel) })
  .meta({ id: 'MenuLabelBody' });

export const createMenuCategoryBodySchema = z
  .strictObject({ name: nameSchema, visible: z.boolean().optional() })
  .meta({ id: 'CreateMenuCategoryBody' });

export const updateMenuCategoryBodySchema = z
  .strictObject({ name: nameSchema, visible: z.boolean() })
  .partial()
  .meta({ id: 'UpdateMenuCategoryBody' });

const itemFields = {
  name: nameSchema,
  description: descriptionSchema.nullable(),
  price: priceSchema.nullable(),
  priceFrom: z.boolean(),
  visible: z.boolean(),
};

export const createMenuItemBodySchema = z
  .strictObject(itemFields)
  .partial()
  .required({ name: true })
  .meta({ id: 'CreateMenuItemBody' });

export const updateMenuItemBodySchema = z
  .strictObject({ ...itemFields, categoryId: z.uuid() })
  .partial()
  .meta({ id: 'UpdateMenuItemBody' });

export const moveMenuBodySchema = z
  .strictObject({ direction: z.enum(['up', 'down']) })
  .meta({ id: 'MoveMenuBody' });

export const menuSchema = z
  .object({
    label: z.enum(MenuLabel),
    categories: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        visible: z.boolean(),
        items: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            description: z.string().nullable(),
            price: z.number().int().nullable(),
            priceFrom: z.boolean(),
            visible: z.boolean(),
          }),
        ),
      }),
    ),
  })
  .meta({ id: 'Menu' });

// Solo lo visible; sin ningún ítem visible, la carta no sale.
export const publicMenuSchema = z
  .object({
    label: z.enum(MenuLabel),
    categories: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        items: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            description: z.string().nullable(),
            price: z.number().int().nullable(),
            priceFrom: z.boolean(),
          }),
        ),
      }),
    ),
  })
  .meta({ id: 'PublicMenu' });

export type MenuLabelBody = z.infer<typeof menuLabelBodySchema>;
export type CreateMenuCategoryBody = z.infer<
  typeof createMenuCategoryBodySchema
>;
export type UpdateMenuCategoryBody = z.infer<
  typeof updateMenuCategoryBodySchema
>;
export type CreateMenuItemBody = z.infer<typeof createMenuItemBodySchema>;
export type UpdateMenuItemBody = z.infer<typeof updateMenuItemBodySchema>;
export type MoveMenuBody = z.infer<typeof moveMenuBodySchema>;
export type Menu = z.infer<typeof menuSchema>;
export type PublicMenu = z.infer<typeof publicMenuSchema>;
