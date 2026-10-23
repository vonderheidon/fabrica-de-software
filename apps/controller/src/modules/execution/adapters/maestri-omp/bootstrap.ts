import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { PassageRequest } from '#contracts';
import { ExecutionError } from '../../errors.js';
import type { ExecutionHost } from '../../index.js';
import type { RoleResource } from '../../roles.js';
import type { PassageChannel } from './channel.js';
import { runCli } from './native.js';
import type { AttemptRootResolver } from '../../../workspaces/index.js';

export interface Bootstrap {
  path: string;
  removeSecret(): Promise<void>;
}
export type BootstrapWriter = (data: string, request: PassageRequest, host: ExecutionHost, role: RoleResource, channel: PassageChannel, ompVersion: string,
  resolveAttemptRoot?: AttemptRootResolver, sessionDirectoryRelative?: string) => Promise<Bootstrap>;
export function buildOmpArguments(request: PassageRequest, extensionPath: string, sessionDirectory: string): string[] {
  const args = ['--provider', request.profile.provider, '--model', request.profile.model];
  if (request.profile.effort !== null) args.push('--thinking', request.profile.effort);
  args.push('--session-dir', sessionDirectory);
  if (request.binding.round > 1) args.push('--continue');
  args.push('--extension', extensionPath);
  return args;
}
export const writeBootstrap: BootstrapWriter = async (data, request, host, role, channel, ompVersion, resolveAttemptRoot,
  sessionDirectoryRelative = `sessions/${request.binding.attemptId}/${request.binding.role}`) => {
  if (!isAbsolute(data) || !isAbsolute(request.cwd)) throw new ExecutionError('INPUT_INVALID');
  const resourceRoot = resolveAttemptRoot ? await resolveAttemptRoot(request.binding.attemptId) : data;
  const root = await realpath(resourceRoot);
  if (root !== resourceRoot || (await lstat(resourceRoot)).isSymbolicLink() || (await lstat(data)).isSymbolicLink()) throw new ExecutionError('RESOURCE_INVALID');
  const cwd = await realpath(request.cwd);
  if (cwd !== request.cwd) throw new ExecutionError('INPUT_INVALID');
  const directory = join(root, 'execution-bootstrap');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new ExecutionError('RESOURCE_INVALID');
  const own = join(directory, request.binding.passageId);
  await mkdir(own, { mode: 0o700 }); // Exclusive reservation; never adopt a previous bootstrap.
  if (process.platform === 'win32') {
    // Restrict only our newly owned directory, before writing the ephemeral capability.
    // Unix mode bits alone do not protect files on Windows.
    const quote = (v: string) => `'${v.replaceAll("'", "''")}'`;
    const script = `$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; ` +
      `$acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); ` +
      `$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); ` +
      `$acl.AddAccessRule($rule); $directory=[System.IO.DirectoryInfo]::new(${quote(own)}); $directory.SetAccessControl($acl)`;
    const response = await runCli(host.powershellExecutable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], root, host.inheritedEnvironment);
    if (response.exitCode !== 0) throw new ExecutionError('RESOURCE_INVALID');
  }
  const target = join(own, 'launch.json');
  if (relative(root, target).startsWith(`..${sep}`)) throw new ExecutionError('RESOURCE_INVALID');
  const extensionPath = new URL('./extension.js', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const extensionFile = fileURLToPath(extensionPath);
  if (!sessionDirectoryRelative || isAbsolute(sessionDirectoryRelative) || /^[A-Za-z]:/u.test(sessionDirectoryRelative) ||
    sessionDirectoryRelative.split(/[\\/]/u).some(segment => !segment || segment === '.' || segment === '..' || segment === '.git') ||
    ![`sessions/${request.binding.attemptId}/${request.binding.role}`, `sessions/${request.binding.role}`]
      .includes(sessionDirectoryRelative.split(/[\\/]/u).join('/'))) throw new ExecutionError('RESOURCE_INVALID');
  const sessionsRoot = join(root, 'sessions');
  try { await mkdir(sessionsRoot, { mode: 0o700 }); } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw new ExecutionError('RESOURCE_INVALID');
  }
  const sessionsRootStat = await lstat(sessionsRoot);
  if (!sessionsRootStat.isDirectory() || sessionsRootStat.isSymbolicLink() || await realpath(sessionsRoot) !== sessionsRoot) throw new ExecutionError('RESOURCE_INVALID');
  let sessionDirectory = sessionsRoot;
  for (const segment of sessionDirectoryRelative.split(/[\\/]/u).slice(1)) {
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
    cwd, ompExecutable: host.ompExecutable, ompVersion, sessionDirectory,
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
    });
    return removal;
  } };
};
