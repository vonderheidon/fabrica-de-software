import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeletionPathObservation } from './deletion.js';

type AdjacentEffect = (path: string) => Promise<void>;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
function isObservation(value: unknown): value is DeletionPathObservation {
  return isRecord(value) && typeof value.path === 'string' &&
    (value.identity === null || typeof value.identity === 'string') &&
    (value.resolvedPath === null || typeof value.resolvedPath === 'string') &&
    ['absent', 'directory', 'file', 'symlink', 'junction'].includes(String(value.kind)) &&
    Array.isArray(value.ancestors) && value.ancestors.length > 0 && value.ancestors.every((a: unknown) =>
      isRecord(a) && typeof a.path === 'string' && typeof a.identity === 'string' && typeof a.resolvedPath === 'string');
}
const failure = (code: string): Error => Object.assign(new Error('DELETION_REFERENCE_BLOCKED'), { code });
// A fixed application program, not shell text assembled from target paths.
// Inputs travel solely as JSON on stdin. No execution-policy setting changes.
const program = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  $request = [Console]::ReadLine() | ConvertFrom-Json
  Add-Type -Path $request.source
  $adjacent = $null
  if ($request.observeEffects) { $adjacent = [System.Action[string]] {
    param($path)
    [Console]::WriteLine((@{ event = 'before_effect'; path = $path } | ConvertTo-Json -Compress))
    if ([Console]::ReadLine() -ne 'continue') { throw 'EFFECT_NOT_RELEASED' }
  } }
  if ($request.action -eq 'observe') {
    $result = [WindowsReferenceDeletion]::ObserveHeld($request.path, $adjacent)
  } elseif ($request.action -eq 'observe_many') {
    $result = [WindowsReferenceDeletion]::ObserveMany([string[]]$request.paths)
  } elseif ($request.action -eq 'remove') {
    $expected = New-Object WindowsReferenceDeletion+Observation
    $expected.path = $request.expected.path
    $expected.identity = $request.expected.identity
    $expected.kind = $request.expected.kind
    $expected.resolvedPath = $request.expected.resolvedPath
    $expected.ancestors = @($request.expected.ancestors | ForEach-Object {
      $ancestor = New-Object WindowsReferenceDeletion+Ancestor
      $ancestor.path = $_.path
      $ancestor.identity = $_.identity
      $ancestor.resolvedPath = $_.resolvedPath
      $ancestor
    })
    [WindowsReferenceDeletion]::Remove($request.path, $expected, $adjacent)
    $result = $null
  } else { throw 'REQUEST_INVALID' }
  [Console]::WriteLine((@{ result = $result; ok = $true } | ConvertTo-Json -Depth 20 -Compress))
} catch {
  $errorObject = $_.Exception
  while ($errorObject.InnerException) { $errorObject = $errorObject.InnerException }
  $code = 'UNSAFE'
  if ($errorObject -is [System.ComponentModel.Win32Exception]) {
    switch ($errorObject.NativeErrorCode) {
      5 { $code = 'EACCES' }
      32 { $code = 'EBUSY' }
      33 { $code = 'EBUSY' }
      145 { $code = 'ENOTEMPTY' }
    }
  }
  if ($errorObject.Message -eq 'IDENTITY_CHANGED') { $code = 'IDENTITY_CHANGED' }
  [Console]::WriteLine((@{ ok = $false; code = $code } | ConvertTo-Json -Compress))
  exit 1
}`;

/** Private host adapter. No caller-supplied commands, environment switches or
 * HTTP exposure. The adjacent callback is a test seam; production acknowledges
 * the event directly, while the helper keeps all boundary handles alive.
 */
async function invoke(request: object, beforeEffect?: AdjacentEffect): Promise<unknown> {
  if (process.platform !== 'win32' || !process.env.SystemRoot) throw failure('UNSUPPORTED');
  const executable = win32.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const source = fileURLToPath(new URL('../../../../../resources/deletion/windows-reference.cs', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', program],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: child.stdout });
    let settled = false;
    let response: unknown;
    let received = false;
    let bytes = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      lines.close();
      child.stdin.destroy();
      if (error) { child.kill(); reject(error); } else resolve(response);
    };
    const timeout = setTimeout(() => finish(failure('ETIMEDOUT')), 60_000);
    // Discard stderr rather than surfacing PowerShell compilation/source output.
    child.stderr.resume();
    child.on('error', () => finish(failure('UNAVAILABLE')));
    child.stdin.on('error', () => finish(failure('UNAVAILABLE')));
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1_048_576) finish(failure('RESPONSE_TOO_LARGE'));
    });
    lines.on('line', line => {
      void (async () => {
        const message: unknown = JSON.parse(line);
        if (!isRecord(message) || received) throw failure('PROTOCOL_INVALID');
        if (message.event === 'before_effect' && typeof message.path === 'string') {
          if (beforeEffect) await beforeEffect(message.path);
          if (!settled) child.stdin.write('continue\n');
        } else if (message.ok === true) {
          received = true;
          response = message.result;
        } else if (message.ok === false && typeof message.code === 'string') {
          throw failure(['EACCES', 'EBUSY', 'ENOTEMPTY', 'IDENTITY_CHANGED'].includes(message.code) ? message.code : 'UNSAFE');
        } else throw failure('PROTOCOL_INVALID');
      })().catch((error: unknown) => finish(error instanceof Error ? error : failure('PROTOCOL_INVALID')));
    });
    child.on('close', code => {
      if (code === 0 && received) finish(); else finish(failure('UNAVAILABLE'));
    });
    child.stdin.write(`${JSON.stringify({ ...request, source })}\n`);
  });
}

export async function observeWindowsReference(path: string, whileHeld?: AdjacentEffect): Promise<DeletionPathObservation> {
  const result = await invoke({ action: 'observe', path, observeEffects: whileHeld !== undefined }, whileHeld);
  if (!isObservation(result)) throw failure('PROTOCOL_INVALID');
  return result;
}

export async function observeWindowsReferences(paths: readonly string[]): Promise<readonly DeletionPathObservation[]> {
  // Amortize PowerShell startup and Add-Type; each path still gets fresh handles.
  const batchSize = 100;
  const observations: DeletionPathObservation[] = [];
  const observeBatch = async (batch: readonly string[]): Promise<void> => {
    let result: unknown;
    try { result = await invoke({ action: 'observe_many', paths: batch }); }
    catch (error) {
      // Oversized reads grant no authority. Retry smaller, fresh observations;
      // malformed responses and access/identity failures remain hard failures.
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'RESPONSE_TOO_LARGE' || batch.length < 2) throw error;
      const middle = Math.ceil(batch.length / 2);
      await observeBatch(batch.slice(0, middle));
      await observeBatch(batch.slice(middle));
      return;
    }
    if (!Array.isArray(result) || result.length !== batch.length || !result.every((item, index) =>
      isObservation(item) && item.path === batch[index])) throw failure('PROTOCOL_INVALID');
    observations.push(...result);
  };
  for (let offset = 0; offset < paths.length; offset += batchSize) {
    await observeBatch(paths.slice(offset, offset + batchSize));
  }
  return observations;
}

/** Qualified for local NTFS; unsupported paths fail without a string fallback. */
export async function removeWindowsReference(expected: DeletionPathObservation, beforeEffect?: AdjacentEffect): Promise<void> {
  await invoke({ action: 'remove', path: expected.path, expected, observeEffects: beforeEffect !== undefined }, beforeEffect);
}
