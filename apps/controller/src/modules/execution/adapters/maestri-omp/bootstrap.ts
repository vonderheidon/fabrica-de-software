import { lstat, mkdir, open, realpath, rmdir, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { attemptSessionDirectoryReference, OperationId, passageBootstrapDirectoryReference, type PassageRequest } from '#contracts';
import { ExecutionError } from '../../errors.js';
import type { ExecutionHost } from '../../index.js';
import type { RoleResource } from '../../roles.js';
import type { PassageChannel } from './channel.js';
import { runCli } from './native.js';
import { requireAttemptAreaResolver, requireAttemptRootResolver, type AttemptAreaResolver, type AttemptRootResolver } from '../../../workspaces/index.js';

export interface Bootstrap {
  path: string;
  removeSecret(): Promise<void>;
}
export type BootstrapWriter = (data: string, request: PassageRequest, host: ExecutionHost, role: RoleResource, channel: PassageChannel, ompVersion: string,
  resolveAttemptRoot?: AttemptRootResolver, sessionDirectoryRelative?: string, resolveAttemptArea?: AttemptAreaResolver,
  previousTerminalStopped?: boolean) => Promise<Bootstrap>;

async function ensureRuntimeDirectory(path: string): Promise<void> {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw new ExecutionError('RESOURCE_INVALID');
  }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw new ExecutionError('RESOURCE_INVALID');
}
async function validateRuntimeDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw new ExecutionError('RESOURCE_INVALID');
}

export function buildOmpArguments(request: PassageRequest, extensionPath: string, sessionDirectory: string): string[] {
  const args = ['--provider', request.profile.provider, '--model', request.profile.model];
  if (request.profile.effort !== null) args.push('--thinking', request.profile.effort);
  args.push('--session-dir', sessionDirectory);
  if (request.binding.round > 1) args.push('--continue');
  args.push('--extension', extensionPath);
  return args;
}
async function reserveBootstrapDirectory(path: string, previousTerminalStopped: boolean): Promise<void> {
  let existing = false;
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
      throw new ExecutionError('RESOURCE_INVALID');
    }
    existing = true;
  }
  await validateRuntimeDirectory(path);
  if (!existing) return;
  if (!previousTerminalStopped) {
    try { await rmdir(path); } catch { throw new ExecutionError('RESOURCE_INVALID'); }
    try { await mkdir(path, { mode: 0o700 }); } catch { throw new ExecutionError('RESOURCE_INVALID'); }
    await validateRuntimeDirectory(path);
    return;
  }
  const secret = join(path, 'launch.json');
  try {
    const stat = await lstat(secret);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(secret) !== secret) throw new ExecutionError('RESOURCE_INVALID');
    await unlink(secret);
  } catch (error) {
    if (error instanceof ExecutionError) throw error;
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw new ExecutionError('RESOURCE_INVALID');
  }
  try { await rmdir(path); } catch { throw new ExecutionError('RESOURCE_INVALID'); }
  try { await mkdir(path, { mode: 0o700 }); } catch { throw new ExecutionError('RESOURCE_INVALID'); }
  await validateRuntimeDirectory(path);
}

export const writeBootstrap: BootstrapWriter = async (data, request, host, role, channel, ompVersion, resolveAttemptRoot,
  sessionDirectoryRelative = `sessions/${request.binding.attemptId}/${request.binding.role}`, resolveAttemptArea, previousTerminalStopped = false) => {
  if (!isAbsolute(data) || !isAbsolute(request.cwd) || !Value.Check(OperationId, request.binding.passageId)) throw new ExecutionError('INPUT_INVALID');
  const resourceRoot = await requireAttemptRootResolver(resolveAttemptRoot)(request.binding.attemptId);
  const root = await realpath(resourceRoot);
  if (root !== resourceRoot || (await lstat(resourceRoot)).isSymbolicLink() || (await lstat(data)).isSymbolicLink()) throw new ExecutionError('RESOURCE_INVALID');
  const runtimeDirectory = join(data, 'runtime');
  await ensureRuntimeDirectory(runtimeDirectory);
  const npmCacheDirectory = join(runtimeDirectory, 'npm-cache');
  await ensureRuntimeDirectory(npmCacheDirectory);
  const bootstrapDirectory = join(runtimeDirectory, 'bootstrap');
  await ensureRuntimeDirectory(bootstrapDirectory);
  const cwd = await realpath(request.cwd);
  if (cwd !== request.cwd) throw new ExecutionError('INPUT_INVALID');
  const bootstrapReference = passageBootstrapDirectoryReference(request.binding.passageId);
  const own = resolve(data, ...bootstrapReference.split('/'));
  const relativeBootstrap = relative(data, own);
  if (relativeBootstrap !== bootstrapReference.split('/').join(sep) || relativeBootstrap.startsWith(`..${sep}`) || isAbsolute(relativeBootstrap)) {
    throw new ExecutionError('RESOURCE_INVALID');
  }
  await reserveBootstrapDirectory(own, previousTerminalStopped);
  if (process.platform === 'win32') {
    // Restrict only our newly owned directory, before writing the ephemeral capability.
    // Unix mode bits alone do not protect files on Windows.
    const quote = (v: string) => `'${v.replaceAll("'", "''")}'`;
    const script = `$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; ` +
      `$acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); ` +
      `$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); ` +
      `$acl.AddAccessRule($rule); $directory=[System.IO.DirectoryInfo]::new(${quote(own)}); ` +
      // Use native ACL APIs without depending on inherited PowerShell module discovery.
      `if ($PSVersionTable.PSEdition -eq 'Core') { [System.IO.FileSystemAclExtensions]::SetAccessControl($directory,$acl) } ` +
      `else { $directory.SetAccessControl($acl) }`;
    const response = await runCli(host.powershellExecutable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], root, host.inheritedEnvironment);
    if (response.exitCode !== 0) throw new ExecutionError('RESOURCE_INVALID');
  }
  const target = join(own, 'launch.json');
  if (relative(data, target).startsWith(`..${sep}`)) throw new ExecutionError('RESOURCE_INVALID');
  const extensionPath = new URL('./extension.js', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const extensionFile = fileURLToPath(extensionPath);
  const normalizedSessionDirectory = sessionDirectoryRelative?.split(/[\\/]/u).join('/');
  const issueSession = normalizedSessionDirectory && /^issues\/([1-9][0-9]*)\/attempts\/[^/]+\/sessions\/(?:implementer|reviewer)$/u.exec(normalizedSessionDirectory);
  const issueNumber = issueSession ? Number(issueSession[1]) : NaN;
  const currentSessionReference = Number.isSafeInteger(issueNumber) && issueNumber <= 2_147_483_647
    ? attemptSessionDirectoryReference(issueNumber, request.binding.attemptId, request.binding.role) : null;
  const legacySessionReferences = [`sessions/${request.binding.attemptId}/${request.binding.role}`, `sessions/${request.binding.role}`];
  if (!normalizedSessionDirectory || isAbsolute(sessionDirectoryRelative) || /^[A-Za-z]:/u.test(sessionDirectoryRelative) ||
    normalizedSessionDirectory.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment === '.git') ||
    (!legacySessionReferences.includes(normalizedSessionDirectory) && normalizedSessionDirectory !== currentSessionReference)) {
    throw new ExecutionError('RESOURCE_INVALID');
  }
  let sessionPath = resolve(root, ...normalizedSessionDirectory.split('/'));
  if (normalizedSessionDirectory === currentSessionReference) {
    const sessions = await requireAttemptAreaResolver(resolveAttemptArea)(request.binding.attemptId, 'sessions');
    sessionPath = join(sessions, request.binding.role);
    if (relative(root, sessionPath).split(sep).join('/') !== normalizedSessionDirectory) throw new ExecutionError('RESOURCE_INVALID');
  }
  const relativeSessionPath = relative(root, sessionPath);
  if (!relativeSessionPath || relativeSessionPath === '..' || relativeSessionPath.startsWith(`..${sep}`) || isAbsolute(relativeSessionPath)) {
    throw new ExecutionError('RESOURCE_INVALID');
  }
  let sessionDirectory = root;
  for (const segment of relativeSessionPath.split(sep)) {
    sessionDirectory = join(sessionDirectory, segment);
    try { await mkdir(sessionDirectory, { mode: 0o700 }); } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw new ExecutionError('RESOURCE_INVALID');
    }
    if (!(await lstat(sessionDirectory)).isDirectory() || (await lstat(sessionDirectory)).isSymbolicLink() || await realpath(sessionDirectory) !== sessionDirectory) {
      throw new ExecutionError('RESOURCE_INVALID');
    }
  }
  const sessionRealPath = await realpath(sessionDirectory);
  const sessionDirectoryStat = await lstat(sessionDirectory);
  if (!sessionDirectoryStat.isDirectory() || sessionDirectoryStat.isSymbolicLink() || sessionRealPath !== sessionDirectory || relative(root, sessionRealPath).startsWith(`..${sep}`)) {
    throw new ExecutionError('RESOURCE_INVALID');
  }
  const payload = {
    protocolVersion: 1, host: '127.0.0.1', port: channel.port, token: channel.token,
    cwd, ompExecutable: host.ompExecutable, ompVersion, sessionDirectory, npmCacheDirectory,
    args: buildOmpArguments(request, extensionFile, sessionDirectory),
    role: { reference: role.reference, resultSchema: role.resultSchema, questionSchema: role.questionSchema },
    task: request.task, guidance: request.profile.guidance, gitNexusRequired: request.gitNexusRequired,
  };
  const handle = await open(target, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(payload), 'utf8'); await handle.sync(); } finally { await handle.close(); }
  let removal: Promise<void> | undefined;
  return { path: target, removeSecret: () => {
    removal ??= unlink(target).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
      throw new ExecutionError('RESOURCE_INVALID');
    }).then(async () => rmdir(own).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTEMPTY' || error.code === 'EEXIST')) return;
      throw new ExecutionError('RESOURCE_INVALID');
    }));
    return removal;
  } };
};
