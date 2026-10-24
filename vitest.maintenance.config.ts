import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Explicit opt-in: local Node processes and Git against disposable, exclusive fixtures.
// Run via test:maintenance-native (builds the controller consumed by the child proof).
// The standard suite keeps its process/network prohibition and does not include .proof.ts files.
export default defineConfig({
  resolve: { alias: { '#contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/native/maintenance.proof.ts', 'tests/native/persistence-recovery.proof.ts', 'tests/native/delivery-target.proof.ts'], testTimeout: 20_000 },
});
