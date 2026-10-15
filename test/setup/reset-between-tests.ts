import {
  assertTestDatabaseUrls,
  createMigratorClient,
  resetDatabase,
} from './test-database.js';

assertTestDatabaseUrls();
const migrator = createMigratorClient();

beforeEach(async () => {
  await resetDatabase(migrator);
});

afterAll(async () => {
  await migrator.$disconnect();
});
