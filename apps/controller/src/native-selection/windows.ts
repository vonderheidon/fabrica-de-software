import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

const folderPickerScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ProjectsFolderPicker {
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(uint count, IntPtr filters);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem folder);
    void SetFolder(IShellItem folder);
    void GetFolder(out IShellItem folder);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName(out IntPtr name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }
  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint kind, out IntPtr name);
    void GetAttributes(uint mask, out uint attributes);
    void Compare(IShellItem other, uint hint, out int order);
  }
  public static string Select() {
    var dialog = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("dc1c5a9c-e88a-4dde-a5a1-60f82a20aef7")));
    try {
      uint options;
      dialog.GetOptions(out options);
      // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST.
      dialog.SetOptions(options | 0x20u | 0x40u | 0x800u);
      dialog.SetTitle("Selecione a pasta raiz dos projetos");
      dialog.SetOkButtonLabel("Selecionar pasta");
      int result = dialog.Show(IntPtr.Zero);
      if (result == unchecked((int)0x800704c7)) return null;
      Marshal.ThrowExceptionForHR(result);
      IShellItem item;
      dialog.GetResult(out item);
      try {
        IntPtr path;
        item.GetDisplayName(0x80058000u, out path);
        try { return Marshal.PtrToStringUni(path); }
        finally { Marshal.FreeCoTaskMem(path); }
      } finally { Marshal.ReleaseComObject(item); }
    } finally { Marshal.ReleaseComObject(dialog); }
  }
}
'@
$selected = [ProjectsFolderPicker]::Select()
if ($null -eq $selected) { exit 3 }
[Console]::Out.WriteLine($selected)
exit 0
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
