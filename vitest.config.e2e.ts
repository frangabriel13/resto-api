import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// @nestjs/config le da prioridad a process.env sobre el .env.
loadEnv({ path: '.env.test', quiet: true });

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    setupFiles: ['./test/setup/reset-between-tests.ts'],
    // Comparten la base.
    fileParallelism: false,
  },
});
