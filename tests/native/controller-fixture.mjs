import { startController } from '../../dist/apps/controller/src/main.js';
import { createExecution } from '../../dist/apps/controller/src/modules/execution/index.js';
import { StorageError } from '../../dist/apps/controller/src/modules/storage/index.js';

// Explicit test-only composition. No CLI/env flag in production can select this factory.
export const controlledDependencies = {
  executionFactory: options => ({ ...createExecution(options),
    preflight: async () => ({ ready: true, code: null, ompVersion: '18.11.1' }),
  }),
};
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  try { await startController({}, { ...controlledDependencies, dataDirectory: process.argv[2] }); }
  catch (error) {
    console.error(JSON.stringify({ code: error instanceof StorageError ? error.code : 'FIXTURE_STARTUP_FAILED', fixture: true }));
    process.exitCode = 1;
  }
}
