import type { GitHub } from '../github/index.js';
import { createGitReader, GitReadError, type GitContext, type GitReader } from './git.js';
import { createInspector } from './inspect.js';
import { createBranchLister } from './branches.js';
export { validBranch } from './inspect.js';
import { createIntegrationImporter } from './integration.js';
import { createPublicationTargetWorkspace } from './publication-target.js';
import { createWorkspacePreparer } from './prepare.js';
import { createCapturer } from './capture.js';
import { CaptureError } from './capture.js';
import { createDeliveryDiff } from './diff.js';
import { createAttemptMaterializer } from './materialize.js';
import { createEnvironmentRecovery } from './recovery.js';
import { createRetainedVerifier } from './retention.js';
import { createLocalScaffolder } from './scaffold.js';
import { createScaffoldRemoteGit } from './remote-scaffold.js';
import { createLocalPublisher } from './publication.js';
import { createDeliveryTargetWorkspace } from './delivery-target.js';
import { createRemotePublisher, type PushAuthorization } from './remote-publication.js';
import { createDeletionInspector, windowsReferenceDeletionPlatform, nativeDeletionInspectionPlatform } from './deletion.js';
import { createProjectStorageInspector, type ProjectStoragePersistence } from './project-storage.js';
import { createProjectStorageTransitionWorkspace } from './project-storage-transition.js';
import { createRetainedHistoryMigrator, type RetainedHistoryMigrationStore } from './retained-history-migration.js';
export { createDeletionInspector, nativeDeletionInspectionPlatform } from './deletion.js';
export type { DeletionInspection, DeletionInspectionInput, DeletionInspectionPlatform, DeletionPathClaim, DeletionPathObservation } from './deletion.js';
export type { LocalCommitResult } from './publication.js';
export { ScaffoldWorkspaceError, validateScaffoldBranch } from './scaffold.js';
export type { EnvironmentObservation } from './recovery.js';
export { CaptureError, captureLimits, type CaptureInput, type CapturedContent } from './capture.js';
export { ProjectStorageError, projectStorageRootRelative, requireAttemptAreaResolver, requireAttemptRootResolver } from './project-storage.js';
export { IssueProgressError, renderIssueProgress, writeIssueProgressFile } from './issue-progress.js';
export type { IssueProgressDecision, IssueProgressDocument, IssueProgressIdentity, IssueProgressMilestone,
  IssueProgressPredecessor, IssueProgressRound } from './issue-progress.js';
export { createProjectStorageTransitionWorkspace } from './project-storage-transition.js';
export type { AttemptAreaResolver, AttemptRootResolver, AttemptWorkspacePathResolver, ProjectStoragePersistence } from './project-storage.js';
import { resolve } from 'node:path';
import type { ToolObservation } from '#contracts';
export { WorkspacePreparationError } from './prepare.js';

export type { GitContext } from './git.js';
export { gitSafety } from './git.js';
export { TargetError } from './publication-target.js';
export type { TargetIdentity } from './publication-target.js';
export type { DeliveryTaskInput, DeliveryTargetInspection, TargetCommitResult } from './delivery-target.js';
export interface WorkspaceOptions { github: Pick<GitHub, 'getRepository' | 'resolveBranch'> & Partial<Pick<GitHub,'listBranches'>>; context?: GitContext; resolveContext?: () => GitContext | undefined; dataDirectory?: string; openFolder?: (path: string) => Promise<void>; pushAuthorization?: PushAuthorization; scaffoldAuthorization?: import('../github/index.js').ScaffoldAuthorization; projectStorage?: ProjectStoragePersistence; historyMigration?: RetainedHistoryMigrationStore }
export function createWorkspaces(options: WorkspaceOptions) {
  const resolveContext = options.resolveContext;
  const git: GitReader | undefined = resolveContext
    ? (cwd, args, input) => { const context = resolveContext(); return context ? createGitReader(context)(cwd, args, input) : Promise.reject(new GitReadError('CONTEXT_UNAVAILABLE')); }
    : options.context ? createGitReader(options.context) : undefined;
  const hasContext = () => resolveContext ? resolveContext() !== undefined : options.context !== undefined;
  const listBranches = createBranchLister(options.github,git);
  const deletionPlatform = process.platform === 'win32' ? windowsReferenceDeletionPlatform() : nativeDeletionInspectionPlatform();
  const projectStorage = createProjectStorageInspector(options.dataDirectory ?? resolve('.'), undefined, options.projectStorage);
  const projectStorageTransition = createProjectStorageTransitionWorkspace(options.dataDirectory ?? resolve('.'));
  const resolveAttemptRoot = projectStorage.resolveAttemptRoot;
  const resolveAttemptWorkspace = projectStorage.resolveAttemptWorkspace;
  const migrateLegacyIssueHistory = createRetainedHistoryMigrator(options.dataDirectory, git, options.historyMigration, resolveAttemptRoot);
  const deliveryTargetWorkspace = createDeliveryTargetWorkspace(options.github,options.dataDirectory,git,undefined,resolveAttemptRoot);
  const sharedAttempt = createAttemptMaterializer(options.dataDirectory, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace);
  return { ...createPublicationTargetWorkspace(options.github,git), ...createDeletionInspector(deletionPlatform), ...createInspector(options.github, git), ...createLocalScaffolder(git), ...(resolveContext ? { scaffoldCapability: () => createLocalScaffolder(hasContext() ? git : undefined).scaffoldCapability() } : {}), ...createScaffoldRemoteGit(git,options.scaffoldAuthorization), ...createEnvironmentRecovery(options.dataDirectory, git, options.openFolder, undefined, resolveAttemptRoot, resolveAttemptWorkspace), ...projectStorage, ...projectStorageTransition,
    ...(options.historyMigration ? { migrateLegacyIssueHistory } : {}), prepareAttempt: createWorkspacePreparer(options.dataDirectory, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace),
    captureDelivery: createCapturer(options.dataDirectory, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace), getDeliveryDiff: createDeliveryDiff(options.dataDirectory, git, undefined, resolveAttemptRoot),
    listBranches,
    verifyRetainedDelivery: createRetainedVerifier(options.dataDirectory, git, undefined, resolveAttemptRoot),
    ...createLocalPublisher(options.dataDirectory, git, undefined, resolveAttemptRoot, projectStorage.resolveAttemptArea),
    inspectDeliveryTarget: deliveryTargetWorkspace.inspectDeliveryTarget,
    inspectIntegrationTarget: deliveryTargetWorkspace.inspectIntegrationTarget,
    importIntegrationBase: createIntegrationImporter(git,sharedAttempt),
    verifyDeliveryTarget: deliveryTargetWorkspace.verifyDeliveryTarget,
    createTargetCommit: deliveryTargetWorkspace.createLocalCommit,
    reconcileTargetCommit: deliveryTargetWorkspace.reconcileLocalCommit,
    ...createRemotePublisher(options.dataDirectory,git,options.pushAuthorization,undefined,options.context || resolveContext ? { kind: 'confirmed_attempt' } : undefined, resolveAttemptRoot),
    materializeReview: sharedAttempt,
    async validateReview(delivery: import('#contracts').Delivery, reviewId: string): Promise<boolean> {
      try { await sharedAttempt(delivery, reviewId); return true; }
      catch (error) { if (error instanceof CaptureError && error.code === 'DELIVERY_INTEGRITY_FAILED') return false; throw error; }
    },
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
