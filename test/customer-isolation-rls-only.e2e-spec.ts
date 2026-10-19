import { describeCustomerIsolation } from './helpers/customer-isolation.js';

// Simula un bug que deja a /me/* sin el filtro por cliente de la extensión:
// lo único que queda es RLS.
const extension = vi.hoisted(() => ({ created: 0 }));

vi.mock(
  './../src/common/customer-scope/customer-scope.extension.js',
  async () => {
    const { Prisma } = await import('./../src/generated/prisma/client.js');
    return {
      customerScope: () => {
        extension.created++;
        return Prisma.defineExtension({ name: 'customer-scope-off' });
      },
    };
  },
);

describeCustomerIsolation('solo RLS, sin la extensión de Prisma');

it('la app usa la extensión vacía', () => {
  expect(extension.created).toBeGreaterThan(0);
});
