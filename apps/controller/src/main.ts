import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigurationError, loadConfiguration } from './config.js';
import { createApp } from './http/app.js';
import { acquireControllerLock, openStorage, StorageError, OperationError } from './modules/storage/index.js';
import { httpLimits } from './http/security/index.js';
import { createGitHub, type GitHubContext, type GitHubHostAccess, type GitHubMutationAuthorization } from './modules/github/index.js';
import { createWorkspaces, type GitContext } from './modules/workspaces/index.js';
import { createPreparations, createQueue, validateScaffoldResources } from './modules/projects/index.js';
import { createExecution, ExecutionError, type ExecutionHost } from './modules/execution/index.js';
import { createPipeline, type Pipeline } from './modules/pipeline/index.js';
import { createVerification } from './modules/verification/index.js';
import type { ToolObservation } from '#contracts';

/** Trusted host composition only. These declarations do not elevate or prove keyring access. */
export interface ControllerHostContext { github?: GitHubContext; githubAccess?: GitHubHostAccess; githubMutationAuthorization?: GitHubMutationAuthorization; scaffoldAuthorization?: import('./modules/github/index.js').ScaffoldAuthorization; git?: GitContext; execution?: ExecutionHost; openFolder?: (path: string) => Promise<void>; selectProjectsDirectory?: (signal?: AbortSignal) => Promise<string | null>; selectGitHubExecutable?: (signal?: AbortSignal) => Promise<string | null> }

/** Explicit composition seam for local contract tests; the CLI always uses the native factory. */
export interface ControllerDependencies { executionFactory?: typeof createExecution; dataDirectory?: string }

export async function startController(hostContext: ControllerHostContext = {}, dependencies: ControllerDependencies = {}) {
  const configuration = Object.freeze({
    ...loadConfiguration(process.env, fileURLToPath(new URL('../../../../', import.meta.url))),
    ...(dependencies.dataDirectory ? { dataDirectory: dependencies.dataDirectory } : {}),
  });
  const lock = acquireControllerLock(configuration.dataDirectory);
  let storage: ReturnType<typeof openStorage>;
  try { storage = openStorage({ dataDirectory: configuration.dataDirectory }); }
  catch (error) { lock.close(); throw error; }
  let app: ReturnType<typeof createApp>;
  let execution: ReturnType<typeof createExecution> | undefined;
  let pipeline: Pipeline | undefined;
  try {
    storage.captureLocalHost();
    const githubAccess = hostContext.githubAccess ?? (hostContext.github ? { kind: hostContext.github.kind, cwd: hostContext.github.cwd } : undefined);
    const github = createGitHub({ ...(hostContext.github ? { context: hostContext.github } : {}), ...(githubAccess ? { access: githubAccess } : {}),
      savedExecutablePath: storage.getGitHubExecutablePath,
      ...(hostContext.githubMutationAuthorization ? { mutationAuthorization: hostContext.githubMutationAuthorization } : {}),
      ...(hostContext.scaffoldAuthorization ? { scaffoldAuthorization: hostContext.scaffoldAuthorization } : {}) });
    const workspaces = createWorkspaces({ github, dataDirectory: configuration.dataDirectory, ...(hostContext.git ? { context: hostContext.git } : {}), ...(hostContext.githubMutationAuthorization ? { pushAuthorization: hostContext.githubMutationAuthorization } : {}), ...(hostContext.scaffoldAuthorization ? { scaffoldAuthorization: hostContext.scaffoldAuthorization } : {}), ...(hostContext.openFolder ? { openFolder: hostContext.openFolder } : {}) });
    execution = (dependencies.executionFactory ?? createExecution)({ dataDirectory: configuration.dataDirectory, persistence: storage.executionPersistence(),
      validatePassageScope: async binding => { if (!pipeline || !await pipeline.revalidateScope(binding)) throw new ExecutionError('RESULT_INVALID'); },
      validateReviewerResult: async binding => {
        const review = storage.getReview(binding.deliveryVersion);
        if (!review || review.passageId !== binding.passageId) throw new ExecutionError('RESOURCE_INVALID');
        const valid = await workspaces.validateReview(storage.getDelivery(binding.deliveryVersion).delivery, review.id);
        storage.recordReviewIntegrity(binding, valid);
      }, ...(hostContext.execution ? { host: hostContext.execution } : {}) });
    // No worker, HTTP surface or dispatch exists before the real anchor query succeeds.
    const preflight = await execution.preflight();
    if (!preflight.ready) throw new ExecutionError(preflight.code ?? 'CONTEXT_MISSING');
    await validateScaffoldResources();
    const activeExecution = execution;
    const preparations = createPreparations({ storage, github, workspaces });
    const logFailure = (code: string) => console.error(JSON.stringify({ level: 'error', code, message: 'Pipeline operation failed.' }));
    const verification = createVerification({ storage, workspaces, dataDirectory: configuration.dataDirectory, logFailure });
    const queue = createQueue({ storage, github });
    pipeline = createPipeline({ storage, execution, preparations, workspaces, verification, github, queue, publication: { github, workspaces, verification },
      observeTools: async () => {
        const [git, gh, runtime] = await Promise.all([workspaces.observeVersion(), github.observeVersion(), activeExecution.observeVersions()]);
        const node: ToolObservation = { tool: 'node', state: 'observed', version: process.versions.node, cause: null, affectedRequirements: [], observedAtMs: Date.now() };
        return [node, git, gh, ...runtime];
      }, logFailure });
    app = createApp(configuration, storage, undefined, { github, githubSetup: github, githubRuntime: github, workspaces, execution,
      ...(hostContext.selectProjectsDirectory ? { selectProjectsDirectory: hostContext.selectProjectsDirectory } : {}),
      ...(hostContext.selectGitHubExecutable ? { selectGitHubExecutable: hostContext.selectGitHubExecutable } : {}) }, { github, workspaces }, pipeline, { github, workspaces }, { execution });
  } catch (error) {
    try {
      if (pipeline) await pipeline.close();
      else if (execution) await execution.close();
    } finally { try { storage.close(); } finally { lock.close(); } }
    throw error;
  }
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void app.close().catch(() => {
      app.log.error({ code: 'SHUTDOWN_FAILED' }, 'Controller shutdown failed');
      process.exitCode = 1;
    });
  };
  app.addHook('onClose', async () => {
    try { lock.close(); }
    finally {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
    }
  });
  // Install before listen: a signal during bind must also revoke coordination.
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try {
    await app.listen({ host: configuration.host, port: configuration.port });
  } catch (error) {
    await app.close();
    throw error;
  }
  if (closing) { await app.close(); return app; }
  app.log.info({ storage: storage.getDiagnostics(), httpLimits, scope: 'http' }, 'Controller ready');
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startController().catch((error: unknown) => {
    const code = error instanceof StorageError || error instanceof ConfigurationError || error instanceof ExecutionError || error instanceof OperationError ? error.code : 'STARTUP_FAILED';
    console.error(JSON.stringify({ level: 'error', code, message: 'Controller startup failed.' }));
    process.exitCode = 1;
  });
}
