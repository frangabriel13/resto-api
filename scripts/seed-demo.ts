import { createAdminClient } from './lib/admin-client.js';
import {
  DEMO_EMPLOYEE_EMAIL,
  DEMO_OWNER_EMAIL,
  DEMO_PIECE_CODE,
} from './lib/demo/demo-fixtures.js';
import { seedDemo } from './lib/demo/seed-demo.js';

const staffPassword = process.env.DEMO_STAFF_PASSWORD ?? 'demo1234';
const prisma = createAdminClient();

try {
  const summary = await seedDemo(prisma, { staffPassword });
  console.log(`Demo recreada: ${summary.customers} clientes, ${summary.stamps} sellos, ${summary.redemptions} canje.
  Pieza:    /p/${DEMO_PIECE_CODE}
  Dueño:    ${DEMO_OWNER_EMAIL}
  Empleado: ${DEMO_EMPLOYEE_EMAIL}
  Contraseña de los dos: ${staffPassword}`);
} finally {
  await prisma.$disconnect();
}
