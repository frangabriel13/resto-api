import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

type RoleInfo = { role: string; superuser: boolean; bypassRls: boolean };

const roleQuery = (client: PrismaService | PrismaAdminService) =>
  client.$queryRaw<RoleInfo[]>`
    SELECT rolname AS role, rolsuper AS superuser, rolbypassrls AS "bypassRls"
    FROM pg_roles WHERE rolname = current_user`;

// RLS depende de que cada cliente use el rol correcto: si el de runtime
// pudiera saltearse RLS, las políticas no protegerían nada.
describe('Clientes de Prisma (e2e)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('el cliente de runtime usa resto_app, sujeto a RLS', async () => {
    const [info] = await roleQuery(moduleRef.get(PrismaService));
    expect(info).toEqual({
      role: 'resto_app',
      superuser: false,
      bypassRls: false,
    });
  });

  it('el cliente admin usa resto_app_admin, con BYPASSRLS', async () => {
    const [info] = await roleQuery(moduleRef.get(PrismaAdminService));
    expect(info).toEqual({
      role: 'resto_app_admin',
      superuser: false,
      bypassRls: true,
    });
  });
});
