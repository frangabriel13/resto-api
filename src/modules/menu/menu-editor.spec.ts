import { AppException } from '../../common/errors/app.exception.js';
import { resolvePrice } from './menu-editor.js';
import { toPublicMenu } from './public-menu.js';

describe('resolvePrice', () => {
  const priced = { price: 1000, priceFrom: true };
  const unpriced = { price: null, priceFrom: false };

  it('sin cambios conserva lo que había', () => {
    expect(resolvePrice(priced, {})).toEqual(priced);
  });

  it('cambiar el precio conserva el "desde"', () => {
    expect(resolvePrice(priced, { price: 2000 })).toEqual({
      price: 2000,
      priceFrom: true,
    });
  });

  it('sacar el precio saca el "desde"', () => {
    expect(resolvePrice(priced, { price: null })).toEqual(unpriced);
  });

  it('el "desde" sin precio es un error', () => {
    expect(() => resolvePrice(unpriced, { priceFrom: true })).toThrow(
      AppException,
    );
    expect(() =>
      resolvePrice(priced, { price: null, priceFrom: true }),
    ).toThrow(AppException);
  });
});

describe('toPublicMenu', () => {
  const dates = { createdAt: new Date(), updatedAt: new Date() };
  const category = (id: string, itemIds: string[]) => ({
    ...dates,
    id,
    merchantId: 'm',
    name: `Categoría ${id}`,
    visible: true,
    position: 1,
    items: itemIds.map((itemId) => ({
      ...dates,
      id: itemId,
      merchantId: 'm',
      categoryId: id,
      name: `Ítem ${itemId}`,
      description: null,
      price: 1500,
      priceFrom: false,
      visible: true,
      position: 1,
    })),
  });

  it('sin ítems visibles no hay carta', () => {
    expect(toPublicMenu('CARTA', [])).toBeNull();
    expect(toPublicMenu('CARTA', [category('a', [])])).toBeNull();
  });

  it('saca las categorías vacías y los datos internos', () => {
    expect(
      toPublicMenu('PRICE_LIST', [category('a', []), category('b', ['1'])]),
    ).toEqual({
      label: 'PRICE_LIST',
      categories: [
        {
          id: 'b',
          name: 'Categoría b',
          items: [
            {
              id: '1',
              name: 'Ítem 1',
              description: null,
              price: 1500,
              priceFrom: false,
            },
          ],
        },
      ],
    });
  });
});
