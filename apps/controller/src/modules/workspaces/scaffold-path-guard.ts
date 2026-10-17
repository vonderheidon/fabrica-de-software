import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';

export class ScaffoldWorkspaceError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface ScaffoldPathGuard {
  createDirectory(path: string, exclusive: boolean): Promise<void>;
  assertHeld(): void;
  close(): Promise<void>;
}
export type ScaffoldPathGuardFactory = (parent: string) => Promise<ScaffoldPathGuard>;

// Node's mkdir/open APIs do not expose Windows directory sharing modes. Keep
// every ancestor open without write/delete sharing, from the volume root down.
// OPEN_REPARSE_POINT inspects the directory itself instead of following a link.
// The same process owns the handles AND performs mkdir: losing the helper cannot
// turn a successful JS precheck into an unprotected directory creation.
// https://learn.microsoft.com/windows/win32/api/fileapi/nf-fileapi-createfilew
const guardScript = String.raw`
$ErrorActionPreference = 'Stop'
$guard = $null
try {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public sealed class ScaffoldDirectories : IDisposable {
  [StructLayout(LayoutKind.Sequential)]
  private struct Information {
    public uint Attributes;
    public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
    IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Information information);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CreateDirectoryW(string path, IntPtr security);
  private readonly Dictionary<string, SafeFileHandle> handles =
    new Dictionary<string, SafeFileHandle>(StringComparer.OrdinalIgnoreCase);

  public void Pin(string path) {
    path = Path.GetFullPath(path);
    if (path.StartsWith(@"\\")) throw new IOException("SCAFFOLD_PATH_REDIRECTED");
    if (handles.ContainsKey(path)) return;
    string parent = Path.GetDirectoryName(path);
    if (!String.IsNullOrEmpty(parent)) Pin(parent);
    // FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES; FILE_SHARE_READ only;
    // Attribute-only access does not enforce sharing restrictions on rename.
    // OPEN_EXISTING;
    // FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT.
    SafeFileHandle handle = CreateFileW(@"\\?\" + path, 0x81, 1, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
    if (handle.IsInvalid) { handle.Dispose(); throw new IOException("SCAFFOLD_PATH_GUARD_UNAVAILABLE"); }
    Information information;
    if (!GetFileInformationByHandle(handle, out information)) {
      handle.Dispose(); throw new IOException("SCAFFOLD_PATH_GUARD_UNAVAILABLE");
    }
    if ((information.Attributes & 0x400) != 0 || (information.Attributes & 0x10) == 0) {
      handle.Dispose(); throw new IOException("SCAFFOLD_PATH_REDIRECTED");
    }
    handles.Add(path, handle);
  }

  public void Create(string path, bool exclusive) {
    // Pin is recursive and read-only. No mkdir can run until all ancestors are
    // protected, including ancestors above the configured projects root.
    Pin(Path.GetDirectoryName(path));
    if (!CreateDirectoryW(@"\\?\" + path, IntPtr.Zero)) {
      int error = Marshal.GetLastWin32Error();
      if (error != 183 || exclusive) throw new IOException(error == 183
        ? "SCAFFOLD_DESTINATION_EXISTS" : "SCAFFOLD_PATH_GUARD_UNAVAILABLE");
    }
    Pin(path);
  }

  public void Dispose() {
    foreach (SafeFileHandle handle in handles.Values) handle.Dispose();
    handles.Clear();
  }
}
'@
  $guard = New-Object ScaffoldDirectories
  while ($null -ne ($line = [Console]::ReadLine())) {
    $request = ConvertFrom-Json -InputObject $line
    if ($request.command -eq 'pin') { $guard.Pin([string]$request.path) }
    elseif ($request.command -eq 'create') { $guard.Create([string]$request.path, [bool]$request.exclusive) }
    else { throw 'SCAFFOLD_PATH_GUARD_UNAVAILABLE' }
    [Console]::WriteLine('OK')
  }
} catch {
  $code = 'SCAFFOLD_PATH_GUARD_UNAVAILABLE'
  foreach ($known in @('SCAFFOLD_PATH_REDIRECTED', 'SCAFFOLD_DESTINATION_EXISTS')) {
    if ($_.Exception.ToString().Contains($known)) { $code = $known }
  }
  [Console]::WriteLine($code)
  exit 1
} finally {
  if ($null -ne $guard) { $guard.Dispose() }
}
`;

export const acquireScaffoldPathGuard: ScaffoldPathGuardFactory = async parent => {
  const systemRoot = process.env.SystemRoot;
  if (process.platform !== 'win32' || !systemRoot || !isAbsolute(systemRoot)) throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_GUARD_UNAVAILABLE');
  const executable = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(guardScript, 'utf16le').toString('base64')], {
    shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let held = true;
  let closed = false;
  let output = '';
  let pending: { resolve: () => void; reject: (error: Error) => void } | undefined;
  const unavailable = () => new ScaffoldWorkspaceError('SCAFFOLD_PATH_GUARD_UNAVAILABLE');
  const fail = (error: Error) => { held = false; pending?.reject(error); pending = undefined; };
  const exited = new Promise<void>(resolve => child.once('close', () => { closed = true; fail(unavailable()); resolve(); }));
  child.on('error', () => fail(unavailable()));
  child.stdin.on('error', () => fail(unavailable()));
  // Never retain raw PowerShell diagnostics: only the bounded protocol codes.
  child.stderr.resume();
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
    if (output.length > 256) { fail(unavailable()); child.kill(); return; }
    const end = output.indexOf('\n');
    if (end < 0) return;
    const code = output.slice(0, end).trim(); output = output.slice(end + 1);
    if (!pending) { fail(unavailable()); child.kill(); return; }
    if (code === 'OK') { pending.resolve(); pending = undefined; }
    else { fail(new ScaffoldWorkspaceError(['SCAFFOLD_PATH_REDIRECTED', 'SCAFFOLD_DESTINATION_EXISTS'].includes(code) ? code : 'SCAFFOLD_PATH_GUARD_UNAVAILABLE')); }
  });
  const request = async (command: string, path: string, exclusive = false) => {
    if (!held || pending) throw unavailable();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        pending = { resolve, reject };
        timer = setTimeout(() => { fail(unavailable()); child.kill(); }, 15_000);
        child.stdin.write(JSON.stringify({ command, path, exclusive }) + '\n');
      });
    } finally { clearTimeout(timer); }
  };
  const close = async () => {
    held = false; child.stdin.end();
    if (closed) return;
    const timer = setTimeout(() => child.kill(), 5_000);
    try { await exited; } finally { clearTimeout(timer); }
  };
  try { await request('pin', parent); }
  catch (error) { await close(); throw error; }
  return {
    createDirectory: (path, exclusive) => request('create', path, exclusive),
    assertHeld() { if (!held) throw unavailable(); },
    close,
  };
};
