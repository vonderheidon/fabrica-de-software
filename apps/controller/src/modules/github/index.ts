import { createClient } from './client.js';
import { createEffectWriter, type GitHubMutationAuthorization } from './effects.js';
export type { GitHubMutationAuthorization, GitHubEffectRequest } from './effects.js';
import { GraphQLReader, createGhRunner, observeGhVersion, type GitHubContext } from './transport.js';
import { inspectPullRequest } from './pull-requests.js';

export { assessIssueReadiness } from './client.js';
export type { IssueReference, ProjectSelection, ReadinessReason } from './client.js';
export type { GitHubContext } from './transport.js';

export interface GitHubOptions { context?: GitHubContext; mutationAuthorization?: GitHubMutationAuthorization }
/** No keyring access is inferred from PATH, environment flags or the presence of a CLI binary. */
export function createGitHub(options: GitHubOptions = {}) {
  const reader = new GraphQLReader(options.context ? createGhRunner(options.context) : undefined);
  return { ...createClient(reader), mutateEffect: createEffectWriter(reader, options.mutationAuthorization), reconcilePullRequest: (effect: import('#contracts').EffectView, accountId: string) => inspectPullRequest(reader,effect,accountId), observeVersion: () => observeGhVersion(options.context) };
}
export type GitHub = ReturnType<typeof createGitHub>;
