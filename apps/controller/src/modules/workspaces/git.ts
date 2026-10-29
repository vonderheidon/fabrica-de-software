import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';

export interface GitContext {
  /** The trusted host must attest this context; the module never elevates or changes credentials. */
  kind: 'windows_keyring'; executable: string;
}
export interface GitResponse { exitCode: number; stdout: string }
export interface GitInput { input?: string | Buffer; indexFile?: string; isolatedConfig?: boolean; commitTime?: number }
export type GitReader = (cwd: string, args: readonly string[], input?: GitInput) => Promise<GitResponse>;
export const gitLimits = Object.freeze({ timeoutMs: 15_000, responseBytes: 4_194_304 });
// Git 2.45 introduced both this flag and its environment equivalent.
// https://github.com/git/git/blob/v2.45.0/Documentation/RelNotes/2.45.0.txt
export const gitSafety = Object.freeze({ minimumVersion: '2.45.0', options: ['--no-optional-locks', '--no-lazy-fetch'] as const });
export class GitReadError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function createGitReader(context: GitContext): GitReader {
  return (cwd, args, input) => new Promise((resolve, reject) => {
    if (context.kind !== 'windows_keyring' || !isAbsolute(context.executable) || !isAbsolute(cwd)) {
      reject(new GitReadError('CONTEXT_UNAVAILABLE')); return;
    }
    // Optional index refresh and on-demand promisor fetches must not mutate the operator's origin.
    const environment: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' };
    // Inherited repository selectors must not redirect a query away from its explicit cwd.
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE']) delete environment[name];
    for (const name of Object.keys(environment)) if (/^GIT_CONFIG(?:$|_PARAMETERS$|_COUNT$|_KEY_|_VALUE_)/.test(name)) delete environment[name];
    for (const name of Object.keys(environment)) if (/^GIT_(?:AUTHOR|COMMITTER)_/.test(name)) delete environment[name];
    if (input?.commitTime !== undefined) {
      if (!Number.isSafeInteger(input.commitTime) || input.commitTime < 1 || input.commitTime > 253402300799) { reject(new GitReadError('GIT_DATE_INVALID')); return; }
      environment.GIT_AUTHOR_DATE = `@${input.commitTime} +0000`;
      environment.GIT_COMMITTER_DATE = environment.GIT_AUTHOR_DATE;
    }
    if (input?.isolatedConfig) { environment.GIT_CONFIG_NOSYSTEM = '1'; environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'; }
    if (input?.indexFile) {
      if (!isAbsolute(input.indexFile)) { reject(new GitReadError('GIT_INDEX_INVALID')); return; }
      environment.GIT_INDEX_FILE = input.indexFile;
    }
    // Project-scoped UUID paths exceed MAX_PATH even for small repositories.
    const pathOptions = process.platform === 'win32' ? ['-c', 'core.longpaths=true'] : [];
    const child = execFile(context.executable, [...gitSafety.options, '-c', 'core.fsmonitor=false', ...pathOptions, ...args], {
      cwd, shell: false, windowsHide: true, timeout: gitLimits.timeoutMs, maxBuffer: gitLimits.responseBytes,
      encoding: 'buffer', env: environment,
    }, (error, stdout) => {
      if (error && (typeof error.code !== 'number' || error.killed)) { reject(new GitReadError('GIT_UNAVAILABLE')); return; }
      try {
        // Names must never be silently replaced by U+FFFD when Git emits invalid UTF-8.
        const output = new TextDecoder('utf-8', { fatal: true }).decode(typeof stdout === 'string' ? Buffer.from(stdout, 'utf8') : stdout);
        resolve({ exitCode: error && typeof error.code === 'number' ? error.code : 0, stdout: output });
      } catch { reject(new GitReadError('GIT_ENCODING_UNSUPPORTED')); }
    });
    child?.stdin?.on('error', () => { reject(new GitReadError('GIT_INPUT_FAILED')); });
    child?.stdin?.end(input?.input);
  });
}
