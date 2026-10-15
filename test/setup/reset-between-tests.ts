import {
  assertTestDatabaseUrls,
  createMigratorClient,
  resetDatabase,
} from './test-database.js';

// Corre en cada archivo de E2E: todos los tests arrancan con la base vacía.
// Los datos que necesite un test se crean en su propio beforeEach o en el test.
assertTestDatabaseUrls();
const migrator = createMigratorClient();

beforeEach(async () => {
  await resetDatabase(migrator);
});

afterAll(async () => {
  await migrator.$disconnect();
});
