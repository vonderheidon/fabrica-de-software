import { stat as nativeStat } from 'node:fs/promises';
import { isAbsolute, win32 } from 'node:path';
import type { GitHubExecutableObservation, GitHubSetupDiagnostic, ToolObservation } from '#contracts';
import { observeGhVersion, type GitHubContext, type GitHubHostAccess } from './transport.js';

interface ExecutableFileInfo { isFile(): boolean }
interface Candidate { path: string; source: 'PATH' | 'GH_PATH' | 'saved' }
export interface GitHubExecutableValidation { observation: GitHubExecutableObservation; context: GitHubContext | null }
interface ResolverOptions {
  access?: GitHubHostAccess;
  initialExecutable?: string;
  environment?: () => NodeJS.ProcessEnv;
  stat?: (path: string) => Promise<ExecutableFileInfo>;
  observeVersion?: (context: GitHubContext) => Promise<ToolObservation>;
}

const maxCandidates = 256;
const discoveryBudgetMs = 12_000;
const observedCause = 'GH_VERSION_QUERY_FAILED';
const pathIsAbsolute = (value: string) => isAbsolute(value) || win32.isAbsolute(value);
const cleanQuote = (value: string) => value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

function diagnostic(code: string, message: string, recovery: string): GitHubSetupDiagnostic {
  return { code, message, recovery };
}

function candidates(environment: NodeJS.ProcessEnv, savedPath: string | null, initialExecutable?: string): { items: Candidate[]; truncated: boolean } {
  const list: Candidate[] = [];
  if (savedPath) list.push({ path: savedPath, source: 'saved' });
  for (const directory of (environment.PATH ?? '').split(';')) {
    const normalized = cleanQuote(directory);
    if (normalized) list.push({ path: win32.join(normalized, 'gh.exe'), source: 'PATH' });
  }
  if (environment.GH_PATH) list.push({ path: environment.GH_PATH, source: 'GH_PATH' });
  // Compatibility for explicitly composed hosts; normal startup uses the saved setting.
  if (initialExecutable) list.push({ path: initialExecutable, source: 'saved' });
  const seen = new Set<string>();
  const unique = list.filter(candidate => {
    const key = candidate.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { items: unique.slice(0, maxCandidates), truncated: unique.length > maxCandidates };
}

function noCandidate(state: 'not_found' | 'unavailable', diagnostics: GitHubSetupDiagnostic[]): GitHubExecutableValidation {
  return { observation: { state, path: null, version: null, diagnostics }, context: null };
}

/** Resolves GH paths without creating host authority from a binary path. */
export class GitHubExecutableResolver {
  private current: GitHubContext | null = null;
  private generation = 0;
  private pending: { generation: number; promise: Promise<GitHubExecutableValidation> } | null = null;
  private readonly validated = new Map<string, string>();
  private readonly environment: () => NodeJS.ProcessEnv;
  private readonly stat: (path: string) => Promise<ExecutableFileInfo>;
  private readonly version: (context: GitHubContext) => Promise<ToolObservation>;

  constructor(private readonly options: ResolverOptions = {}) {
    this.environment = options.environment ?? (() => process.env);
    this.stat = options.stat ?? (path => nativeStat(path));
    this.version = options.observeVersion ?? (context => observeGhVersion(context, 1_500));
  }

  private get access(): GitHubHostAccess | undefined {
    if (!this.options.access || this.options.access.kind !== 'windows_keyring' || !pathIsAbsolute(this.options.access.cwd)) return undefined;
    return this.options.access;
  }

  private async check(path: string): Promise<GitHubExecutableValidation> {
    const access = this.access;
    if (!access) return noCandidate('unavailable', [diagnostic('GITHUB_CONTEXT_UNAVAILABLE',
      'O contexto autorizado do GitHub CLI não está disponível.', 'Inicie a fábrica no host autorizado e consulte novamente.')]);
    if (!path || path !== path.trim() || !pathIsAbsolute(path) || !/\.exe$/i.test(path) || /[\x00-\x1f\x7f]/.test(path)) {
      return noCandidate('not_found', [diagnostic('GH_EXECUTABLE_PATH_INVALID',
        'O caminho do GitHub CLI não é um executável absoluto válido.', 'Selecione o arquivo gh.exe no host.')]);
    }
    try {
      const info = await this.stat(path);
      if (!info.isFile()) return noCandidate('not_found', [diagnostic('GH_EXECUTABLE_NOT_FOUND',
        'O caminho configurado não aponta para um arquivo gh.exe.', 'Selecione um executável existente ou instale o GitHub CLI e reinicie a fábrica.')]);
    } catch (error) {
      const systemCode = error && typeof error === 'object' && 'code' in error ? error.code : null;
      if (systemCode === 'ENOENT' || systemCode === 'ENOTDIR') {
        return noCandidate('not_found', [diagnostic('GH_EXECUTABLE_NOT_FOUND',
          'O caminho configurado não aponta para um arquivo gh.exe disponível.', 'Selecione um executável existente ou instale o GitHub CLI e reinicie a fábrica.')]);
      }
      return noCandidate('unavailable', [diagnostic('GH_CANDIDATE_STAT_FAILED',
        'O arquivo candidato do GitHub CLI não pôde ser inspecionado.', 'Confira o acesso ao executável no host e consulte novamente.')]);
    }
    const context: GitHubContext = { ...access, executable: path };
    const result = await this.version(context);
    if (result.state !== 'observed' || !result.version || result.cause === observedCause) {
      return noCandidate('unavailable', [diagnostic('GH_VERSION_QUERY_FAILED',
        'O candidato não respondeu à verificação gh --version.', 'Confira o executável e o contexto do host; selecione outro arquivo se necessário.')]);
    }
    this.validated.set(path.toLowerCase(), result.version);
    return { observation: { state: 'observed', path, version: result.version, diagnostics: [] }, context };
  }

  async validate(path: string): Promise<GitHubExecutableValidation> {
    return this.check(path);
  }

  async resolve(savedPath: string | null): Promise<GitHubExecutableValidation> {
    const access = this.access;
    if (!access) {
      this.generation++;
      this.current = null;
      return noCandidate('unavailable', [diagnostic('GITHUB_CONTEXT_UNAVAILABLE',
        'O contexto autorizado do GitHub CLI não está disponível.', 'Inicie a fábrica no host autorizado e consulte novamente.')]);
    }
    const generation = ++this.generation;
    this.current = null;
    const promise = (async (): Promise<GitHubExecutableValidation> => {
      const env = this.environment();
      const candidateList = candidates(env, savedPath, this.options.initialExecutable);
      const list = candidateList.items;
      const diagnostics: GitHubSetupDiagnostic[] = [];
      let existing = false;
      let inaccessible = false;
      let budgetExpired = false;
      let incompleteDiagnostic: GitHubSetupDiagnostic | null = null;
      const deadline = Date.now() + discoveryBudgetMs;
      for (const candidate of list) {
        if (Date.now() >= deadline) {
          budgetExpired = true;
          break;
        }
        const checked = await this.check(candidate.path);
        if (checked.observation.state === 'observed') {
          if (generation === this.generation) this.current = checked.context;
          return { ...checked, observation: { ...checked.observation, diagnostics } };
        }
        const code = checked.observation.diagnostics[0]?.code;
        if (code === 'GH_VERSION_QUERY_FAILED') {
          existing = true;
          diagnostics.push(diagnostic('GH_CANDIDATE_INVALID',
            'Um candidato do GitHub CLI existe, mas não passou por gh --version.', 'A busca continuará; se nenhum candidato funcionar, selecione outro executável.'));
        } else if (code === 'GH_EXECUTABLE_NOT_FOUND') {
          diagnostics.push(diagnostic('GH_CANDIDATE_NOT_FOUND',
            'Um caminho candidato do GitHub CLI não está mais disponível.', 'A busca continuará pelos demais caminhos configurados.'));
        } else if (code === 'GH_EXECUTABLE_PATH_INVALID') {
          diagnostics.push(diagnostic('GH_CANDIDATE_PATH_INVALID',
            'Um caminho candidato do GitHub CLI não é absoluto.', 'A busca continuará pelos demais caminhos configurados.'));
        } else inaccessible = true;
      }
      if (candidateList.truncated || budgetExpired) {
        inaccessible = true;
        incompleteDiagnostic = diagnostic('GH_DISCOVERY_INCOMPLETE',
          'A busca do GitHub CLI excedeu o limite local de candidatos ou tempo.',
          'Reduza os caminhos candidatos e consulte novamente; a observação não confirma a instalação.');
      }
      const state = existing || inaccessible ? 'unavailable' : 'not_found';
      const finalDiagnostic = state === 'not_found'
        ? diagnostic('GITHUB_CLI_NOT_FOUND', 'Não foi possível localizar o GitHub CLI no PATH, GH_PATH ou caminho salvo.',
          'Instale o GitHub CLI; se ele acabou de ser instalado, reinicie a fábrica e execute nova detecção. Se necessário, localize gh.exe manualmente.')
        : diagnostic('GITHUB_CLI_UNAVAILABLE', 'Nenhum candidato do GitHub CLI pôde ser confirmado.',
          'Confira o contexto do host; corrija ou selecione um gh.exe válido e execute nova detecção.');
      const result = noCandidate(state, [...diagnostics.slice(0, incompleteDiagnostic ? 98 : 99),
        ...(incompleteDiagnostic ? [incompleteDiagnostic] : []), finalDiagnostic]);
      if (generation === this.generation) this.current = null;
      return result;
    })();
    this.pending = { generation, promise };
    try { return await promise; }
    finally { if (this.pending?.generation === generation) this.pending = null; }
  }

  async contextForUse(savedPath: string | null): Promise<GitHubContext | null> {
    if (this.current) return this.current;
    const pending = this.pending?.promise;
    const resolution = pending ? await pending : await this.resolve(savedPath);
    return this.current ?? resolution.context;
  }

  activate(observation: GitHubExecutableObservation): void {
    if (observation.state !== 'observed' || !this.access ||
        this.validated.get(observation.path.toLowerCase()) !== observation.version) return;
    this.generation++;
    this.current = { ...this.access, executable: observation.path };
  }

  currentContext(): GitHubContext | null {
    return this.current;
  }
}
