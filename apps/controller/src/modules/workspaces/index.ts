import type { GitHub } from '../github/index.js';
import { createGitReader, type GitContext } from './git.js';
import { createInspector } from './inspect.js';
import { createWorkspacePreparer } from './prepare.js';
import { createCapturer } from './capture.js';
import { createDeliveryDiff } from './diff.js';
import { createCheckMaterializer } from './materialize.js';
import { createReviewValidator } from './review.js';
import { createEnvironmentRecovery } from './recovery.js';
import { createRetainedVerifier } from './retention.js';
import { createLocalScaffolder } from './scaffold.js';
import { createScaffoldRemoteGit } from './remote-scaffold.js';
import { createLocalPublisher } from './publication.js';
import { createRemotePublisher, type PushAuthorization } from './remote-publication.js';
export type { LocalCommitResult } from './publication.js';
export { ScaffoldWorkspaceError, validateScaffoldBranch } from './scaffold.js';
export type { EnvironmentObservation } from './recovery.js';
export { CaptureError, captureLimits, type CaptureInput, type CapturedContent } from './capture.js';
import { resolve } from 'node:path';
import type { ToolObservation } from '#contracts';
export { WorkspacePreparationError } from './prepare.js';

export type { GitContext } from './git.js';
export interface WorkspaceOptions { github: Pick<GitHub, 'getRepository' | 'resolveBranch'>; context?: GitContext; dataDirectory?: string; openFolder?: (path: string) => Promise<void>; pushAuthorization?: PushAuthorization; scaffoldAuthorization?: import('../github/index.js').ScaffoldAuthorization }
export function createWorkspaces(options: WorkspaceOptions) {
  const git = options.context ? createGitReader(options.context) : undefined;
  return { ...createInspector(options.github, git), ...createLocalScaffolder(git), ...createScaffoldRemoteGit(git,options.scaffoldAuthorization), ...createEnvironmentRecovery(options.dataDirectory, git, options.openFolder), prepareAttempt: createWorkspacePreparer(options.dataDirectory, git),
    captureDelivery: createCapturer(options.dataDirectory, git), getDeliveryDiff: createDeliveryDiff(options.dataDirectory, git),
    verifyRetainedDelivery: createRetainedVerifier(options.dataDirectory, git),
    ...createLocalPublisher(options.dataDirectory, git),
    ...createRemotePublisher(options.dataDirectory,git,options.pushAuthorization,undefined,options.context ? { kind: 'confirmed_attempt' } : undefined),
    materializeCheck: createCheckMaterializer(options.dataDirectory, git),
    materializeReview: createCheckMaterializer(options.dataDirectory, git, undefined, 'reviews'),
    validateReview: createReviewValidator(options.dataDirectory, git),
    async observeVersion(): Promise<ToolObservation> {
      const base = { tool: 'git' as const, observedAtMs: Date.now(), affectedRequirements: ['RF-22'] };
      if (git) {
        try {
          const reply = await git(resolve(options.dataDirectory ?? '.'), ['--version']);
          const version = /^git version ([0-9][A-Za-z0-9.+-]{0,100})\s*$/.exec(reply.stdout.trim())?.[1];
          if (reply.exitCode === 0 && version) return { ...base, state: 'observed', version, cause: null, affectedRequirements: [] };
        } catch { return { ...base, state: 'unavailable', version: null, cause: 'GIT_VERSION_QUERY_FAILED' }; }
      }
      return { ...base, state: 'unavailable', version: null, cause: git ? 'GIT_VERSION_INVALID' : 'CONTEXT_UNAVAILABLE' };
    },
  };
}
export type Workspaces = ReturnType<typeof createWorkspaces>;
