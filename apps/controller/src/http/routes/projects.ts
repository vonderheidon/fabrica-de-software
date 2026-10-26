import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  CatalogQuery, ConfigurationOptions, ConfigurationOptionsQuery, ConfigurationSaved, ConfigurationUpdate, ConfigurationView, ExecutionCatalog, GitHubSetupOptions,
  EmptyQuery, ErrorResponse, OperationAccepted, ProjectDetail, ProjectPage, ProjectParams, ProjectRegistered, ProjectRegistration,
  StorageTransitionCommand,
  BranchOptionsRequest, BranchOptions,
  NativeSelectionRequest, NativeSelectionResult, SettingsSaved, SettingsUpdate, SettingsView, ToolOptions,
} from '#contracts';
import type { Projects } from '../../modules/projects/index.js';
import { commandHeaders } from '../security/index.js';

export function installProjectRoutes(instance: FastifyInstance, projects: Projects): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.post('/api/v1/branches', { schema:{querystring:EmptyQuery,body:BranchOptionsRequest,response:{200:BranchOptions,...errors}} },async request => projects.listBranches(request.body.source));
  app.get('/api/v1/projects', { schema: { querystring: CatalogQuery, response: { 200: ProjectPage, ...errors } } }, async (request) => projects.listProjects(request.query));
  app.post('/api/v1/projects', { schema: { querystring: EmptyQuery, body: ProjectRegistration, response: { 201: ProjectRegistered, ...errors } } }, async (request, reply) => {
    const result = await projects.registerProject(request.body, commandHeaders(request));
    return reply.code(201).header('ETag', result.etag).header('Location', `/api/v1/projects/${result.view.project.id}`).send({ ...result.view, operation_id: result.operationId });
  });
  app.get('/api/v1/projects/:projectId', { schema: { params: ProjectParams, querystring: EmptyQuery, response: { 200: ProjectDetail, ...errors } } }, async (request, reply) => {
    const result = projects.getProject(request.params.projectId);
    return reply.header('ETag', result.etag).send(result.view);
  });
  app.get('/api/v1/settings', { schema: { querystring: EmptyQuery, response: { 200: SettingsView, ...errors } } }, async (_request, reply) => {
    const result = projects.getSettings();
    return reply.header('ETag', result.etag).send(result.view);
  });
  app.get('/api/v1/settings/github-options', {
    handlerTimeout: 45_000,
    schema: { querystring: EmptyQuery, response: { 200: GitHubSetupOptions, ...errors } },
  }, async () => projects.getGitHubOptions());
  app.get('/api/v1/settings/execution-options', {
    handlerTimeout: 35_000,
    schema: { querystring: EmptyQuery, response: { 200: ExecutionCatalog, ...errors } },
  }, async () => projects.getExecutionOptions());
  app.get('/api/v1/settings/tool-options', {
    handlerTimeout: 20_000,
    schema: { querystring: EmptyQuery, response: { 200: ToolOptions, ...errors } },
  }, async () => projects.getToolOptions());
  app.put('/api/v1/settings', { schema: { querystring: EmptyQuery, body: SettingsUpdate, response: { 200: SettingsSaved, ...errors } } }, async (request, reply) => {
    const result = await projects.saveSettings(request.body, commandHeaders(request));
    return reply.header('ETag', result.etag).send({ ...result.view, operation_id: result.operationId, receipt: result.receipt,
      ...(result.warnings ? { warnings: result.warnings } : {}) });
  });
  app.post('/api/v1/settings/selections', {
    schema: { querystring: EmptyQuery, body: NativeSelectionRequest, response: { 200: NativeSelectionResult, ...errors } },
  }, async (request, reply) => {
    const disconnected = new AbortController();
    const socketTimeout = request.raw.socket.timeout;
    request.raw.socket.setTimeout?.(0);
    const onDisconnect = () => disconnected.abort();
    const onClose = () => { if (!reply.raw.writableEnded) onDisconnect(); };
    request.raw.once('aborted', onDisconnect);
    reply.raw.once('close', onClose);
    // Fastify 5.12 also aborts request.signal on normal IncomingMessage completion.
    // Response closure detects disconnects after the complete POST body has arrived.
    if (request.raw.aborted || reply.raw.destroyed) onDisconnect();
    try { return await projects.selectSetting(request.body, disconnected.signal); }
    finally {
      request.raw.socket.setTimeout?.(socketTimeout ?? 0);
      request.raw.removeListener('aborted', onDisconnect);
      reply.raw.removeListener('close', onClose);
    }
  });
  app.get('/api/v1/projects/:projectId/configuration', { schema: { params: ProjectParams, querystring: EmptyQuery, response: { 200: ConfigurationView, ...errors } } }, async (request, reply) => {
    const result = await projects.getConfiguration(request.params.projectId);
    return reply.header('ETag', result.etag).send(result.view);
  });
  app.put('/api/v1/projects/:projectId/configuration', { schema: { params: ProjectParams, querystring: EmptyQuery, body: ConfigurationUpdate, response: { 200: ConfigurationSaved, ...errors } } }, async (request, reply) => {
    const result = await projects.saveConfiguration(request.params.projectId, request.body, commandHeaders(request));
    return reply.header('ETag', result.etag).send({ ...result.view, operation_id: result.operationId, receipt: result.receipt });
  });
  app.post('/api/v1/projects/:projectId/storage-transition', { schema: { params: ProjectParams, querystring: EmptyQuery,
    body: StorageTransitionCommand, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await projects.transitionStorage(request.params.projectId, request.body, commandHeaders(request));
    const statusUrl = `/api/v1/operations/${operation.operation_id}`;
    return reply.code(202).header('Location', statusUrl).send({ operation_id: operation.operation_id, resource: operation.resource,
      status_url: statusUrl, ...(operation.receipt ? { receipt: operation.receipt } : {}), request_id: request.id });
  });
  app.get('/api/v1/projects/:projectId/configuration-options', { schema: { params: ProjectParams, querystring: ConfigurationOptionsQuery, response: { 200: ConfigurationOptions, ...errors } } }, async (request) => projects.getConfigurationOptions(request.params.projectId, request.query));
}
