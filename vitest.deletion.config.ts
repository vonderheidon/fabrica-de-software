import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Native proof: PowerShell/Win32, with disposable SQLite and filesystem fixtures.
// No providers or Git/GitHub effects.
export default defineConfig({
  resolve: { alias: { '#contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/native/project-deletion.proof.ts', 'tests/native/project-deletion.integration.proof.ts'], testTimeout: 120_000 },
});
