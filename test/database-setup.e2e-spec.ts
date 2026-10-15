import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createMigratorClient } from './setup/test-database.js';

// Verifica el setup de los E2E con una tabla temporal creada por el migrador,
// como lo hará una migración real.
describe('Base de test (e2e)', () => {
  const migrator = createMigratorClient();
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    await migrator.$executeRawUnsafe(
      'CREATE TABLE e2e_setup_check (id serial PRIMARY KEY, note text NOT NULL)',
    );
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await migrator.$executeRawUnsafe('DROP TABLE e2e_setup_check');
    await migrator.$disconnect();
  });

  it('la API usa la base resto_club_test', async () => {
    const [row] = await prisma.$queryRaw<{ db: string }[]>`
      SELECT current_database() AS db`;
    expect(row?.db).toBe('resto_club_test');
  });

  // Los dos tests que siguen van juntos y en este orden: el primero deja una
  // fila y el segundo comprueba que la limpieza entre tests la borró.
  it('resto_app puede escribir en las tablas que crea el migrador', async () => {
    await prisma.$executeRaw`INSERT INTO e2e_setup_check (note) VALUES ('x')`;
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM e2e_setup_check`;
    expect(row?.count).toBe(1);
  });

  it('cada test arranca con las tablas vacías y las secuencias reiniciadas', async () => {
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM e2e_setup_check`;
    expect(row?.count).toBe(0);
    const [inserted] = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO e2e_setup_check (note) VALUES ('y') RETURNING id`;
    expect(inserted?.id).toBe(1);
  });
});
