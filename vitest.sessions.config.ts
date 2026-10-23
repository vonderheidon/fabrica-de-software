import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Explicit opt-in: starts real OMP providers and factory-owned Maestri terminals.
export default defineConfig({
  resolve: { alias: { '#contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/native/session-continuity.proof.ts'], testTimeout: 600_000 },
});
