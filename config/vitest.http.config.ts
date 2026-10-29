import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Explicit opt-in: this proof binds an ephemeral loopback port to verify real HTTP EOF.
export default defineConfig({
  resolve: {
    alias: { '#contracts': fileURLToPath(new URL('../packages/contracts/src/index.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/*-http.proof.ts'],
    testTimeout: 10_000,
  },
});
