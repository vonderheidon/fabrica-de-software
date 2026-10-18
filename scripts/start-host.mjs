import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startController } from '../dist/apps/controller/src/main.js';
import { createWindowsNativeSelection } from '../dist/apps/controller/src/native-selection/windows.js';
import { ConfigurationError } from '../dist/apps/controller/src/config.js';
import { StorageError, OperationError } from '../dist/apps/controller/src/modules/storage/index.js';
import { ExecutionError } from '../dist/apps/controller/src/modules/execution/index.js';

/** Explicit operator composition; GH discovery happens later inside the controller.
 * Storage is always <installation>/var/factory; inherited Maestri context identifies execution.
 * GitHub host access is separate from an executable path; neither declaration elevates the
 * process or proves keyring access. HTTP requests cannot create either capability.
 * @param {string[]} args
 */
export function hostContext(args) {
  if (process.platform !== 'win32' || args.length !== 4 || args.some(value => !isAbsolute(value) || !/\.exe$/i.test(value) || /[\x00-\x1f]/.test(value))) {
    throw new Error('HOST_EXECUTABLES_REQUIRED');
  }
  const git = args[0]; const maestri = args[1]; const omp = args[2]; const powershell = args[3];
  if (!git || !maestri || !omp || !powershell) throw new Error('HOST_EXECUTABLES_REQUIRED');
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const selection = createWindowsNativeSelection(resolve(powershell), cwd);
  return {
    git: { kind: /** @type {const} */ ('windows_keyring'), executable: resolve(git), cwd },
    githubAccess: { kind: /** @type {const} */ ('windows_keyring'), cwd },
    execution: { maestriExecutable: resolve(maestri), ompExecutable: resolve(omp), powershellExecutable: resolve(powershell), inheritedEnvironment: process.env },
    ...selection,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await startController(hostContext(process.argv.slice(2)));
  } catch (error) {
    // Native startup logs never include argv, inherited environment or raw errors.
    const code = error instanceof ConfigurationError || error instanceof StorageError || error instanceof OperationError || error instanceof ExecutionError ? error.code : 'HOST_STARTUP_FAILED';
    console.error(JSON.stringify({ level: 'error', code, message: 'Start inside an authorized Maestri anchor with four absolute EXE paths: Git, Maestri, OMP, PowerShell. GitHub CLI is detected in the application. Check configuration, lock, migrations and native context.' }));
    process.exitCode = 1;
  }
}
