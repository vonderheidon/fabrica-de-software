import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startController } from '../dist/apps/controller/src/main.js';
import { ConfigurationError } from '../dist/apps/controller/src/config.js';
import { StorageError, OperationError } from '../dist/apps/controller/src/modules/storage/index.js';
import { ExecutionError } from '../dist/apps/controller/src/modules/execution/index.js';

/** Explicit operator composition, never PATH discovery or an HTTP/environment grant.
 * This declaration does not elevate the process or prove Windows keyring access.
 * @param {string[]} args
 */
export function hostContext(args) {
  if (process.platform !== 'win32' || args.length !== 5 || args.some(value => !isAbsolute(value) || !/\.exe$/i.test(value) || /[\x00-\x1f]/.test(value))) {
    throw new Error('HOST_EXECUTABLES_REQUIRED');
  }
  const git = args[0]; const gh = args[1]; const maestri = args[2]; const omp = args[3]; const powershell = args[4];
  if (!git || !gh || !maestri || !omp || !powershell) throw new Error('HOST_EXECUTABLES_REQUIRED');
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  return {
    git: { kind: /** @type {const} */ ('windows_keyring'), executable: resolve(git), cwd },
    github: { kind: /** @type {const} */ ('windows_keyring'), executable: resolve(gh), cwd },
    execution: { maestriExecutable: resolve(maestri), ompExecutable: resolve(omp), powershellExecutable: resolve(powershell), inheritedEnvironment: process.env },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await startController(hostContext(process.argv.slice(2)));
  } catch (error) {
    // Native startup logs never include argv, inherited environment or raw errors.
    const code = error instanceof ConfigurationError || error instanceof StorageError || error instanceof OperationError || error instanceof ExecutionError ? error.code : 'HOST_STARTUP_FAILED';
    console.error(JSON.stringify({ level: 'error', code, message: 'Start inside an authorized Maestri anchor with five absolute EXE paths: Git, GH, Maestri, OMP, PowerShell. Check configuration, lock, migrations and native context.' }));
    process.exitCode = 1;
  }
}
