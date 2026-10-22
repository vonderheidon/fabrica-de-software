import { execFile, spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import type { GitHubDiagnostic, GitHubQueryResult, GitHubSetupDiagnostic, ToolObservation } from '#contracts';

export interface GitHubHostAccess {
  /** Supplied only by trusted host composition; an executable path cannot create this capability. */
  kind: 'windows_keyring';
  cwd: string;
}

export interface GitHubContext extends GitHubHostAccess {
  executable: string;
}
export interface CommandResponse { exitCode: number; stdout: string }
export type GhRunner = (input: string, onSend?: () => void, responseBytes?: number) => Promise<CommandResponse>;
export const queryLimits = Object.freeze({ timeoutMs: 15_000, responseBytes: 4_194_304, pages: 100, pageSize: 100, operationQueries: 250, operationBytes: 16_777_216 });

export class GitHubRunnerError extends Error {
  constructor(readonly code: 'CONTEXT_UNAVAILABLE' | 'CLI_UNAVAILABLE') { super(code); }
}

type GhCommandExecutor = (context: GitHubContext, args: readonly string[], maxBuffer: number, timeoutMs: number) => Promise<CommandResponse>;

function commandEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: '', GH_DEBUG: '' };
}

function execute(context: GitHubContext, args: readonly string[], maxBuffer: number, timeoutMs: number): Promise<CommandResponse> {
  return new Promise(resolve => {
    if (context.kind !== 'windows_keyring' || !isAbsolute(context.cwd) || !isAbsolute(context.executable)) {
      resolve({ exitCode: -1, stdout: '' });
      return;
    }
    try {
      execFile(context.executable, [...args], {
        cwd: context.cwd, shell: false, windowsHide: true, timeout: timeoutMs, maxBuffer, encoding: 'utf8', env: commandEnvironment(),
      }, (error, stdout) => resolve({ exitCode: error ? 1 : 0, stdout: error ? '' : stdout }));
    } catch {
      resolve({ exitCode: -1, stdout: '' });
    }
  });
}

export async function queryGhAuthentication(context?: GitHubContext | null, runCommand: GhCommandExecutor = execute): Promise<{
  state: 'observed' | 'unavailable';
  accounts: Array<{ login: string; active: boolean; valid: boolean }>;
  diagnostics: GitHubSetupDiagnostic[];
}> {
  const unavailable = (code: string, message: string, recovery: string) => ({
    state: 'unavailable' as const, accounts: [], diagnostics: [{ code, message, recovery }],
  });
  if (!context || context.kind !== 'windows_keyring' || !isAbsolute(context.cwd) || !isAbsolute(context.executable)) {
    return unavailable('GITHUB_CONTEXT_UNAVAILABLE', 'O contexto autorizado do GitHub CLI não está disponível.', 'Inicie a fábrica no host autorizado e consulte novamente.');
  }
  const response = await runCommand(context, ['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'], 262_144, queryLimits.timeoutMs);
  if (response.exitCode !== 0) {
    return unavailable('GITHUB_AUTH_STATUS_UNAVAILABLE', 'O GitHub CLI não concluiu a consulta de autenticação.', 'Confira o contexto do host e a conectividade; consulte novamente sem refazer login pela fábrica.');
  }
  try {
    const payload: unknown = JSON.parse(response.stdout);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('RESPONSE_INVALID');
    const hosts = (payload as Record<string, unknown>).hosts;
    if (!hosts || typeof hosts !== 'object' || Array.isArray(hosts)) throw new Error('RESPONSE_INVALID');
    const githubAccounts = (hosts as Record<string, unknown>)['github.com'];
    if (githubAccounts === undefined || (Array.isArray(githubAccounts) && githubAccounts.length === 0)) return { state: 'observed', accounts: [], diagnostics: [
      { code: 'GITHUB_AUTH_REQUIRED', message: 'O GitHub CLI não reportou contas autenticadas em github.com.', recovery: 'Autentique ou ative uma conta no GitHub CLI fora da fábrica e consulte novamente.' },
    ] };
    if (!Array.isArray(githubAccounts) || githubAccounts.length > 100) throw new Error('RESPONSE_INVALID');
    const accounts: Array<{ login: string; active: boolean; valid: boolean }> = [];
    const seen = new Set<string>();
    for (const entry of githubAccounts) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('RESPONSE_INVALID');
      const account = entry as Record<string, unknown>;
      if (account.host !== 'github.com' || typeof account.login !== 'string' ||
          !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(account.login) ||
          typeof account.active !== 'boolean' || !['success', 'error', 'timeout'].includes(String(account.state))) {
        throw new Error('RESPONSE_INVALID');
      }
      const key = account.login.toLowerCase();
      if (seen.has(key)) throw new Error('RESPONSE_INVALID');
      seen.add(key);
      // In JSON mode the CLI can exit successfully while individual account checks fail.
      accounts.push({ login: account.login, active: account.active, valid: account.state === 'success' });
    }
    const diagnostics = accounts.some(account => !account.valid)
      ? [{ code: 'GITHUB_AUTH_NEEDS_ATTENTION', message: 'Uma ou mais contas do GitHub CLI precisam de regularização.', recovery: 'Ative a conta ou regularize a autenticação no GitHub CLI fora da fábrica e consulte novamente.' }]
      : [];
    return { state: 'observed', accounts, diagnostics };
  } catch {
    return unavailable('GITHUB_AUTH_RESPONSE_INVALID', 'A resposta de autenticação do GitHub CLI não pôde ser validada.', 'Confira a versão do CLI e consulte novamente.');
  }
}

export async function observeGhVersion(context?: GitHubContext, timeoutMs: number = queryLimits.timeoutMs): Promise<ToolObservation> {
  const base = { tool: 'gh' as const, observedAtMs: Date.now(), affectedRequirements: ['RF-22'] };
  if (!context || context.kind !== 'windows_keyring' || !isAbsolute(context.executable) || !isAbsolute(context.cwd)) return { ...base, state: 'unavailable', version: null, cause: 'CONTEXT_UNAVAILABLE' };
  const response = await execute(context, ['--version'], 4096, timeoutMs);
  const version = /^gh version ([0-9]+\.[0-9]+\.[0-9]+)(?:[ \r\n]|$)/.exec(response.stdout)?.[1];
  return response.exitCode === 0 && version
    ? { ...base, state: 'observed', version, cause: null, affectedRequirements: [] }
    : { ...base, state: 'unavailable', version: null, cause: 'GH_VERSION_QUERY_FAILED' };
}

export function createGhRunner(context: GitHubContext): GhRunner {
  return (input, onSend, responseBytes = queryLimits.responseBytes) => new Promise((resolve, reject) => {
    if (context.kind !== 'windows_keyring' || !isAbsolute(context.executable) || !isAbsolute(context.cwd)) {
      reject(new Error('CONTEXT_UNAVAILABLE'));
      return;
    }
    const child = spawn(context.executable, ['api', 'graphql', '--hostname', 'github.com', '--method', 'POST', '--include', '--input', '-'], {
      cwd: context.cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: '', GH_DEBUG: '' },
    });
    let size = 0;
    const chunks: Buffer[] = [];
    let failed = false;
    const fail = () => { failed = true; child.kill(); reject(new Error('CLI_UNAVAILABLE')); };
    const timer = setTimeout(fail, queryLimits.timeoutMs);
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > responseBytes) fail();
      else chunks.push(chunk);
    });
    // stderr can contain credentials, request fragments or raw provider errors. Never expose or persist it.
    child.stderr.on('data', () => { /* drain without retaining */ });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (!failed) resolve({ exitCode: exitCode ?? -1, stdout: Buffer.concat(chunks).toString('utf8') });
    });
    child.once('spawn', () => {
      onSend?.();
      child.stdin.end(input, 'utf8');
    });
  });
}

const messages = {
  CONTEXT_UNAVAILABLE: ['Authorized Windows keyring context is unavailable.', 'Run the controller in the authorized host context.'],
  AUTHENTICATION_INVALID: ['GitHub authentication is absent or invalid.', 'Restore authentication outside the factory and query again.'],
  RATE_LIMITED: ['GitHub requested a delay before further queries.', 'Wait until retryAtMs and query again.'],
  ACCESS_DENIED: ['GitHub denied access to the requested resource.', 'Check account permissions outside the factory.'],
  NOT_FOUND_OR_INACCESSIBLE: ['The requested GitHub reference is absent or inaccessible.', 'Verify the exact reference and account access.'],
  RESPONSE_INVALID: ['GitHub returned an invalid or unsupported response.', 'Query again and verify CLI/API compatibility.'],
  CLI_UNAVAILABLE: ['The GitHub CLI query could not finish.', 'Verify the executable and host context; query again.'],
  QUERY_FAILED: ['GitHub could not complete the query.', 'Check service availability and account permissions.'],
  QUERY_LIMIT: ['The query reached its configured page limit.', 'Narrow the query; do not dispatch from partial results.'],
  PAGINATION_INVALID: ['GitHub returned inconsistent pagination.', 'Repeat the query; do not dispatch from partial results.'],
  REFERENCE_INACCESSIBLE: ['A referenced object is inaccessible.', 'Verify access; do not dispatch from partial results.'],
  STATUS_FIELD_INACCESSIBLE: ['The configured Status field is absent or inaccessible.', 'Review the exact field ID; no substitute was selected.'],
  STATUS_OPTION_INACCESSIBLE: ['A configured Status option is absent or inaccessible.', 'Review the exact option IDs; no substitute was selected.'],
  INPUT_INVALID: ['The query input is invalid.', 'Correct the reference or query parameters.'],
  BRANCH_NOT_FOUND: ['The selected GitHub branch does not exist or is inaccessible.', 'Select an existing branch and verify repository permissions.'],
} satisfies Record<GitHubDiagnostic['code'], [string, string]>;

export function diagnostic(code: GitHubDiagnostic['code']): GitHubDiagnostic {
  const [message, recovery] = messages[code];
  return { code, message, recovery };
}
export function result<T>(state: GitHubQueryResult<T>['state'], data: T | null, codes: GitHubDiagnostic['code'][] = [], retryAtMs: number | null = null): GitHubQueryResult<T> {
  return { state, data, diagnostics: [...new Set(codes)].map(diagnostic), retryAtMs };
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RESPONSE_INVALID');
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('RESPONSE_INVALID');
  return value;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('RESPONSE_INVALID');
  return value;
}

export class GraphQLReader {
  constructor(private readonly run: GhRunner | undefined, private readonly now: () => number = Date.now,
    private readonly throttle = { retryAtMs: 0 }, private readonly budget?: { queries: number; bytes: number }) {}

  scope(): GraphQLReader {
    return new GraphQLReader(this.run, this.now, this.throttle, { queries: queryLimits.operationQueries, bytes: queryLimits.operationBytes });
  }

  async query(query: string, variables: Record<string, unknown>, onSend?: () => void, responsePages: 1 | 2 | 3 = 1): Promise<GitHubQueryResult<Record<string, unknown>>> {
    if (!this.run) return result('context_unavailable', null, ['CONTEXT_UNAVAILABLE']);
    if (this.now() < this.throttle.retryAtMs) return result('rate_limited', null, ['RATE_LIMITED'], this.throttle.retryAtMs);
    if (this.budget && (this.budget.queries <= 0 || this.budget.bytes <= 0)) return result('unavailable', null, ['QUERY_LIMIT']);
    if (this.budget) this.budget.queries--;
    let response: CommandResponse;
    try { response = await this.run(JSON.stringify({ query, variables }), onSend, queryLimits.responseBytes * responsePages); }
    catch (error) {
      if (error instanceof GitHubRunnerError && error.code === 'CONTEXT_UNAVAILABLE') return result('context_unavailable', null, ['CONTEXT_UNAVAILABLE']);
      return result('unavailable', null, ['CLI_UNAVAILABLE']);
    }
    if (this.budget) {
      this.budget.bytes -= Buffer.byteLength(response.stdout, 'utf8');
      if (this.budget.bytes < 0) return result('unavailable', null, ['QUERY_LIMIT']);
    }
    if (response.exitCode === 4) return result('authentication_invalid', null, ['AUTHENTICATION_INVALID']);
    try {
      const match = /^HTTP\/[\d.]+\s+(\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(response.stdout);
      if (!match) return result('unavailable', null, [response.exitCode === 0 ? 'RESPONSE_INVALID' : 'QUERY_FAILED']);
      const status = Number(match[1]);
      const headers = new Map((match[2] ?? '').split(/\r?\n/).map((line) => {
        const at = line.indexOf(':');
        return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()] as const;
      }));
      if (status === 401) return result('authentication_invalid', null, ['AUTHENTICATION_INVALID']);
      let body: Record<string, unknown> = {};
      try { body = object(JSON.parse(match[3] ?? '')); }
      catch { if (status < 400) return result('unavailable', null, ['RESPONSE_INVALID']); }
      const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
      const errors = Array.isArray(body.errors) ? body.errors.filter(record) : [];
      const codes = errors.map((error) => error.type ?? (record(error.extensions) ? error.extensions.code : undefined));
      const rateLimited = status === 429 || (status === 403 && (headers.has('retry-after') || headers.get('x-ratelimit-remaining') === '0')) || codes.some((code) => code === 'RATE_LIMITED' || code === 'RATE_LIMIT');
      if (rateLimited) {
        const now = this.now();
        const retry = headers.get('retry-after');
        const retryTime = retry ? (/^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry)) : 0;
        const reset = Number(headers.get('x-ratelimit-reset') ?? 0) * 1000;
        const rate = record(body.data) ? body.data.rateLimit : null;
        const graphReset = record(rate) && typeof rate.resetAt === 'string' ? Date.parse(rate.resetAt) : 0;
        const hints = [retryTime, reset, graphReset].filter((time) => Number.isSafeInteger(time) && time > now);
        this.throttle.retryAtMs = hints.length ? Math.max(...hints) : now + 60_000;
        return result('rate_limited', null, ['RATE_LIMITED'], this.throttle.retryAtMs);
      }
      if (status === 403) return result('inaccessible', null, ['ACCESS_DENIED']);
      if (status === 404) return result('inaccessible', null, ['NOT_FOUND_OR_INACCESSIBLE']);
      if (status < 200 || status >= 300) return result('unavailable', null, ['QUERY_FAILED']);
      if (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length !== errors.length)) return result('unavailable', null, ['RESPONSE_INVALID']);
      const data = body.data === null || body.data === undefined ? null : object(body.data);
      if (errors.length) {
        if (codes.includes('UNAUTHENTICATED')) return result('authentication_invalid', null, ['AUTHENTICATION_INVALID']);
        const inaccessible = codes.every((code) => code === 'FORBIDDEN' || code === 'NOT_FOUND');
        return result(data ? 'partial' : inaccessible ? 'inaccessible' : 'unavailable', data, [inaccessible ? 'REFERENCE_INACCESSIBLE' : 'QUERY_FAILED']);
      }
      if (response.exitCode !== 0 || !data) return result('unavailable', null, ['RESPONSE_INVALID']);
      return result('complete', data);
    } catch { return result('unavailable', null, ['RESPONSE_INVALID']); }
  }
}

export async function collect<T>(reader: GraphQLReader, query: string, variables: Record<string, unknown>, select: (data: Record<string, unknown>) => unknown, decode: (node: Record<string, unknown>) => T, identity: (node: Record<string, unknown>) => string | null = (node) => string(node.id), firstPage?: GitHubQueryResult<Record<string, unknown>>): Promise<GitHubQueryResult<T[]>> {
  const items: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  const ids = new Set<string>();
  const notes: GitHubDiagnostic['code'][] = [];
  for (let page = 0; page < queryLimits.pages; page++) {
    const response = page === 0 && firstPage ? firstPage : await reader.query(query, { ...variables, cursor });
    notes.push(...response.diagnostics.map((entry) => entry.code));
    if (!response.data) return result(items.length ? 'partial' : response.state, items.length ? items : null, notes, response.retryAtMs);
    try {
      const selected = select(response.data);
      if (selected === null) return result(items.length ? 'partial' : 'inaccessible', items.length ? items : null, [...notes, 'NOT_FOUND_OR_INACCESSIBLE']);
      const connection = object(selected);
      if (!Array.isArray(connection.nodes)) throw new Error('RESPONSE_INVALID');
      for (const node of connection.nodes) {
        if (node === null) { notes.push('REFERENCE_INACCESSIBLE'); continue; }
        const record = object(node);
        const id = identity(record);
        if (id !== null && ids.has(id)) { notes.push('PAGINATION_INVALID'); continue; }
        items.push(decode(record));
        if (id !== null) ids.add(id);
      }
      const info = object(connection.pageInfo);
      const more = boolean(info.hasNextPage);
      if (response.state !== 'complete') return result('partial', items, notes, response.retryAtMs);
      if (!more) return result(notes.length ? 'partial' : 'complete', items, notes);
      const next = string(info.endCursor);
      if (seen.has(next)) return result('partial', items, [...notes, 'PAGINATION_INVALID']);
      seen.add(next);
      cursor = next;
    } catch { return result(items.length ? 'partial' : 'unavailable', items.length ? items : null, [...notes, 'RESPONSE_INVALID']); }
  }
  return result('partial', items, [...notes, 'QUERY_LIMIT']);
}
