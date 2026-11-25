import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigurationError, loadConfiguration } from './config.js';
import { createApp } from './http/app.js';
import { acquireControllerLock, openStorage, StorageError, OperationError } from './modules/storage/index.js';
import { httpLimits } from './http/security/index.js';
import { createGitHub, type GitHubContext, type GitHubHostAccess, type GitHubMutationAuthorization } from './modules/github/index.js';
import { createWorkspaces, type GitContext } from './modules/workspaces/index.js';
import { createPreparations, createQueue, validateScaffoldResources, createDeletionCoordinator } from './modules/projects/index.js';
import { createExecution, ExecutionError, withWindowsTerminalJobs, type ExecutionHost } from './modules/execution/index.js';
import { createPipeline, issueContentPrerequisite, type Pipeline } from './modules/pipeline/index.js';
import type { ToolObservation } from '#contracts';
import { createToolDetector } from './modules/tools/index.js';

/** Trusted host composition only. These declarations do not elevate or prove keyring access. */
export interface ControllerHostContext { discoverTools?: boolean; github?: GitHubContext; githubAccess?: GitHubHostAccess; githubMutationAuthorization?: GitHubMutationAuthorization; scaffoldAuthorization?: import('./modules/github/index.js').ScaffoldAuthorization; git?: GitContext; execution?: ExecutionHost; openFolder?: (path: string) => Promise<void>; selectProjectsDirectory?: (signal?: AbortSignal) => Promise<string | null>; selectGitHubExecutable?: (signal?: AbortSignal) => Promise<string | null>; selectExecutable?: (signal?: AbortSignal) => Promise<string | null> }

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
  let deletions: ReturnType<typeof createDeletionCoordinator> | undefined;
  try {
    storage.captureLocalHost();
    const toolDetector = createToolDetector();
    const detectedTools = hostContext.discoverTools
      ? await toolDetector.detect(storage.getGlobalConfiguration().view.tool_preferences, storage.getGitHubExecutablePath())
      : null;
    if (detectedTools) storage.recordToolPreferenceValidation({
      ...(detectedTools.git.selected_path ? { git: detectedTools.git.selected_path } : {}),
      ...(detectedTools.maestri.selected_path ? { maestri: detectedTools.maestri.selected_path } : {}),
      ...(detectedTools.omp.selected_path ? { omp: detectedTools.omp.selected_path } : {}),
      ...(detectedTools.powershell.selected_path ? { powershell: detectedTools.powershell.selected_path } : {}),
    });
    const githubAccess = hostContext.githubAccess ?? (hostContext.github ? { kind: hostContext.github.kind, cwd: hostContext.github.cwd }
      : undefined);
    const gitContext = hostContext.git ?? (detectedTools?.git.selected_path && githubAccess
      ? { kind: 'windows_keyring' as const, executable: detectedTools.git.selected_path, cwd: githubAccess.cwd } : undefined);
    // Boot detection can be ambiguous (e.g. cmd\git.exe and mingw64\bin\git.exe); the operator's saved choice must take effect without a restart.
    const resolveGitContext = hostContext.git || !hostContext.discoverTools || !githubAccess ? undefined : () => {
      const executable = storage.getGlobalConfiguration().view.tool_preferences.git.preferred_path ?? detectedTools?.git.selected_path;
      return executable ? { kind: 'windows_keyring' as const, executable, cwd: githubAccess.cwd } : undefined;
    };
    const executionHost = hostContext.execution ?? (detectedTools?.maestri.selected_path && detectedTools.omp.selected_path && detectedTools.powershell.selected_path
      ? { maestriExecutable: detectedTools.maestri.selected_path, ompExecutable: detectedTools.omp.selected_path,
        powershellExecutable: detectedTools.powershell.selected_path, inheritedEnvironment: process.env } : undefined);
    const github = createGitHub({ ...(hostContext.github ? { context: hostContext.github } : {}), ...(githubAccess ? { access: githubAccess } : {}),
      savedExecutablePath: storage.getGitHubExecutablePath,
      // Operator diagnosis of rejected mutations: reason code, sanitized GitHub text and the effect operationId.
      observeProviderError: ({ reason, message, operationId }) => {
        console.error(JSON.stringify({ level: 'error', event: 'github_mutation_rejected', code: reason, operationId, providerMessage: message }));
      },
      ...(hostContext.githubAccess || hostContext.github ? { attemptEffectAuthorization: { kind: 'confirmed_attempt' as const } } : {}),
      ...(hostContext.githubMutationAuthorization ? { mutationAuthorization: hostContext.githubMutationAuthorization } : {}),
      ...(hostContext.scaffoldAuthorization ? { scaffoldAuthorization: hostContext.scaffoldAuthorization } : {}) });
    const workspaces = createWorkspaces({ github, dataDirectory: configuration.dataDirectory,
      projectStorage: storage, historyMigration: storage,
      ...(resolveGitContext ? { resolveContext: resolveGitContext } : gitContext ? { context: gitContext } : {}), ...(hostContext.githubMutationAuthorization ? { pushAuthorization: hostContext.githubMutationAuthorization } : {}), ...(hostContext.scaffoldAuthorization ? { scaffoldAuthorization: hostContext.scaffoldAuthorization } : {}), ...(hostContext.openFolder ? { openFolder: hostContext.openFolder } : {}) });
    execution = (dependencies.executionFactory ?? createExecution)({ dataDirectory: configuration.dataDirectory, persistence: storage.executionPersistence(),
      projectStorageRootForAttempt: workspaces.resolveAttemptRoot,
      projectStorageAreaForAttempt: workspaces.resolveAttemptArea,
      validatePassageScope: async binding => { if (!pipeline || !await pipeline.revalidateScope(binding)) throw new ExecutionError('RESULT_INVALID'); },
      validateReviewerResult: async binding => {
        const review = storage.getReview(binding.deliveryVersion);
        if (!review || review.passageId !== binding.passageId) throw new ExecutionError('RESOURCE_INVALID');
        const valid = await workspaces.validateReview(storage.getDelivery(binding.deliveryVersion).delivery, review.id);
        storage.recordReviewIntegrity(binding, valid);
      }, ...(executionHost ? { host: withWindowsTerminalJobs(executionHost, configuration.dataDirectory) } : {}),
      ...(hostContext.discoverTools ? { resolveHost: async () => {
        const tools = await toolDetector.detect(storage.getGlobalConfiguration().view.tool_preferences, storage.getGitHubExecutablePath());
        if (!tools.maestri.selected_path || !tools.omp.selected_path || !tools.powershell.selected_path) return undefined;
        return withWindowsTerminalJobs({ maestriExecutable: tools.maestri.selected_path, ompExecutable: tools.omp.selected_path,
          powershellExecutable: tools.powershell.selected_path, inheritedEnvironment: process.env }, configuration.dataDirectory);
      } } : {}) });
    // Missing local tools and Maestri connectivity never hide configuration access.
    await validateScaffoldResources();
    const activeExecution = execution;
    const preparations = createPreparations({ storage, github, workspaces });
    // The pipeline ticks every second, so a persistent failure would repeat the same line continuously.
    // Each code is printed once per window; the next print reports how many repeats were suppressed.
    const failureRepeatWindowMs = 5 * 60_000;
    const recentFailures = new Map<string, { printedAtMs: number; suppressed: number }>();
    const logFailure = (code: string) => {
      const now = Date.now();
      const previous = recentFailures.get(code);
      if (previous && now - previous.printedAtMs < failureRepeatWindowMs) { previous.suppressed++; return; }
      if (!previous && recentFailures.size >= 256) recentFailures.delete(recentFailures.keys().next().value!);
      recentFailures.set(code, { printedAtMs: now, suppressed: 0 });
      const diagnostic = issueContentPrerequisite(code);
      console.error(JSON.stringify({ level: 'error', code, message: diagnostic?.message ?? 'Pipeline operation failed.',
        ...(diagnostic ? { recovery: diagnostic.recovery } : {}), ...(previous?.suppressed ? { suppressedRepeats: previous.suppressed } : {}) }));
    };
    deletions = createDeletionCoordinator({ storage, workspaces, logFailure,
      prepareAttempts: async (ids, operationId) => {
        if (!pipeline) throw new Error('PIPELINE_UNAVAILABLE');
        await pipeline.prepareProjectDeletion(ids, operationId);
      } });
    const queue = createQueue({ storage, github, workspaces });
    pipeline = createPipeline({ storage, execution, preparations, workspaces, github, queue, publication: { github, workspaces },
      observeTools: async () => {
        const [tools, preflight] = await Promise.all([
          hostContext.discoverTools ? toolDetector.detect(storage.getGlobalConfiguration().view.tool_preferences, storage.getGitHubExecutablePath())
            : Promise.resolve(null),
          activeExecution.preflight(),
        ]);
        if (!tools) throw new ExecutionError('CONTEXT_MISSING');
        if (!preflight.ready) throw new OperationError(503, preflight.code ?? 'MAESTRI_CONNECTION_UNAVAILABLE',
          'Não foi possível confirmar a conexão nativa com o Maestri/OMP.', {
            recovery: 'Confira as ferramentas em Configuração e execute nova detecção. Se o contexto continuar ausente, confira o terminal âncora no Maestri antes de tentar novamente.',
          });
        const observedAtMs = Date.now();
        const observation = (tool: 'git' | 'gh' | 'maestri' | 'omp', item: typeof tools.git, blocked = false): ToolObservation => {
          const selected = item.selected_path ? item.candidates.find(candidate => candidate.path === item.selected_path) : undefined;
          const ready = selected !== undefined && !blocked;
          return { tool, state: ready ? 'observed' : 'unavailable', version: ready ? selected.version : null,
            cause: ready ? null : blocked ? preflight.code ?? 'MAESTRI_CONNECTION_UNAVAILABLE' : item.diagnostic ?? 'TOOL_NOT_AVAILABLE',
            affectedRequirements: ready ? [] : ['RF-01', 'RF-06'], observedAtMs };
        };
        const node: ToolObservation = { tool: 'node', state: 'observed', version: process.versions.node, cause: null, affectedRequirements: [], observedAtMs };
        return [node, observation('git', tools.git), observation('gh', tools.gh), observation('maestri', tools.maestri, !preflight.ready), observation('omp', tools.omp)];
      }, logFailure });
    app = createApp(configuration, storage, undefined, { github, githubSetup: github, githubRuntime: github, workspaces, execution,
      ...(hostContext.selectProjectsDirectory ? { selectProjectsDirectory: hostContext.selectProjectsDirectory } : {}),
      ...(hostContext.selectGitHubExecutable ? { selectGitHubExecutable: hostContext.selectGitHubExecutable } : {}),
      ...(hostContext.selectExecutable ? { selectExecutable: hostContext.selectExecutable } : {}), toolDetector }, { github, workspaces }, pipeline, { github, workspaces }, { execution }, { workspaces, coordinator: deletions });
    app.addHook('preClose', async () => { await deletions?.close(); });
    deletions.recover();
  } catch (error) {
    try {
      await deletions?.close();
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
