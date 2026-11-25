import { execFile, spawn } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
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
/** @internal Context shared by authorization preparation and dependent reads. */
export interface GitHubBeforeSendContext {
  signal: AbortSignal;
  deadlineMonotonicMs: number;
  assertActive(): void;
}
/** @internal Query controls passed only to the host runner. */
export interface GitHubRunnerControl extends GitHubBeforeSendContext {
  onLifecycle(lifecycle: GitHubRunnerLifecycle): void;
}
/** @internal Final query argument; it is not an HTTP or DTO contract. */
export interface GitHubQueryOptions {
  beforeSend?: (context: GitHubBeforeSendContext) => void | Promise<void>;
  signal?: AbortSignal;
  deadlineMonotonicMs?: number;
}
export interface GitHubRateLimitSnapshot { limit: number; remaining: number; resetAtMs: number | null }
type GitHubThrottleState = { retryAtMs: number; rateLimit?: GitHubRateLimitSnapshot };
export type GhRunner = (input: string, onSend?: () => void, responseBytes?: number, control?: GitHubRunnerControl) => Promise<CommandResponse>;
interface PreparedRunner { run: GhRunner; assertCurrent(): void }
type GhRunnerPreparer = (context: GitHubBeforeSendContext, input: string) => Promise<PreparedRunner>;
export const queryLimits = Object.freeze({ timeoutMs: 15_000, responseBytes: 4_194_304, pages: 100, pageSize: 100, operationQueries: 250, operationBytes: 16_777_216 });

type QueryStopReason = 'deadline' | 'cancelled';
const deadlineSignalReason = Object.freeze({ kind: 'github-query-deadline' });
const cancelledSignalReason = Object.freeze({ kind: 'github-query-cancelled' });
class QueryStageStopped extends Error {
  constructor(readonly reason: QueryStopReason) { super(reason); }
}
interface QueryStage {
  controller: AbortController;
  admission: GraphQLAdmission;
  deadlineMonotonicMs: number;
  reason: QueryStopReason | null;
  stopped: Promise<QueryStopReason>;
  stop(reason: QueryStopReason): void;
  startDeadline(startedAtMonotonicMs: number): void;
  assertActive(): void;
  dispose(): void;
}
interface OperationDeadline { deadlineMonotonicMs: number | null }
const queryStageStorage = new AsyncLocalStorage<QueryStage>();
const trackedLifecycles = new WeakSet<GitHubRunnerLifecycle>();

function stopReasonForSignal(signal: AbortSignal): QueryStopReason {
  return signal.reason === deadlineSignalReason ? 'deadline' : 'cancelled';
}

function stopResult(reason: QueryStopReason): GitHubQueryResult<Record<string, unknown>> {
  return result('unavailable', null, [reason === 'deadline' ? 'QUERY_LIMIT' : 'QUERY_FAILED']);
}

export class GitHubRunnerError extends Error {
  constructor(readonly code: 'CONTEXT_UNAVAILABLE' | 'CLI_UNAVAILABLE', lifecycle?: GitHubRunnerLifecycle) {
    super(code);
    if (lifecycle) runnerLifecycles.set(this, lifecycle);
  }
}

/** @internal Lifecycle data for transport control; it is not part of CommandResponse. */
export interface GitHubRunnerLifecycle {
  readonly sent: boolean;
  readonly killRequested: boolean;
  readonly killFailed: boolean;
  readonly physicallyClosed: boolean;
  readonly completion: Promise<void>;
}

const runnerLifecycles = new WeakMap<GitHubRunnerError, GitHubRunnerLifecycle>();

/** @internal Lets transport controls retain capacity until a sent child emits close. */
export function getGitHubRunnerLifecycle(error: unknown): GitHubRunnerLifecycle | null {
  return error instanceof GitHubRunnerError ? runnerLifecycles.get(error) ?? null : null;
}

interface AdmissionOutcome { permit: AdmissionPermit | null; reason: QueryStopReason | null }
interface AdmissionWaiter {
  stage: QueryStage;
  deadlineMonotonicMs: number;
  resolve(outcome: AdmissionOutcome): void;
  timer: ReturnType<typeof setTimeout> | undefined;
  onAbort: () => void;
  settled: boolean;
}

class AdmissionPermit {
  active = true;
  private rootFinished = false;
  private released = false;
  private pendingLifecycle: GitHubRunnerLifecycle | null = null;

  constructor(private readonly releaseCapacity: () => void) {}

  track(lifecycle: GitHubRunnerLifecycle): void {
    if (lifecycle.physicallyClosed || this.pendingLifecycle === lifecycle) return;
    this.pendingLifecycle = lifecycle;
    const closed = () => {
      if (this.pendingLifecycle === lifecycle) this.pendingLifecycle = null;
      if (this.rootFinished) this.release();
    };
    void lifecycle.completion.then(closed, closed);
  }

  waitForPhysicalClose(stage: QueryStage, monotonicNow: () => number): boolean | Promise<boolean> {
    const lifecycle = this.pendingLifecycle;
    if (!lifecycle || lifecycle.physicallyClosed) return true;
    const timeoutMs = Math.min(queryLimits.timeoutMs, Math.max(0, stage.deadlineMonotonicMs - monotonicNow()));
    if (timeoutMs <= 0) return false;
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => settle(false), timeoutMs);
      const onAbort = () => settle(false);
      const settle = (closed: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stage.controller.signal.removeEventListener('abort', onAbort);
        resolve(closed || lifecycle.physicallyClosed);
      };
      stage.controller.signal.addEventListener('abort', onAbort, { once: true });
      void lifecycle.completion.then(() => settle(true), () => settle(true));
      if (lifecycle.physicallyClosed) settle(true);
      else if (stage.controller.signal.aborted) settle(false);
    });
  }

  finishRoot(): void {
    if (this.rootFinished) return;
    this.active = false;
    this.rootFinished = true;
    if (!this.pendingLifecycle || this.pendingLifecycle.physicallyClosed) this.release();
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    this.releaseCapacity();
  }
}

class GraphQLAdmission {
  private occupied = 0;
  private readonly waiters: AdmissionWaiter[] = [];

  constructor(private readonly monotonicNow: () => number) {}

  acquire(stage: QueryStage): AdmissionOutcome | Promise<AdmissionOutcome> {
    try { stage.assertActive(); }
    catch (error) {
      if (error instanceof QueryStageStopped) return { permit: null, reason: error.reason };
      throw error;
    }
    const now = this.monotonicNow();
    const deadlineMonotonicMs = Math.min(now + queryLimits.timeoutMs, stage.deadlineMonotonicMs);
    if (now >= deadlineMonotonicMs) return { permit: null, reason: 'deadline' };
    this.drain();
    if (this.occupied < 3 && this.waiters.length === 0) return { permit: this.grant(stage), reason: null };
    return new Promise(resolve => {
      const waiter: AdmissionWaiter = {
        stage, deadlineMonotonicMs, resolve, timer: undefined, onAbort: () => {}, settled: false,
      };
      waiter.onAbort = () => {
        const reason = stage.reason ?? 'cancelled';
        this.settle(waiter, { permit: null, reason });
        this.drain();
      };
      waiter.timer = setTimeout(() => {
        this.settle(waiter, { permit: null, reason: 'deadline' });
        this.drain();
      }, Math.max(0, deadlineMonotonicMs - this.monotonicNow()));
      stage.controller.signal.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiters.push(waiter);
      if (stage.controller.signal.aborted) waiter.onAbort();
      else this.drain();
    });
  }

  private grant(stage: QueryStage): AdmissionPermit {
    stage.startDeadline(this.monotonicNow());
    this.occupied++;
    return new AdmissionPermit(() => {
      this.occupied--;
      this.drain();
    });
  }

  private settle(waiter: AdmissionWaiter, outcome: AdmissionOutcome): void {
    if (waiter.settled) return;
    waiter.settled = true;
    if (waiter.timer !== undefined) clearTimeout(waiter.timer);
    waiter.stage.controller.signal.removeEventListener('abort', waiter.onAbort);
    const index = this.waiters.indexOf(waiter);
    if (index >= 0) this.waiters.splice(index, 1);
    waiter.resolve(outcome);
  }

  private drain(): void {
    while (this.occupied < 3 && this.waiters.length > 0) {
      const waiter = this.waiters[0]!;
      if (waiter.settled) { this.waiters.shift(); continue; }
      if (waiter.stage.reason !== null) {
        this.settle(waiter, { permit: null, reason: waiter.stage.reason });
        continue;
      }
      if (this.monotonicNow() >= waiter.deadlineMonotonicMs) {
        this.settle(waiter, { permit: null, reason: 'deadline' });
        continue;
      }
      this.settle(waiter, { permit: this.grant(waiter.stage), reason: null });
    }
  }
}

interface SerialLane { tail: Promise<void> }
interface AuthorizationExecution {
  admission: GraphQLAdmission;
  permit: AdmissionPermit;
  stage: QueryStage;
  lane: SerialLane;
  active: boolean;
}

const authorizationStorage = new AsyncLocalStorage<AuthorizationExecution>();

async function runSerial<T>(lane: SerialLane, operation: () => Promise<T>): Promise<T> {
  const previous = lane.tail;
  let release!: () => void;
  lane.tail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}

function isGraphQLRead(query: string): boolean {
  let index = query.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (index < query.length) {
    const character = query[index]!;
    if (/\s|,/u.test(character)) { index++; continue; }
    if (character === '#') {
      const lineEnd = query.indexOf('\n', index);
      if (lineEnd < 0) return false;
      index = lineEnd + 1;
      continue;
    }
    break;
  }
  if (query[index] === '{') return true;
  const operation = /^[_A-Za-z][_0-9A-Za-z]*/u.exec(query.slice(index))?.[0];
  return operation === 'query';
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
  return (input, onSend, responseBytes = queryLimits.responseBytes, control) => new Promise((resolve, reject) => {
    try { control?.assertActive(); }
    catch (error) { reject(error); return; }
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
    let sent = false;
    let killRequested = false;
    let killFailed = false;
    let physicallyClosed = false;
    let settled = false;
    let cleaned = false;
    let resolvePhysicalClose!: () => void;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const completion = new Promise<void>(resolveClose => { resolvePhysicalClose = resolveClose; });
    const lifecycle: GitHubRunnerLifecycle = Object.freeze({
      get sent() { return sent; },
      get killRequested() { return killRequested; },
      get killFailed() { return killFailed; },
      get physicallyClosed() { return physicallyClosed; },
      completion,
    });
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort) control?.signal.removeEventListener('abort', onAbort);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      killRequested = true;
      try { child.kill(); } catch { killFailed = true; }
      reject(new GitHubRunnerError('CLI_UNAVAILABLE', lifecycle));
    };
    timer = setTimeout(fail, queryLimits.timeoutMs);
    onAbort = fail;
    control?.signal.addEventListener('abort', onAbort, { once: true });
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > responseBytes) fail();
      else chunks.push(chunk);
    });
    // stderr can contain credentials, request fragments or raw provider errors. Never expose or persist it.
    child.stderr.on('data', () => { /* drain without retaining */ });
    child.on('close', (exitCode) => {
      cleanup();
      if (physicallyClosed) return;
      physicallyClosed = true;
      resolvePhysicalClose();
      if (!settled) {
        settled = true;
        resolve({ exitCode: exitCode ?? -1, stdout: Buffer.concat(chunks).toString('utf8') });
      }
    });
    try { control?.onLifecycle(lifecycle); }
    catch { fail(); }
    if (control?.signal.aborted) fail();
    child.once('spawn', () => {
      if (settled) return;
      try {
        control?.assertActive();
        sent = true;
        onSend?.();
        child.stdin.end(input, 'utf8');
      } catch { fail(); }
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
  STATUS_MAPPING_INCOMPATIBLE: ['The observed Status options do not match the approved V3 names, order, and IDs.', 'Select the Status field again and map each approved V3 option to its observed ID.'],
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
/** Sanitized provider failure for a mutation. Never carries stderr, headers, variables or request content. */
export interface GitHubProviderError { reason: string; message: string }
/** Diagnostic-only view: the message never enters results, effects, storage or HTTP responses. */
export interface GitHubProviderErrorObservation extends GitHubProviderError { operationId: string | null }
/** Mutation results expose only the reason code derived from GitHub's error type or HTTP status. */
export type GitHubMutationQueryResult = GitHubQueryResult<Record<string, unknown>> & { provider?: { reason: string } };
const providerMessageLimit = 1024;
function providerText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/gu, '[redacted]')
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 300);
}
function providerCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.toUpperCase().replace(/[^A-Z0-9]+/gu, '_').replace(/^_+|_+$/gu, '').slice(0, 100);
  return code ? `GITHUB_${code}` : null;
}
export function providerError(status: number, body: Record<string, unknown>): GitHubProviderError {
  const errors = Array.isArray(body.errors) ? body.errors.filter((error): error is Record<string, unknown> => error !== null && typeof error === 'object' && !Array.isArray(error)) : [];
  const types = errors.map(error => error.type ?? (error.extensions && typeof error.extensions === 'object' ? (error.extensions as Record<string, unknown>).code : undefined));
  const reason = (status < 200 || status >= 300 ? `GITHUB_HTTP_${status}` : null) ?? types.map(providerCode).find(code => code !== null) ?? 'GITHUB_GRAPHQL_ERROR';
  const messages = errors.slice(0, 3).map(error => providerText(error.message)).filter(Boolean);
  if (!messages.length) { const fallback = providerText(body.message); if (fallback) messages.push(fallback); }
  return { reason, message: (messages.join(' | ') || `GitHub returned HTTP ${status} without an error message.`).slice(0, providerMessageLimit) };
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
    private readonly throttle: GitHubThrottleState = { retryAtMs: 0 }, private readonly budget?: { queries: number; bytes: number },
    private readonly physicalRuns: Set<GitHubRunnerLifecycle> = new Set(), private readonly monotonicNow: () => number = () => performance.now(),
    private readonly admission = new GraphQLAdmission(monotonicNow), private readonly prepareRunner?: GhRunnerPreparer,
    private readonly operationDeadline?: OperationDeadline,
    private readonly observeAdmissionWaitMs?: (durationMs: number) => void,
    private readonly observeProviderError?: (observation: GitHubProviderErrorObservation) => void) {}

  scope(): GraphQLReader {
    return new GraphQLReader(this.run, this.now, this.throttle, { queries: queryLimits.operationQueries, bytes: queryLimits.operationBytes },
      this.physicalRuns, this.monotonicNow, this.admission, this.prepareRunner, this.operationDeadline ?? { deadlineMonotonicMs: null },
      this.observeAdmissionWaitMs, this.observeProviderError);
  }

  /** @internal Sent children remain counted until their physical close event arrives. */
  get pendingPhysicalSends(): number {
    return [...this.physicalRuns].filter(lifecycle => lifecycle.sent && !lifecycle.physicallyClosed).length;
  }

  getRateLimitSnapshot(): GitHubRateLimitSnapshot | null {
    const snapshot = this.throttle.rateLimit;
    return snapshot?.resetAtMs !== null && snapshot?.resetAtMs !== undefined && snapshot.resetAtMs <= this.now() ? null : snapshot ?? null;
  }

  private recordRateLimit(limitValue: unknown, remainingValue: unknown, resetAtMs: number | null): void {
    const limit = Number(limitValue);
    const remaining = Number(remainingValue);
    if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(remaining) || remaining < 0 || remaining > limit) return;
    const previous = this.throttle.rateLimit;
    if (previous?.resetAtMs !== null && previous?.resetAtMs !== undefined && resetAtMs !== null && resetAtMs < previous.resetAtMs) return;
    const sameWindow = previous?.resetAtMs === resetAtMs;
    this.throttle.rateLimit = { limit, remaining: sameWindow ? Math.min(previous.remaining, remaining) : remaining, resetAtMs };
  }

  private createStage(options: GitHubQueryOptions | undefined, operationDeadline: OperationDeadline): QueryStage {
    const currentStage = queryStageStorage.getStore();
    const inherited = currentStage?.admission === this.admission ? currentStage : undefined;
    const now = this.monotonicNow();
    const externalDeadline = options?.deadlineMonotonicMs === undefined ? undefined
      : Number.isFinite(options.deadlineMonotonicMs) ? options.deadlineMonotonicMs : now;
    const scopedDeadline = operationDeadline.deadlineMonotonicMs;
    const inheritedDeadline = inherited?.deadlineMonotonicMs;
    const initialDeadlines = [externalDeadline, scopedDeadline, inheritedDeadline].filter((deadline): deadline is number => deadline !== undefined && deadline !== null);
    let deadlineMonotonicMs = initialDeadlines.length > 0 ? Math.min(...initialDeadlines) : Number.POSITIVE_INFINITY;
    let executionDeadlineStarted = inherited !== undefined || scopedDeadline != null;
    const controller = new AbortController();
    const externalSignals = [...new Set([inherited?.controller.signal, options?.signal].filter((signal): signal is AbortSignal => signal !== undefined))];
    let resolveStopped!: (reason: QueryStopReason) => void;
    const stopped = new Promise<QueryStopReason>(resolve => { resolveStopped = resolve; });
    let reason: QueryStopReason | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const listeners: Array<{ signal: AbortSignal; listener: () => void }> = [];
    const stop = (stopReason: QueryStopReason) => {
      if (reason !== null) return;
      reason = stopReason;
      controller.abort(stopReason === 'deadline' ? deadlineSignalReason : cancelledSignalReason);
      resolveStopped(stopReason);
    };
    const scheduleDeadline = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (Number.isFinite(deadlineMonotonicMs)) {
        timer = setTimeout(() => stop('deadline'), Math.max(0, deadlineMonotonicMs - this.monotonicNow()));
      } else timer = undefined;
    };
    const assertActive = () => {
      if (reason === null) {
        const aborted = externalSignals.find(signal => signal.aborted);
        if (aborted) stop(stopReasonForSignal(aborted));
        else if (this.monotonicNow() >= deadlineMonotonicMs) stop('deadline');
      }
      if (reason !== null) throw new QueryStageStopped(reason);
    };
    const stage: QueryStage = {
      controller, admission: this.admission, get deadlineMonotonicMs() { return deadlineMonotonicMs; }, get reason() { return reason; }, stopped,
      stop,
      startDeadline: startedAtMonotonicMs => {
        if (executionDeadlineStarted) return;
        executionDeadlineStarted = true;
        deadlineMonotonicMs = Math.min(startedAtMonotonicMs + 60_000, externalDeadline ?? Number.POSITIVE_INFINITY);
        if (operationDeadline.deadlineMonotonicMs === null) operationDeadline.deadlineMonotonicMs = deadlineMonotonicMs;
        scheduleDeadline();
      },
      assertActive,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (timer !== undefined) clearTimeout(timer);
        for (const { signal, listener } of listeners) signal.removeEventListener('abort', listener);
      },
    };
    for (const signal of externalSignals) {
      const listener = () => stop(stopReasonForSignal(signal));
      listeners.push({ signal, listener });
      signal.addEventListener('abort', listener, { once: true });
    }
    scheduleDeadline();
    return stage;
  }

  private trackPhysicalRun(lifecycle: GitHubRunnerLifecycle | null): void {
    if (!lifecycle?.sent || lifecycle.physicallyClosed) return;
    this.physicalRuns.add(lifecycle);
    if (trackedLifecycles.has(lifecycle)) return;
    trackedLifecycles.add(lifecycle);
    void lifecycle.completion.then(() => { this.physicalRuns.delete(lifecycle); });
  }

  query(query: string, variables: Record<string, unknown>, onSend?: () => void, responsePages: 1 | 2 | 3 = 1,
    options?: GitHubQueryOptions): Promise<GitHubMutationQueryResult> {
    const operationDeadline = this.operationDeadline ?? { deadlineMonotonicMs: null };
    const stage = this.createStage(options, operationDeadline);
    const authorization = authorizationStorage.getStore();
    if (authorization?.admission === this.admission) {
      if (!authorization.active || !authorization.permit.active) {
        try { stage.assertActive(); }
        catch (error) {
          stage.dispose();
          if (error instanceof QueryStageStopped) return Promise.resolve(stopResult(error.reason));
          throw error;
        }
        stage.dispose();
        return Promise.resolve(result('unavailable', null, ['QUERY_FAILED']));
      }
      if (!isGraphQLRead(query)) {
        stage.dispose();
        return Promise.resolve(result('unavailable', null, ['QUERY_FAILED']));
      }
      return runSerial(authorization.lane, () => queryStageStorage.run(authorization.stage,
        () => this.executeQuery(query, variables, onSend, responsePages, options, stage, authorization.permit, false)));
    }
    return this.executeQuery(query, variables, onSend, responsePages, options, stage, null, true);
  }

  private async executeQuery(query: string, variables: Record<string, unknown>, onSend: (() => void) | undefined,
    responsePages: 1 | 2 | 3, options: GitHubQueryOptions | undefined, stage: QueryStage,
    inheritedPermit: AdmissionPermit | null, ownsPermit: boolean): Promise<GitHubMutationQueryResult> {
    // Reads keep their contract shape; only mutation failures carry the sanitized provider detail.
    const mutation = !isGraphQLRead(query);
    const failed = (outcome: GitHubQueryResult<Record<string, unknown>>, provider: GitHubProviderError): GitHubMutationQueryResult => {
      if (!mutation) return outcome;
      const input = variables.input;
      const correlation = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>).clientMutationId : undefined;
      try {
        this.observeProviderError?.({ ...provider,
          operationId: typeof correlation === 'string' && /^[A-Za-z0-9-]{1,64}$/u.test(correlation) ? correlation : null });
      } catch { /* Optional diagnostics must not affect mutation outcomes. */ }
      return { ...outcome, provider: { reason: provider.reason } };
    };
    let permit = inheritedPermit;
    let reservationActive = false;
    let sendObserved = false;
    let reservedBytes = 0;
    let lifecycle: GitHubRunnerLifecycle | null = null;
    const refundIfNotSent = () => {
      if (!reservationActive) return;
      reservationActive = false;
      if (this.budget && !sendObserved && !lifecycle?.sent) {
        this.budget.queries++;
        this.budget.bytes += reservedBytes;
      }
    };
    try {
      try { stage.assertActive(); } catch (error) {
        if (error instanceof QueryStageStopped) return stopResult(error.reason);
        throw error;
      }
      if (!this.run && !this.prepareRunner) return result('context_unavailable', null, ['CONTEXT_UNAVAILABLE']);
      if (this.now() < this.throttle.retryAtMs) return result('rate_limited', null, ['RATE_LIMITED'], this.throttle.retryAtMs);
      if (this.budget && (this.budget.queries <= 0 || this.budget.bytes <= 0)) return result('unavailable', null, ['QUERY_LIMIT']);
      if (ownsPermit) {
        const admissionStartedAt = this.monotonicNow();
        const admissionRequest = this.admission.acquire(stage);
        const admission = admissionRequest instanceof Promise ? await admissionRequest : admissionRequest;
        try { this.observeAdmissionWaitMs?.(Math.max(0, this.monotonicNow() - admissionStartedAt)); }
        catch { /* Optional measurement must not affect admission or query results. */ }
        if (!admission.permit) { refundIfNotSent(); return stopResult(admission.reason ?? 'deadline'); }
        permit = admission.permit;
      }
      try { stage.assertActive(); } catch (error) {
        if (error instanceof QueryStageStopped) return stopResult(error.reason);
        throw error;
      }
      if (!this.run && !this.prepareRunner) return result('context_unavailable', null, ['CONTEXT_UNAVAILABLE']);
      if (this.now() < this.throttle.retryAtMs) return result('rate_limited', null, ['RATE_LIMITED'], this.throttle.retryAtMs);
      if (this.budget && (this.budget.queries <= 0 || this.budget.bytes <= 0)) return result('unavailable', null, ['QUERY_LIMIT']);
      const responseByteCeiling = queryLimits.responseBytes * responsePages;
      reservedBytes = this.budget ? Math.min(responseByteCeiling, this.budget.bytes) : responseByteCeiling;
      if (this.budget) {
        // The waiter holds no budget; reserve only after admission and recheck against earlier turns.
        this.budget.queries--;
        this.budget.bytes -= reservedBytes;
        reservationActive = true;
      }
      const context: GitHubBeforeSendContext = {
        signal: stage.controller.signal,
        deadlineMonotonicMs: stage.deadlineMonotonicMs,
        assertActive: stage.assertActive,
      };
      const input = JSON.stringify({ query, variables });
      if (options?.beforeSend) {
        if (!permit) return result('unavailable', null, ['QUERY_FAILED']);
        const authExecution: AuthorizationExecution = {
          admission: this.admission, permit, stage, lane: { tail: Promise.resolve() }, active: true,
        };
        let authorizationPromise: Promise<void>;
        try { authorizationPromise = queryStageStorage.run(stage, () => authorizationStorage.run(authExecution, () => Promise.resolve(options.beforeSend!(context)))); }
        catch (error) { authorizationPromise = Promise.reject(error); }
        const outcome = await Promise.race([
          authorizationPromise.then(() => ({ kind: 'ready' as const }), error => ({ kind: 'failed' as const, error })),
          stage.stopped.then(reason => ({ kind: 'stopped' as const, reason })),
        ]);
        authExecution.active = false;
        const dependentOutcome = await Promise.race([
          authExecution.lane.tail.then(() => ({ kind: 'ready' as const })),
          stage.stopped.then(reason => ({ kind: 'stopped' as const, reason })),
        ]);
        if (outcome.kind === 'stopped') { refundIfNotSent(); return stopResult(outcome.reason); }
        if (dependentOutcome.kind === 'stopped') { refundIfNotSent(); return stopResult(dependentOutcome.reason); }
        if (outcome.kind === 'failed') {
          try { stage.assertActive(); }
          catch (error) { if (error instanceof QueryStageStopped) { refundIfNotSent(); return stopResult(error.reason); } throw error; }
          refundIfNotSent();
          return result('unavailable', null, ['QUERY_FAILED']);
        }
      }

      try { stage.assertActive(); }
      catch (error) {
        if (error instanceof QueryStageStopped) { refundIfNotSent(); return stopResult(error.reason); }
        throw error;
      }
      if (this.now() < this.throttle.retryAtMs) { refundIfNotSent(); return result('rate_limited', null, ['RATE_LIMITED'], this.throttle.retryAtMs); }
      if (!permit) {
        refundIfNotSent();
        return result('unavailable', null, ['QUERY_FAILED']);
      }
      const physicalWait = permit.waitForPhysicalClose(stage, this.monotonicNow);
      const physicalIdle = physicalWait instanceof Promise ? await physicalWait : physicalWait;
      if (!physicalIdle) {
        refundIfNotSent();
        try { stage.assertActive(); } catch (error) { if (error instanceof QueryStageStopped) return stopResult(error.reason); throw error; }
        return result('unavailable', null, ['QUERY_LIMIT']);
      }
      try { stage.assertActive(); }
      catch (error) {
        if (error instanceof QueryStageStopped) { refundIfNotSent(); return stopResult(error.reason); }
        throw error;
      }
      let run = this.run;
      let assertContextCurrent = () => {};
      if (this.prepareRunner) {
        let preparation: Promise<PreparedRunner>;
        try { preparation = Promise.resolve(this.prepareRunner(context, input)); }
        catch (error) { preparation = Promise.reject(error); }
        const outcome = await Promise.race([
          preparation.then(prepared => ({ kind: 'ready' as const, prepared }), error => ({ kind: 'failed' as const, error })),
          stage.stopped.then(reason => ({ kind: 'stopped' as const, reason })),
        ]);
        if (outcome.kind === 'stopped') { refundIfNotSent(); return stopResult(outcome.reason); }
        if (outcome.kind === 'failed') {
          refundIfNotSent();
          try { stage.assertActive(); }
          catch (stageError) {
            if (stageError instanceof QueryStageStopped) return stopResult(stageError.reason);
            throw stageError;
          }
          if (outcome.error instanceof GitHubRunnerError && outcome.error.code === 'CONTEXT_UNAVAILABLE') return result('context_unavailable', null, ['CONTEXT_UNAVAILABLE']);
          return result('unavailable', null, ['CLI_UNAVAILABLE']);
        }
        run = outcome.prepared.run;
        assertContextCurrent = outcome.prepared.assertCurrent;
      }
      try { stage.assertActive(); }
      catch (error) {
        if (error instanceof QueryStageStopped) { refundIfNotSent(); return stopResult(error.reason); }
        throw error;
      }
      try { assertContextCurrent(); }
      catch { refundIfNotSent(); return result('context_unavailable', null, ['CONTEXT_UNAVAILABLE']); }
      if (this.now() < this.throttle.retryAtMs) { refundIfNotSent(); return result('rate_limited', null, ['RATE_LIMITED'], this.throttle.retryAtMs); }
      if (!run) { refundIfNotSent(); return result('context_unavailable', null, ['CONTEXT_UNAVAILABLE']); }
      const admittedPermit = permit;
      const control: GitHubRunnerControl = {
        ...context,
        onLifecycle: value => { lifecycle = value; admittedPermit.track(value); this.trackPhysicalRun(value); },
      };
      let runPromise: Promise<CommandResponse>;
      try {
        // Calling the runner immediately after the final guard leaves no async preparation gap before dispatch.
        runPromise = queryStageStorage.run(stage, () => run!(input, () => {
          stage.assertActive();
          sendObserved = true;
          onSend?.();
          if (lifecycle) admittedPermit.track(lifecycle);
          this.trackPhysicalRun(lifecycle);
        }, reservedBytes, control));
      } catch (error) { runPromise = Promise.reject(error); }
      const outcome = await Promise.race([
        runPromise.then(response => ({ kind: 'response' as const, response }), error => ({ kind: 'failed' as const, error })),
        stage.stopped.then(reason => ({ kind: 'stopped' as const, reason })),
      ]);
      if (outcome.kind === 'stopped') {
        refundIfNotSent(); this.trackPhysicalRun(lifecycle);
        return stopResult(outcome.reason);
      }
      if (outcome.kind === 'failed') {
        const failedLifecycle = getGitHubRunnerLifecycle(outcome.error);
        if (failedLifecycle) { lifecycle = failedLifecycle; permit.track(failedLifecycle); this.trackPhysicalRun(failedLifecycle); }
        refundIfNotSent();
        if (outcome.error instanceof GitHubRunnerError && outcome.error.code === 'CONTEXT_UNAVAILABLE') return result('context_unavailable', null, ['CONTEXT_UNAVAILABLE']);
        return result('unavailable', null, ['CLI_UNAVAILABLE']);
      }
      try { stage.assertActive(); }
      catch (error) {
        if (error instanceof QueryStageStopped) { refundIfNotSent(); this.trackPhysicalRun(lifecycle); return stopResult(error.reason); }
        throw error;
      }
      const response = outcome.response;
      if (this.budget) {
        reservationActive = false;
        const responseBytes = Buffer.byteLength(response.stdout, 'utf8');
        if (responseBytes > reservedBytes) {
          this.budget.bytes = 0;
          return result('unavailable', null, ['QUERY_LIMIT']);
        }
        this.budget.bytes += reservedBytes - responseBytes;
      } else reservationActive = false;
      if (response.exitCode === 4) return result('authentication_invalid', null, ['AUTHENTICATION_INVALID']);
      try {
        const match = /^HTTP\/[\d.]+\s+(\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(response.stdout);
        if (!match) {
          if (response.exitCode === 0) return result('unavailable', null, ['RESPONSE_INVALID']);
          return failed(result('unavailable', null, ['QUERY_FAILED']),
            { reason: 'GITHUB_CLI_EXIT', message: `GitHub CLI exited with code ${response.exitCode} without an HTTP response.` });
        }
        const status = Number(match[1]);
        const headers = new Map((match[2] ?? '').split(/\r?\n/).map((line) => {
          const at = line.indexOf(':');
          return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()] as const;
        }));
        const headerResetSeconds = Number(headers.get('x-ratelimit-reset'));
        const headerResetAtMs = Number.isSafeInteger(headerResetSeconds) && headerResetSeconds > 0 ? headerResetSeconds * 1000 : null;
        this.recordRateLimit(headers.get('x-ratelimit-limit'), headers.get('x-ratelimit-remaining'), headerResetAtMs);
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
          if (record(rate)) this.recordRateLimit(rate.limit, rate.remaining, Number.isSafeInteger(graphReset) && graphReset > 0 ? graphReset : null);
          const hints = [retryTime, reset, graphReset].filter((time) => Number.isSafeInteger(time) && time > now);
          this.throttle.retryAtMs = Math.max(this.throttle.retryAtMs, hints.length ? Math.max(...hints) : now + 60_000);
          return result('rate_limited', null, ['RATE_LIMITED'], this.throttle.retryAtMs);
        }
        if (status === 403) return result('inaccessible', null, ['ACCESS_DENIED']);
        if (status === 404) return result('inaccessible', null, ['NOT_FOUND_OR_INACCESSIBLE']);
        if (status < 200 || status >= 300) return failed(result('unavailable', null, ['QUERY_FAILED']), providerError(status, body));
        if (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length !== errors.length)) return result('unavailable', null, ['RESPONSE_INVALID']);
        const data = body.data === null || body.data === undefined ? null : object(body.data);
        if (errors.length) {
          if (codes.includes('UNAUTHENTICATED')) return result('authentication_invalid', null, ['AUTHENTICATION_INVALID']);
          const inaccessible = codes.every((code) => code === 'FORBIDDEN' || code === 'NOT_FOUND');
          return failed(result(data ? 'partial' : inaccessible ? 'inaccessible' : 'unavailable', data, [inaccessible ? 'REFERENCE_INACCESSIBLE' : 'QUERY_FAILED']),
            providerError(status, body));
        }
        if (response.exitCode !== 0 || !data) return result('unavailable', null, ['RESPONSE_INVALID']);
        return result('complete', data);
      } catch { return result('unavailable', null, ['RESPONSE_INVALID']); }
    } finally {
      refundIfNotSent();
      stage.dispose();
      if (ownsPermit) permit?.finishRoot();
    }
  }
}

export async function collect<T>(reader: GraphQLReader, query: string, variables: Record<string, unknown>, select: (data: Record<string, unknown>) => unknown, decode: (node: Record<string, unknown>) => T, identity: (node: Record<string, unknown>) => string | null = (node) => string(node.id), firstPage?: GitHubQueryResult<Record<string, unknown>>, options?: GitHubQueryOptions): Promise<GitHubQueryResult<T[]>> {
  const items: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  const ids = new Set<string>();
  const notes: GitHubDiagnostic['code'][] = [];
  for (let page = 0; page < queryLimits.pages; page++) {
    const response = page === 0 && firstPage ? firstPage : await reader.query(query, { ...variables, cursor }, undefined, 1, options);
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
