import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Carga .env.test en process.env sin pisar lo que ya esté definido. Los
// workers heredan process.env, y @nestjs/config le da prioridad sobre el .env.
loadEnv({ path: '.env.test', quiet: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    setupFiles: ['./test/setup/reset-between-tests.ts'],
    // Todos los archivos comparten la misma base: uno a la vez.
    fileParallelism: false,
  },
});
