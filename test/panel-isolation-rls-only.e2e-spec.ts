import { describePanelIsolation } from './helpers/panel-isolation.js';

// Simula un bug que deja al panel sin el filtro por comercio de la extensión:
// lo único que queda es RLS.
const extension = vi.hoisted(() => ({ created: 0 }));

vi.mock('./../src/common/tenant/tenant-scope.extension.js', async () => {
  const { Prisma } = await import('./../src/generated/prisma/client.js');
  return {
    tenantScope: () => {
      extension.created++;
      return Prisma.defineExtension({ name: 'tenant-scope-off' });
    },
  };
});

describePanelIsolation('solo RLS, sin la extensión de Prisma');

it('la app usa la extensión vacía', () => {
  expect(extension.created).toBeGreaterThan(0);
});
