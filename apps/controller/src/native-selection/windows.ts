import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

function pickerEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH']) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function runPicker(executable: string, cwd: string, kind: string, signal?: AbortSignal): Promise<string | null> {
  const selectionSignal = signal ?? new AbortController().signal;
  if (selectionSignal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let output = '';
    let outputTooLarge = false;
    let outputFailed = false;
    let settled = false;
    const child = spawn(executable, [kind], {
      cwd,
      env: pickerEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const stdout: Readable | null = child.stdout;
    const cleanup = () => selectionSignal.removeEventListener('abort', cancel);
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const cancel = () => { child.kill(); };
    selectionSignal.addEventListener('abort', cancel, { once: true });
    if (selectionSignal.aborted) cancel();
    stdout?.setEncoding('utf8');
    stdout?.on('data', (chunk: string) => {
      if (outputTooLarge) return;
      output += chunk;
      if (output.length > 4096) {
        outputTooLarge = true;
        child.kill();
      }
    });
    stdout?.on('error', () => { outputFailed = true; child.kill(); });
    child.once('error', () => finish(() => reject(new Error('NATIVE_SELECTION_FAILED'))));
    child.once('close', (code) => {
      finish(() => {
        if (selectionSignal.aborted || code === 3) { resolve(null); return; }
        if (outputFailed || outputTooLarge || code !== 0) { reject(new Error('NATIVE_SELECTION_FAILED')); return; }
        const selectedPath = output.replace(/(?:\r?\n)+$/u, '');
        if (!selectedPath || /[\x00-\x1f\x7f]/u.test(selectedPath)) { reject(new Error('NATIVE_SELECTION_FAILED')); return; }
        resolve(selectedPath);
      });
    });
  });
}

export function createWindowsNativeSelection(workingDirectory: string) {
  const executable = fileURLToPath(new URL('../../../../resources/native-selection/picker.exe', import.meta.url));
  return {
    selectProjectsDirectory: (signal?: AbortSignal) => runPicker(executable, workingDirectory, 'folder', signal),
    selectGitHubExecutable: (signal?: AbortSignal) => runPicker(executable, workingDirectory, 'github', signal),
    selectExecutable: (signal?: AbortSignal) => runPicker(executable, workingDirectory, 'executable', signal),
  };
}
