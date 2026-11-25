import { createClient } from './client.js';
import type { IssueQueueContext } from './client.js';
import { createEffectWriter, type GitHubMutationAuthorization, type AttemptEffectAuthorization } from './effects.js';
export type { GitHubMutationAuthorization, GitHubEffectRequest } from './effects.js';
export type { AttemptEffectAuthorization } from './effects.js';
import { GraphQLReader, createGhRunner, GitHubRunnerError, queryGhAuthentication, type GhRunner, type GitHubBeforeSendContext, type GitHubRunnerControl, type GitHubContext, type GitHubHostAccess } from './transport.js';
import { GitHubExecutableResolver } from './executable.js';
import { inspectPullRequest } from './pull-requests.js';
import { createRemoteScaffolder, type ScaffoldAuthorization } from './scaffold.js';
import { createBoardOperations } from './board.js';
import type { GitHubExecutableObservation, GitHubQueryResult, IssueContext, ProjectItem } from '#contracts';
export type { ScaffoldAuthorization } from './scaffold.js';

export { assessIssueReadiness } from './client.js';
export type { IssueReference, ProjectSelection, ReadinessReason } from './client.js';
export type { GitHubRateLimitSnapshot } from './transport.js';
export type { IssueAuthorityContext, IssueCommentConfirmationContext, IssueStatusConfirmationContext, IssueQueueContext } from './client.js';
export type { GitHubContext, GitHubHostAccess } from './transport.js';
export type { GitHubBeforeSendContext } from './transport.js';
import type { GitHubProviderErrorObservation } from './transport.js';
export type { GitHubProviderErrorObservation };

export interface GitHubOptions {
  observeQuery?: (measurement: { operation: string; duration_ms: number }) => void;
  /** @internal Test-only observation of the shared physical admission queue. */
  observeAdmissionWaitMs?: (durationMs: number) => void;
  /** Receives the sanitized GitHub error of a rejected mutation, for operator logs only. */
  observeProviderError?: (observation: GitHubProviderErrorObservation) => void;
  context?: GitHubContext;
  access?: GitHubHostAccess;
  savedExecutablePath?: () => string | null;
  resolver?: GitHubExecutableResolver;
  runnerFactory?: (context: GitHubContext) => GhRunner;
  mutationAuthorization?: GitHubMutationAuthorization;
  attemptEffectAuthorization?: AttemptEffectAuthorization;
  scaffoldAuthorization?: ScaffoldAuthorization;
}
/** No keyring access is inferred from PATH, environment flags or the presence of a CLI binary. */
export function createGitHub(options: GitHubOptions = {}) {
  const access = options.access ?? (options.context ? { kind: options.context.kind, cwd: options.context.cwd } : undefined);
  const resolver = options.resolver ?? new GitHubExecutableResolver({ ...(access ? { access } : {}), ...(options.context ? { initialExecutable: options.context.executable } : {}) });
  const savedPath = options.savedExecutablePath ?? (() => null);
  const observe = (input: string, started: number) => {
    try {
      options.observeQuery?.({ operation: (JSON.parse(input) as { query: string }).query.match(/^query\s+(\w+)/)?.[1] ?? 'other',
        duration_ms: Math.round(performance.now() - started) });
    } catch { /* Optional observation must not change the runner outcome. */ }
  };
  const prepareRunner = async (control: GitHubBeforeSendContext, input: string) => {
    const started = performance.now();
    control.assertActive();
    const context = options.context && !access ? options.context : await resolver.contextForUse(savedPath());
    control.assertActive();
    if (!context) throw new GitHubRunnerError('CONTEXT_UNAVAILABLE');
    let run: GhRunner;
    try { run = (options.runnerFactory ?? createGhRunner)(context); }
    catch (error) {
      observe(input, started);
      throw error;
    }
    const preparedRunner: GhRunner = async (input: string, onSend?: () => void, responseBytes?: number, runnerControl?: GitHubRunnerControl) => {
      try { return await run(input, onSend, responseBytes, runnerControl); }
      finally { observe(input, started); }
    };
    return { run: preparedRunner, assertCurrent: () => {
      if (typeof resolver.currentContext === 'function' && resolver.currentContext() !== context) throw new GitHubRunnerError('CONTEXT_UNAVAILABLE');
    } };
  };
  const reader = new GraphQLReader(undefined, Date.now, { retryAtMs: 0 }, undefined, new Set(), () => performance.now(), undefined, prepareRunner,
    undefined, options.observeAdmissionWaitMs, options.observeProviderError);
  return {
    ...createClient(reader), ...createRemoteScaffolder(reader, options.scaffoldAuthorization),
    ...createBoardOperations(reader, options.scaffoldAuthorization),
    mutateEffect: createEffectWriter(reader, options.mutationAuthorization, options.attemptEffectAuthorization),
    reconcilePullRequest: (effect: import('#contracts').EffectView, accountId: string) => inspectPullRequest(reader, effect, accountId),
    resolveExecutable: async (path: string | null) => (await resolver.resolve(path)).observation,
    validateExecutable: async (path: string) => (await resolver.validate(path)).observation,
    activateExecutable: (observation: GitHubExecutableObservation) => resolver.activate(observation),
    getAuthenticationAccounts: async () => queryGhAuthentication(await resolver.contextForUse(savedPath())),
    observeVersion: async () => {
      const resolution = await resolver.resolve(savedPath());
      if (resolution.observation.state === 'observed') return {
        tool: 'gh' as const, state: 'observed' as const, version: resolution.observation.version, cause: null,
        affectedRequirements: [], observedAtMs: Date.now(),
      };
      return {
        tool: 'gh' as const, state: 'unavailable' as const, version: null,
        cause: resolution.observation.diagnostics[0]?.code ?? 'GH_VERSION_QUERY_FAILED',
        affectedRequirements: ['RF-28', 'RF-29'], observedAtMs: Date.now(),
      };
    },
  };
}
export type GitHubClient = ReturnType<typeof createGitHub>;
/** Complete reads remain separate from the queue projection and effect-specific projections. */
export type GitHub = Omit<GitHubClient, 'getIssueContextById'> & {
  getIssueContextById(id: string, options: { purpose: 'queue' }): Promise<GitHubQueryResult<IssueQueueContext | ProjectItem>>;
  getIssueContextById(id: string, options?: { purpose?: undefined }): Promise<GitHubQueryResult<IssueContext | ProjectItem>>;
};
