import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import type { ExecutionHost } from '../../index.js';
import { ExecutionError } from '../../errors.js';
import { executionLimits } from './wire.js';

export interface CliReply { exitCode: number; stdout: string }
export type CliRunner = (executable: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv) => Promise<CliReply>;
export const runCli: CliRunner = (executable, args, cwd, env) => new Promise((resolve, reject) => {
  let finished = false;
  let bytes = 0;
  const chunks: Buffer[] = [];
  const child = spawn(executable, [...args], { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const finish = (response?: CliReply) => {
    if (finished) return;
    finished = true; clearTimeout(timer);
    if (response) resolve(response); else { child.kill(); reject(new ExecutionError('CLI_UNAVAILABLE')); }
  };
  const timer = setTimeout(() => finish(), executionLimits.cliMs);
  child.on('error', () => finish());
  child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > executionLimits.cliBytes) finish(); else chunks.push(chunk); });
  child.stderr.on('data', () => { /* Raw runtime output may contain credentials. Drain without retaining. */ });
  child.on('close', (code) => {
    try { finish({ exitCode: code ?? -1, stdout: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }); }
    catch { finish(); }
  });
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface Anchor { terminalId: string; workspaceId: string }
export function inheritedAnchor(host: ExecutionHost | undefined): Anchor {
  const env = host?.inheritedEnvironment;
  if (!host || !env?.MAESTRI_PIPE || !env.MAESTRI_TERMINAL_ID || !env.MAESTRI_WORKSPACE_ID) throw new ExecutionError('CONTEXT_MISSING');
  if (!uuid.test(env.MAESTRI_TERMINAL_ID) || !uuid.test(env.MAESTRI_WORKSPACE_ID) ||
    !env.MAESTRI_PIPE.startsWith('\\\\.\\pipe\\') ||
    ![host.maestriExecutable, host.ompExecutable, host.powershellExecutable].every(p => isAbsolute(p) && /\.exe$/i.test(p))) throw new ExecutionError('CLI_UNSUPPORTED');
  return { terminalId: env.MAESTRI_TERMINAL_ID.toLowerCase(), workspaceId: env.MAESTRI_WORKSPACE_ID.toLowerCase() };
}
export function createNative(host: ExecutionHost, cwd: string, run: CliRunner = runCli) {
  const invoke = async (args: readonly string[]) => {
    const result = await run(host.maestriExecutable, args, cwd, host.inheritedEnvironment);
    if (result.exitCode !== 0) throw new ExecutionError('CONTEXT_STALE');
    return result.stdout;
  };
  return {
    async validate(): Promise<{ anchor: Anchor; ompVersion: string }> {
      const anchor = inheritedAnchor(host);
      // A real server query, not PATH, pipe existence or a debug environment echo.
      const list = await invoke(['list']);
      if (!/^\s*You:/m.test(list)) throw new ExecutionError('CONTEXT_STALE');
      const help = await invoke(['recruit', '--help']);
      if (!['--command', '--dir'].every(flag => help.includes(flag))) throw new ExecutionError('CLI_UNSUPPORTED');
      const version = await run(host.ompExecutable, ['--version'], cwd, host.inheritedEnvironment);
      const match = /^omp\/(18\.11\.1)\s*$/.exec(version.stdout.trim());
      if (version.exitCode !== 0 || !match?.[1]) throw new ExecutionError('CLI_UNSUPPORTED');
      return { anchor, ompVersion: match[1] };
    },
    async recruit(name: string, directory: string, command: string): Promise<void> {
      await invoke(['recruit', name, '--command', command, '--dir', directory]);
    },
    async stop(name: string): Promise<'confirmed' | 'uncertain'> {
      if (!name.startsWith('factory-') || !uuid.test(name.slice(8))) throw new ExecutionError('RESOURCE_INVALID');
      const anchor = inheritedAnchor(host);
      await invoke(['dismiss', name]);
      // CLI acceptance is not physical process/descendant termination proof.
      if (host.confirmStoppedTerminal) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const observed = await Promise.race([host.confirmStoppedTerminal({ workspaceId: anchor.workspaceId, terminalName: name }),
            new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), executionLimits.cliMs); })]);
          if (observed === true) return 'confirmed';
        } catch { return 'uncertain'; }
        finally { clearTimeout(timer); }
      }
      return 'uncertain';
    },
  };
}
export function launchCommand(powershell: string, bootstrapPath: string): string {
  // Only an opaque private file path is in argv. Neither prompt nor capability is embedded.
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const script = `$ErrorActionPreference='Stop'; $launchPath=${quote(bootstrapPath)}; ` +
    `$launch=[System.IO.File]::ReadAllText($launchPath,[System.Text.Encoding]::UTF8)|ConvertFrom-Json; ` +
    `$env:FACTORY_PASSAGE_BOOTSTRAP=$launchPath; Set-Location -LiteralPath $launch.cwd; ` +
    `& $launch.ompExecutable @($launch.args); exit $LASTEXITCODE`;
  return `"${powershell}" -NoLogo -NoProfile -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`;
}
