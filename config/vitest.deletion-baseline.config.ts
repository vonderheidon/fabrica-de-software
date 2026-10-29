import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '#contracts':fileURLToPath(new URL('../packages/contracts/src/index.ts',import.meta.url)) } },
  test: { environment:'node',include:['tests/native/deletion-baseline.proof.ts'],testTimeout:3_600_000,fileParallelism:false },
});
