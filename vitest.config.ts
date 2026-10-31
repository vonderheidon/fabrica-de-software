import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '#contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['apps/controller/src/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'packages/contracts/src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10_000,
    maxWorkers: 8,
  },
});
