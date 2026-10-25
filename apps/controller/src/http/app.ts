import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Writable } from 'node:stream';
import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EmptyQuery, ErrorResponse, HealthResponse, OperationParams, OperationViewWithDeletion } from '#contracts';
import type { ControllerConfiguration } from '../config.js';
import type { Storage } from '../modules/storage/index.js';
import { installErrors, HttpError } from './errors.js';
import { installAssets } from './assets.js';
import { httpLimits, installSecurity } from './security/index.js';
import { installEventRoutes } from './routes/events.js';
import { installNotificationRoutes } from './routes/notifications.js';
import { installShutdownRoutes } from './routes/shutdown.js';
import { createProjects, type ProjectDependencies } from '../modules/projects/index.js';
import { createGitHub, type GitHub } from '../modules/github/index.js';
import { createWorkspaces } from '../modules/workspaces/index.js';
import { createProjectDeletions, createDeletionCoordinator } from '../modules/projects/index.js';
import { installProjectDeletionRoutes } from './routes/project-deletions.js';
import { installProjectRoutes } from './routes/projects.js';
import { createPreparations, type PreparationDependencies } from '../modules/projects/index.js';
import { installPreparationRoutes } from './routes/preparations.js';
import { createPipeline, type Pipeline } from '../modules/pipeline/index.js';
import { createExecution, ExecutionError } from '../modules/execution/index.js';
import { installAttemptRoutes } from './routes/attempts.js';
import { installQueueRoutes } from './routes/queue.js';
import { installDeliveryRoutes } from './routes/deliveries.js';
import { createVerification } from '../modules/verification/index.js';
import type { ToolObservation } from '#contracts';
import { createScaffold, type ScaffoldDependencies } from '../modules/projects/index.js';
import { installScaffoldRoutes } from './routes/scaffold.js';
import { createDiagnostics, type DiagnosticDependencies } from '../modules/diagnostics/index.js';
import { installOperationRoutes } from './routes/operation.js';

type ProjectAppDependencies = Partial<Pick<ProjectDependencies, 'github' | 'githubSetup' | 'workspaces' | 'execution' | 'selectProjectsDirectory' | 'selectGitHubExecutable' | 'selectExecutable' | 'toolDetector'>> & { githubRuntime?: GitHub };

export function createApp(configuration: ControllerConfiguration, storage: Storage, logDestination?: Writable, projectDependencies?: ProjectAppDependencies, preparationDependencies?: Pick<PreparationDependencies, 'github' | 'workspaces'>, providedPipeline?: Pipeline, scaffoldDependencies?: Pick<ScaffoldDependencies, 'github' | 'workspaces'>, diagnosticDependencies?: Pick<DiagnosticDependencies, 'execution'>, deletionDependencies?: { workspaces: Parameters<typeof createDeletionCoordinator>[0]['workspaces']; coordinator: ReturnType<typeof createDeletionCoordinator> }) {
  const app = Fastify({
    logger: {
      level: configuration.logLevel,
      ...(logDestination ? { stream: logDestination } : {}),
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
      // Do not log URL/query strings, headers, bodies or arbitrary error messages.
      serializers: {
        req: (request: { method: string }) => ({ method: request.method }),
        res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
        err: () => ({ type: 'Error', code: 'INTERNAL_ERROR', message: 'Request failed', stack: '' }),
      },
    },
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    clientErrorHandler: (error, socket) => {
      if (!socket.writable) return;
      const status = error.code === 'HPE_HEADER_OVERFLOW' ? 431 : error.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? 408 : 400;
      const body = JSON.stringify({ code: 'REQUEST_REJECTED', message: 'The request format is invalid.', request_id: randomUUID() });
      socket.end(`HTTP/1.1 ${status} Request Rejected\r\nConnection: close\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    },
    bodyLimit: httpLimits.bodyBytes,
    http: { maxHeaderSize: httpLimits.headerBytes },
    connectionTimeout: httpLimits.connectionTimeoutMs,
    requestTimeout: httpLimits.requestTimeoutMs,
    keepAliveTimeout: httpLimits.keepAliveTimeoutMs,
    maxRequestsPerSocket: httpLimits.requestsPerSocket,
    forceCloseConnections: 'idle',
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Human interaction with the native picker has no deadline. Other routes retain their limits.
  app.addHook('onRoute', (route) => {
    if (route.url !== '/api/v1/settings/selections') route.handlerTimeout ??= httpLimits.handlerTimeoutMs;
  });

  app.addHook('onClose', async () => { storage.close(); });
  const webRoot = resolve(import.meta.dirname, '../../../../web');
  installAssets(app, webRoot);
  app.server.maxHeadersCount = httpLimits.headerCount;
  app.server.maxConnections = httpLimits.connections;
  app.server.headersTimeout = httpLimits.headersTimeoutMs;
  installErrors(app);
  const security = installSecurity(app, configuration, storage.getSettings().installation_id, storage.controllerInstanceId);
  installEventRoutes(app, storage, security);
  installNotificationRoutes(app, storage);
  installShutdownRoutes(app, storage);
  const defaultGitHub = projectDependencies?.githubRuntime ?? createGitHub({ savedExecutablePath: storage.getGitHubExecutablePath });
  const github = projectDependencies?.github ?? defaultGitHub;
  const workspaces = projectDependencies?.workspaces ?? createWorkspaces({ github: defaultGitHub,
    dataDirectory: configuration.dataDirectory, projectStorage: storage });
  const projects = createProjects({ storage, github, githubSetup: projectDependencies?.githubSetup ?? defaultGitHub, workspaces, directoryBase: configuration.dataDirectory,
    ...(projectDependencies?.execution ? { execution: projectDependencies.execution } : {}),
    ...(projectDependencies?.selectProjectsDirectory ? { selectProjectsDirectory: projectDependencies.selectProjectsDirectory } : {}),
    ...(projectDependencies?.selectGitHubExecutable ? { selectGitHubExecutable: projectDependencies.selectGitHubExecutable } : {}),
    ...(projectDependencies?.selectExecutable ? { selectExecutable: projectDependencies.selectExecutable } : {}),
    ...(projectDependencies?.toolDetector ? { toolDetector: projectDependencies.toolDetector } : {}) });
  installProjectRoutes(app, projects);
  const deletionWorkspaces = deletionDependencies?.workspaces ?? createWorkspaces({ github: defaultGitHub, dataDirectory: configuration.dataDirectory, projectStorage: storage });
  const deletionCoordinator = deletionDependencies?.coordinator ?? createDeletionCoordinator({ storage, workspaces: deletionWorkspaces,
    logFailure: code => app.log.error({ code }, 'Project deletion stopped') });
  installProjectDeletionRoutes(app, storage, createProjectDeletions({ storage, workspaces: deletionWorkspaces, coordinator: deletionCoordinator }), deletionCoordinator);
  if (!deletionDependencies) app.addHook('preClose', async () => { await deletionCoordinator.close(); });
  installQueueRoutes(app, projects);
  const preparations = createPreparations({ storage, github: preparationDependencies?.github ?? defaultGitHub, workspaces: preparationDependencies?.workspaces ?? workspaces });
  installPreparationRoutes(app, preparations);
  storage.interruptAttempts();
  const execution = providedPipeline ? null : createExecution({ dataDirectory: configuration.dataDirectory, persistence: storage.executionPersistence(),
    validatePassageScope: async binding => { if (!await pipeline.revalidateScope(binding)) throw new ExecutionError('RESULT_INVALID'); } });
  const verificationWorkspaces = createWorkspaces({ github: defaultGitHub, dataDirectory: configuration.dataDirectory, projectStorage: storage });
  storage.interruptCreations();
  const scaffold = createScaffold({ storage, github: scaffoldDependencies?.github ?? defaultGitHub, workspaces: scaffoldDependencies?.workspaces ?? verificationWorkspaces,
    logFailure: code => app.log.error({ code }, 'Scaffold creation stopped') });
  installScaffoldRoutes(app,scaffold,storage);
  const verification = createVerification({ storage, workspaces: verificationWorkspaces, dataDirectory: configuration.dataDirectory, logFailure: code => app.log.error({ code }, 'Verification failed') });
  const pipeline = providedPipeline ?? createPipeline({ storage, preparations, execution: execution!,
    workspaces: verificationWorkspaces, verification, github: preparationDependencies?.github ?? defaultGitHub, queue: { observe: projects.getQueue },
    publication: { github: defaultGitHub, workspaces: verificationWorkspaces, verification },
    observeTools: async () => {
      const now = Date.now();
      const tools: ToolObservation[] = [{ tool: 'node', state: 'observed', version: process.versions.node, cause: null, affectedRequirements: [], observedAtMs: now },
        ...(['git', 'gh'] as const).map(tool => ({ tool, state: 'unavailable' as const, version: null, cause: 'CONTEXT_UNAVAILABLE', affectedRequirements: ['RF-22'], observedAtMs: now }))];
      return [...tools, ...await execution!.observeVersions()];
    }, logFailure: code => app.log.error({ code }, 'Pipeline dispatch failed') });
  storage.interruptDiagnostics();
  const diagnostics = createDiagnostics({ storage, github, projects, ...(diagnosticDependencies?.execution ? { execution: diagnosticDependencies.execution } : execution ? { execution } : {}),
    logFailure: code => app.log.error({ code }, 'Contextual diagnostic failed') });
  installOperationRoutes(app, storage, diagnostics);
  app.addHook('preClose', async () => {
    // Revoke every coordinator synchronously before awaiting any pending IO.
    const outcomes = await Promise.allSettled([pipeline.close(), scaffold.close(), diagnostics.close()]);
    if (outcomes.some(outcome => outcome.status === 'rejected')) {
      app.log.error({ code: 'COORDINATION_SHUTDOWN_FAILED' }, 'Controller coordination did not close cleanly');
      // Report failure while allowing Fastify to finish HTTP/storage/lock cleanup.
      process.exitCode = 1;
    }
  });
  installAttemptRoutes(app, pipeline, storage);
  installDeliveryRoutes(app, pipeline, storage);

  app.get('/api/v1/operations/:operationId', {
    schema: { params: OperationParams, querystring: EmptyQuery, response: { 200: OperationViewWithDeletion, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, 503: ErrorResponse } },
  }, async (request) => {
    const completed = storage.getCompletedProjectDeletion(request.params.operationId);
    if (completed) return completed;
    const operation = storage.getOperation(request.params.operationId);
    if (!operation) throw new HttpError(404, 'OPERATION_NOT_FOUND', 'Operation not found in the current scope.');
    const { error, ...view } = operation;
    return { ...view, ...(error ? { error: { ...error,request_id: request.id } } : {}), request_id: request.id };
  });

  // Technical liveness only; no settings, operational data or authority exposed.
  app.get('/api/v1/health', {
    schema: { querystring: EmptyQuery, response: { 200: HealthResponse, 403: ErrorResponse, 400: ErrorResponse, 503: ErrorResponse } },
  }, async (request, reply) => {
    try {
      storage.checkHealth();
      return { status: 'ok' as const };
    } catch {
      request.log.error({ code: 'STORAGE_UNAVAILABLE' }, 'Health check failed');
      return reply.code(503).send({ code: 'STORAGE_UNAVAILABLE', message: 'Storage is unavailable.', request_id: request.id });
    }
  });
  return app;
}
