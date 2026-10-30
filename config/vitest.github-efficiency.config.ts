import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Explicit opt-in permits fixed, read-only Git blob reads for the in-memory reference.
export default defineConfig({
  resolve: { alias: { '#contracts': fileURLToPath(new URL('../packages/contracts/src/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/native/github-efficiency.proof.ts'], testTimeout: 600_000,
    fileParallelism: false },
});
