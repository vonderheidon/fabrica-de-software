import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

const folderPickerScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Selecione a pasta raiz dos projetos'
$dialog.ShowNewFolderButton = $false
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.WriteLine($dialog.SelectedPath)
    exit 0
  }
  exit 3
} finally { $dialog.Dispose() }
`;

const executablePickerScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Localize o GitHub CLI (gh.exe)'
$dialog.Filter = 'GitHub CLI (gh.exe)|gh.exe'
$dialog.FileName = 'gh.exe'
$dialog.CheckFileExists = $true
$dialog.CheckPathExists = $true
$dialog.Multiselect = $false
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.WriteLine($dialog.FileName)
    exit 0
  }
  exit 3
} finally { $dialog.Dispose() }
`;

function pickerEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH']) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function runPicker(executable: string, cwd: string, script: string, signal?: AbortSignal): Promise<string | null> {
  const selectionSignal = signal ?? new AbortController().signal;
  if (selectionSignal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let output = '';
    let outputTooLarge = false;
    let outputFailed = false;
    let settled = false;
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Sta', '-Command', script], {
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

export function createWindowsNativeSelection(powershellExecutable: string, workingDirectory: string) {
  return {
    selectProjectsDirectory: (signal?: AbortSignal) => runPicker(powershellExecutable, workingDirectory, folderPickerScript, signal),
    selectGitHubExecutable: (signal?: AbortSignal) => runPicker(powershellExecutable, workingDirectory, executablePickerScript, signal),
  };
}
