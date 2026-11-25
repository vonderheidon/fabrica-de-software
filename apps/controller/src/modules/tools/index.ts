import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { delimiter, join, win32 } from 'node:path';
import type { ToolOptions, ToolPreferences } from '#contracts';
import { gitSafety } from '../workspaces/index.js';

export type ManagedTool = 'git' | 'maestri' | 'omp' | 'powershell';
type ExecutableTool = ManagedTool | 'gh';
type ToolCandidate = { path: string; version: string };
type Runner = (path: string, args: readonly string[], timeoutMs: number) => Promise<string>;
type FileStat = { isFile(): boolean };
const exeNames: Record<ExecutableTool, readonly string[]> = {
  git: ['git.exe'], maestri: ['maestri.exe'], omp: ['omp.exe'], powershell: ['pwsh.exe', 'powershell.exe'], gh: ['gh.exe'],
};
const commandArgs: Record<ExecutableTool, readonly string[]> = {
  git: ['--version'], maestri: ['--version'], omp: ['--version'],
  powershell: ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], gh: ['--version'],
};
// Windows PowerShell 5.1 routinely needs 1.3-2s to start, more when the
// detector probes every tool concurrently; the other tools answer quickly.
const probeTimeoutMs: Record<ExecutableTool, number> = { git: 1_500, maestri: 1_500, omp: 1_500, powershell: 10_000, gh: 1_500 };
const now = () => Date.now();

function nativeRun(path: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(path, [...args], { cwd: process.cwd(), env: process.env, shell: false, windowsHide: true, timeout: timeoutMs, maxBuffer: 16_384, encoding: 'utf8' },
      (error, stdout) => {
        if (error || typeof stdout !== 'string') { reject(new Error('TOOL_VERSION_UNAVAILABLE')); return; }
        const version = stdout.split(/\r?\n/u).map(line => line.trim()).find(Boolean);
        if (!version || version.length > 256 || /[\x00-\x1f\x7f]/u.test(version)) { reject(new Error('TOOL_VERSION_UNAVAILABLE')); return; }
        resolve(version);
      });
  });
}

function absoluteWindowsPath(value: string): boolean {
  return win32.isAbsolute(value) && !/[\x00-\x1f\x7f]/u.test(value) && value.trim() === value;
}

export interface ToolDetectorDependencies {
  environment?: () => NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  stat?: (path: string) => Promise<FileStat>;
  access?: (path: string) => Promise<void>;
  run?: Runner;
  clock?: () => number;
}

export interface ToolDetector {
  detect(preferences: ToolPreferences, githubPath: string | null): Promise<ToolOptions['tools']>;
  validate(path: string, tool: ManagedTool): Promise<ToolCandidate | null>;
  stamp(preferences: ToolPreferences, paths: Partial<Record<ManagedTool, string | null>>): Promise<ToolPreferences>;
}

export function createToolDetector(dependencies: ToolDetectorDependencies = {}): ToolDetector {
  const environment = dependencies.environment ?? (() => process.env);
  const platform = dependencies.platform ?? process.platform;
  const checkStat = dependencies.stat ?? (path => stat(path));
  const checkAccess = dependencies.access ?? (path => access(path, constants.R_OK));
  const run = dependencies.run ?? nativeRun;
  const clock = dependencies.clock ?? now;

  async function inspect(path: string, tool: ManagedTool): Promise<{ candidate: ToolCandidate | null; unsupported?: boolean }> {
    if (platform !== 'win32' || !absoluteWindowsPath(path) || !exeNames[tool].includes(win32.basename(path).toLowerCase())) return { candidate: null };
    try {
      if (!(await checkStat(path)).isFile()) return { candidate: null };
      await checkAccess(path);
      const version = await run(path, commandArgs[tool], probeTimeoutMs[tool]);
      if (tool === 'git') {
        // A bare --version succeeds on Git 2.43, but does not attest the
        // no-lazy-fetch protection required by every workspace operation.
        try { await run(path, [...gitSafety.options, '--version'], probeTimeoutMs.git); }
        catch { return { candidate: null, unsupported: true }; }
      }
      return { candidate: { path, version: tool === 'omp' ? version.replace(/^omp\//i, '') : version } };
    } catch { return { candidate: null }; }
  }
  async function validate(path: string, tool: ManagedTool): Promise<ToolCandidate | null> {
    return (await inspect(path, tool)).candidate;
  }

  async function detectOne(tool: ExecutableTool, preferredPath: string | null, forcedPath?: string | null): Promise<ToolOptions['tools'][ManagedTool]> {
    if (platform !== 'win32') return { state: 'unavailable', candidates: [], selected_path: null,
      diagnostic: 'WINDOWS_TOOL_UNAVAILABLE', recovery: 'Use a instalação Windows com as ferramentas nativas configuradas.' };
    const env = environment();
    const directories = (env.PATH ?? '').split(delimiter).filter(Boolean);
    const search = directories.slice(0, 128).flatMap(directory => exeNames[tool].map(name => join(directory.replace(/^"|"$/gu, ''), name)));
    const paths = [forcedPath, preferredPath, ...search, ...(tool === 'gh' && env.GH_PATH ? [env.GH_PATH] : [])]
      .filter((path): path is string => typeof path === 'string' && path.length > 0);
    const uniquePaths = [...new Map(paths.filter(absoluteWindowsPath).map(path => [path.toLowerCase(), path])).values()];
    const unique = uniquePaths.slice(0, 64);
    const valid: ToolCandidate[] = [];
    let incomplete = directories.length > 128 || uniquePaths.length > 64;
    let unsupportedGit = false;
    for (const [index, path] of unique.entries()) {
      const found = tool === 'gh' ? await (async () => {
        if (win32.basename(path).toLowerCase() !== 'gh.exe') return null;
        try { if (!(await checkStat(path)).isFile()) return null; await checkAccess(path); return { path, version: await run(path, commandArgs.gh, probeTimeoutMs.gh) }; } catch { return null; }
      })() : await (async () => {
        const inspected = await inspect(path, tool);
        unsupportedGit ||= inspected.unsupported === true;
        return inspected.candidate;
      })();
      if (found && !valid.some(item => item.path.toLowerCase() === found.path.toLowerCase())) valid.push(found);
      if (valid.length === 8) { incomplete ||= index < unique.length - 1; break; }
    }
    const selected = unique.find(path => path.toLowerCase() === preferredPath?.toLowerCase() || path.toLowerCase() === forcedPath?.toLowerCase());
    const selectedCandidate = selected ? valid.find(item => item.path.toLowerCase() === selected.toLowerCase()) : undefined;
    const state = selectedCandidate ? 'available' : valid.length === 1 && !incomplete ? 'available' : valid.length > 1 || incomplete ? 'ambiguous' : 'unavailable';
    return { state, candidates: valid, selected_path: selectedCandidate?.path ?? (valid.length === 1 && !incomplete ? valid[0]!.path : null),
      diagnostic: state === 'available' ? null : state === 'ambiguous' ? incomplete ? 'TOOL_DISCOVERY_INCOMPLETE' : 'TOOL_SELECTION_AMBIGUOUS' : unsupportedGit ? 'GIT_VERSION_UNSUPPORTED' : valid.length === 0 ? 'TOOL_NOT_FOUND' : 'TOOL_UNAVAILABLE',
      recovery: state === 'available' ? '' : state === 'unavailable' && unsupportedGit ? `Instale ou selecione Git ${gitSafety.minimumVersion} ou superior com suporte a --no-lazy-fetch e execute nova detecção; a proteção contra fetch implícito não pode ser desativada.` : 'Selecione um executável válido ou instale a ferramenta e execute nova detecção.' };
  }

  return {
    detect: async (preferences, githubPath) => {
      const [git, maestri, omp, powershell, gh] = await Promise.all([
        detectOne('git', preferences.git.preferred_path), detectOne('maestri', preferences.maestri.preferred_path),
        detectOne('omp', preferences.omp.preferred_path), detectOne('powershell', preferences.powershell.preferred_path),
        detectOne('gh', null, githubPath),
      ]);
      return { git, maestri, omp, powershell, gh };
    },
    validate,
    stamp: async (preferences, paths) => {
      const result: ToolPreferences = structuredClone(preferences);
      for (const tool of ['git', 'maestri', 'omp', 'powershell'] as const) {
        if (!Object.prototype.hasOwnProperty.call(paths, tool)) continue;
        const path = paths[tool] ?? null;
        const verified = path === null ? null : await validate(path, tool);
        if (path !== null && !verified) throw new Error('TOOL_PREFERENCE_INVALID');
        result[tool] = { preferred_path: verified?.path ?? null, last_validated_at_ms: verified ? clock() : null };
      }
      return result;
    },
  };
}
