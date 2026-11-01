import type {
  MenuCategory,
  MenuItem,
  MenuLabel,
} from '../../generated/prisma/client.js';
import type { PublicMenu } from './menu.schemas.js';

// Para el `include` de la pieza pública: lo oculto ni se lee.
export const publicMenuInclude = {
  where: { visible: true },
  orderBy: { position: 'asc' },
  include: {
    items: { where: { visible: true }, orderBy: { position: 'asc' } },
  },
} as const;

type VisibleCategory = MenuCategory & { items: MenuItem[] };

// Una categoría sin ítems visibles no se muestra; sin ninguna, no hay carta.
export function toPublicMenu(
  label: MenuLabel,
  categories: VisibleCategory[],
): PublicMenu | null {
  const withItems = categories.filter((category) => category.items.length > 0);
  if (withItems.length === 0) return null;
  return {
    label,
    categories: withItems.map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        priceFrom: item.priceFrom,
      })),
    })),
  };
}
