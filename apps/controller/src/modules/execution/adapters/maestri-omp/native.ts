import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { ExecutionCatalog } from '#contracts';
import type { CatalogModel, ExecutionCatalog as ExecutionCatalogDto } from '#contracts';
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
const selectorToken = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;
function parseOmpVersion(stdout: string): string | null {
  const match = /^omp\/([A-Za-z0-9][A-Za-z0-9._+-]{0,127})$/i.exec(stdout.trim());
  return match?.[1] ?? null;
}
function unavailableCatalog(code: string, message: string, recovery: string): ExecutionCatalogDto {
  return { state: 'unavailable', observed_at_ms: Date.now(), diagnostics: [{ code, message, recovery }] };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function catalogFromJson(stdout: string, version: string): ExecutionCatalogDto {
  let decoded: unknown;
  try { decoded = JSON.parse(stdout) as unknown; }
  catch { return unavailableCatalog('OMP_CATALOG_INVALID', 'A resposta JSON do catálogo OMP é inválida.', 'Confira a compatibilidade da CLI OMP instalada e consulte novamente.'); }
  if (!isRecord(decoded) || !Array.isArray(decoded.models)) {
    return unavailableCatalog('OMP_CATALOG_INVALID', 'A resposta do catálogo OMP não contém a lista completa de modelos.', 'Confira a compatibilidade da CLI OMP instalada e consulte novamente.');
  }
  const rawModels: readonly unknown[] = decoded.models;
  if (rawModels.length === 0) {
    return unavailableCatalog('OMP_CATALOG_EMPTY', 'O OMP não retornou modelos selecionáveis para a configuração local.', 'Configure os providers no OMP e consulte novamente.');
  }

  const models: CatalogModel[] = [];
  const seen = new Set<string>();
  for (const item of rawModels) {
    if (!isRecord(item) || item.kind !== 'chat' || typeof item.provider !== 'string' || !selectorToken.test(item.provider) ||
      typeof item.id !== 'string' || !selectorToken.test(item.id) || item.selector !== `${item.provider}/${item.id}` ||
      typeof item.name !== 'string' || !item.name.trim() || item.name.length > 512 ||
      (item.thinking !== null && !Array.isArray(item.thinking))) {
      return unavailableCatalog('OMP_CATALOG_INVALID', 'O catálogo OMP está parcial ou contém opções incompatíveis.', 'Confira o runtime e a configuração OMP antes de salvar perfis.');
    }
    const key = `${item.provider}/${item.id}`;
    if (seen.has(key)) return unavailableCatalog('OMP_CATALOG_INVALID', 'O catálogo OMP contém modelos duplicados.', 'Confira o runtime OMP antes de salvar perfis.');
    seen.add(key);
    const efforts: string[] = [];
    if (Array.isArray(item.thinking)) {
      const rawEfforts: readonly unknown[] = item.thinking;
      for (const effort of rawEfforts) {
        if (typeof effort !== 'string' || !selectorToken.test(effort) || efforts.includes(effort)) {
          return unavailableCatalog('OMP_CATALOG_INVALID', 'O catálogo OMP contém níveis de esforço incompatíveis.', 'Confira o runtime OMP antes de salvar perfis.');
        }
        efforts.push(effort);
      }
    }
    models.push({
      provider: item.provider, provider_name: item.provider, model: item.id, model_name: item.name, efforts,
    });
  }
  const result: ExecutionCatalogDto = { state: 'loaded', executor: 'maestri-omp', executor_version: version, observed_at_ms: Date.now(), models };
  if (!Value.Check(ExecutionCatalog, result)) {
    return unavailableCatalog('OMP_CATALOG_INVALID', 'O catálogo OMP não atende ao contrato de compatibilidade.', 'Confira o runtime OMP antes de salvar perfis.');
  }
  return result;
}
export function createNative(host: ExecutionHost, cwd: string, run: CliRunner = runCli) {
  const invoke = async (args: readonly string[]) => {
    const result = await run(host.maestriExecutable, args, cwd, host.inheritedEnvironment);
    if (result.exitCode !== 0) throw new ExecutionError('CONTEXT_STALE');
    return result.stdout;
  };
  const observeVersion = async (): Promise<string | null> => {
    const reply = await run(host.ompExecutable, ['--version'], cwd, host.inheritedEnvironment);
    return reply.exitCode === 0 ? parseOmpVersion(reply.stdout) : null;
  };
  return {
    async getCatalog(): Promise<ExecutionCatalogDto> {
      let version: string | null;
      try { version = await observeVersion(); }
      catch { return unavailableCatalog('OMP_VERSION_UNAVAILABLE', 'A versão do OMP não pôde ser observada.', 'Confira o executável OMP da instalação e consulte novamente.'); }
      if (!version) return unavailableCatalog('OMP_VERSION_UNAVAILABLE', 'A versão do OMP não pôde ser observada.', 'Confira o executável OMP da instalação e consulte novamente.');
      let catalog;
      try { catalog = await run(host.ompExecutable, ['models', '--json'], cwd, host.inheritedEnvironment); }
      catch { return unavailableCatalog('OMP_CATALOG_UNAVAILABLE', 'A consulta local do catálogo OMP falhou.', 'Confira o executável e a configuração local do OMP; consulte novamente.'); }
      if (catalog.exitCode !== 0) return unavailableCatalog('OMP_CATALOG_UNSUPPORTED', 'A CLI OMP instalada não confirmou a superfície JSON do catálogo.', 'Confira a ajuda e a compatibilidade do runtime OMP instalado.');
      return catalogFromJson(catalog.stdout, version);
    },
    async validate(): Promise<{ anchor: Anchor; ompVersion: string }> {
      const anchor = inheritedAnchor(host);
      // A real server query, not PATH, pipe existence or a debug environment echo.
      const list = await invoke(['list']);
      if (!/^\s*You:/m.test(list)) throw new ExecutionError('CONTEXT_STALE');
      const help = await invoke(['recruit', '--help']);
      if (!['--command', '--dir'].every(flag => help.includes(flag))) throw new ExecutionError('CLI_UNSUPPORTED');
      const version = await observeVersion();
      if (!version) throw new ExecutionError('CLI_UNSUPPORTED');
      return { anchor, ompVersion: version };
    },
    async recruit(name: string, directory: string, command: string, replace = false): Promise<void> {
      await invoke(['recruit', ...(replace ? ['--replace'] : []), name, '--command', command, '--dir', directory]);
    },
    async stop(name: string, identity?: { workspaceId: string; terminalId: string }, generation?: number): Promise<'confirmed' | 'uncertain'> {
      if (!name.startsWith('factory-') || !uuid.test(name.slice(8))) throw new ExecutionError('RESOURCE_INVALID');
      const anchor = inheritedAnchor(host);
      if (identity && (identity.workspaceId.toLowerCase() !== anchor.workspaceId || !uuid.test(identity.terminalId))) return 'uncertain';
      if (host.stopPendingTerminal) {
        try { if (await host.stopPendingTerminal({ workspaceId: anchor.workspaceId, terminalName: name,
          ...(identity ? { terminalId: identity.terminalId } : {}), ...(generation === undefined ? {} : { generation }) }) === true) return 'confirmed'; }
        catch { return 'uncertain'; }
      }
      if (!identity) return 'uncertain';
      if (identity.workspaceId.toLowerCase() !== anchor.workspaceId || !uuid.test(identity.terminalId) || !host.confirmStoppedTerminal || !host.stopTerminal) return 'uncertain';
      // dismiss removes the canvas identity required by recruit --replace.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const reference = { workspaceId: anchor.workspaceId, terminalName: name, terminalId: identity.terminalId, ...(generation === undefined ? {} : { generation }) };
        const stopped = async () => { await host.stopTerminal!(reference); return host.confirmStoppedTerminal!(reference); };
        const observed = await Promise.race([stopped(),
          new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), executionLimits.cliMs); })]);
        if (observed === true) return 'confirmed';
      } catch { return 'uncertain'; }
      finally { clearTimeout(timer); }
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
  return `& ${quote(powershell)} -NoLogo -NoProfile -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`;
}
