import { createClient } from './client.js';
import { createEffectWriter, type GitHubMutationAuthorization, type AttemptEffectAuthorization } from './effects.js';
export type { GitHubMutationAuthorization, GitHubEffectRequest } from './effects.js';
export type { AttemptEffectAuthorization } from './effects.js';
import { GraphQLReader, createGhRunner, GitHubRunnerError, queryGhAuthentication, type GhRunner, type GitHubContext, type GitHubHostAccess } from './transport.js';
import { GitHubExecutableResolver } from './executable.js';
import { inspectPullRequest } from './pull-requests.js';
import { createRemoteScaffolder, type ScaffoldAuthorization } from './scaffold.js';
import type { GitHubExecutableObservation } from '#contracts';
export type { ScaffoldAuthorization } from './scaffold.js';

export { assessIssueReadiness } from './client.js';
export type { IssueReference, ProjectSelection, ReadinessReason } from './client.js';
export type { GitHubContext, GitHubHostAccess } from './transport.js';

export interface GitHubOptions {
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
  const runner = async (input: string, onSend?: () => void) => {
    const context = options.context && !access ? options.context : await resolver.contextForUse(savedPath());
    if (!context) throw new GitHubRunnerError('CONTEXT_UNAVAILABLE');
    return (options.runnerFactory ?? createGhRunner)(context)(input, onSend);
  };
  const reader = new GraphQLReader(runner);
  return {
    ...createClient(reader), ...createRemoteScaffolder(reader, options.scaffoldAuthorization),
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
export type GitHub = ReturnType<typeof createGitHub>;
