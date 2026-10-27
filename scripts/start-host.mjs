import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startController } from '../dist/apps/controller/src/main.js';
import { createWindowsNativeSelection } from '../dist/apps/controller/src/native-selection/windows.js';
import { ConfigurationError } from '../dist/apps/controller/src/config.js';
import { StorageError, OperationError } from '../dist/apps/controller/src/modules/storage/index.js';
import { ExecutionError } from '../dist/apps/controller/src/modules/execution/index.js';

/** Start with optional legacy executable overrides; normal discovery runs inside the controller.
 * Storage is always <installation>/var/factory. Paths are preferences and never prove host access.
 * @param {string[]} args
 */
export function hostContext(args = []) {
  if (process.platform !== 'win32' || (args.length !== 0 && args.length !== 4) || args.some(value => !isAbsolute(value) || !/\.exe$/i.test(value) || /[\x00-\x1f]/.test(value))) {
    throw new Error('HOST_ARGUMENTS_INVALID');
  }
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const selection = createWindowsNativeSelection(cwd);
  const context = { discoverTools: true, githubAccess: { kind: /** @type {const} */ ('windows_keyring'), cwd }, scaffoldAuthorization: { kind: /** @type {const} */ ('confirmed_plan') }, ...selection };
  if (args.length === 0) return context;
  const git = args[0]; const maestri = args[1]; const omp = args[2]; const powershell = args[3];
  if (!git || !maestri || !omp || !powershell) return context;
  return {
    ...context,
    git: { kind: /** @type {const} */ ('windows_keyring'), executable: resolve(git), cwd },
    execution: { maestriExecutable: resolve(maestri), ompExecutable: resolve(omp), powershellExecutable: resolve(powershell), inheritedEnvironment: process.env },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await startController(hostContext(process.argv.slice(2)));
  } catch (error) {
    // Native startup logs never include argv, inherited environment or raw errors.
    const code = error instanceof ConfigurationError || error instanceof StorageError || error instanceof OperationError || error instanceof ExecutionError ? error.code : 'HOST_STARTUP_FAILED';
    console.error(JSON.stringify({ level: 'error', code, message: 'The local controller could not start. Check installation, configuration, storage, lock and available native capabilities.' }));
    process.exitCode = 1;
  }
}
