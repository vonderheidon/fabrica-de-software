import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { PassageRequest } from '#contracts';
import { ExecutionError } from '../../errors.js';
import type { ExecutionHost } from '../../index.js';
import type { RoleResource } from '../../roles.js';
import type { PassageChannel } from './channel.js';
import { runCli } from './native.js';

export interface Bootstrap {
  path: string;
  removeSecret(): Promise<void>;
}
export type BootstrapWriter = (data: string, request: PassageRequest, host: ExecutionHost, role: RoleResource, channel: PassageChannel) => Promise<Bootstrap>;
export const writeBootstrap: BootstrapWriter = async (data, request, host, role, channel) => {
  if (!isAbsolute(data) || !isAbsolute(request.cwd)) throw new ExecutionError('INPUT_INVALID');
  const root = await realpath(data);
  if ((await lstat(data)).isSymbolicLink()) throw new ExecutionError('RESOURCE_INVALID');
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
      `$acl.AddAccessRule($rule); Set-Acl -LiteralPath ${quote(own)} -AclObject $acl`;
    const response = await runCli(host.powershellExecutable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], root, host.inheritedEnvironment);
    if (response.exitCode !== 0) throw new ExecutionError('RESOURCE_INVALID');
  }
  const target = join(own, 'launch.json');
  if (relative(root, target).startsWith(`..${sep}`)) throw new ExecutionError('RESOURCE_INVALID');
  const extensionPath = new URL('./extension.js', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const payload = {
    protocolVersion: 1, host: '127.0.0.1', port: channel.port, token: channel.token,
    cwd, ompExecutable: host.ompExecutable, ompVersion: '18.11.1',
    args: ['--provider', request.profile.provider, '--model', request.profile.model, '--thinking', request.profile.effort, '--extension', fileURLToPath(extensionPath)],
    role, task: request.task, guidance: request.profile.guidance, gitNexusRequired: request.gitNexusRequired,
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
