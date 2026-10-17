import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  CatalogQuery, ConfigurationOptions, ConfigurationOptionsQuery, ConfigurationSaved, ConfigurationUpdate, ConfigurationView,
  EmptyQuery, ErrorResponse, ProjectDetail, ProjectPage, ProjectParams, ProjectRegistered, ProjectRegistration,
  SettingsSaved, SettingsUpdate, SettingsView,
} from '#contracts';
import type { Projects } from '../../modules/projects/index.js';
import { commandHeaders } from '../security/index.js';

export function installProjectRoutes(instance: FastifyInstance, projects: Projects): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.get('/api/v1/projects', { schema: { querystring: CatalogQuery, response: { 200: ProjectPage, ...errors } } }, async (request) => projects.listProjects(request.query));
  app.post('/api/v1/projects', { schema: { querystring: EmptyQuery, body: ProjectRegistration, response: { 201: ProjectRegistered, ...errors } } }, async (request, reply) => {
    const result = await projects.registerProject(request.body, commandHeaders(request));
    return reply.code(201).header('ETag', result.etag).header('Location', `/api/v1/projects/${result.view.project.id}`).send({ ...result.view, operationId: result.operationId });
  });
  app.get('/api/v1/projects/:projectId', { schema: { params: ProjectParams, querystring: EmptyQuery, response: { 200: ProjectDetail, ...errors } } }, async (request, reply) => {
    const result = projects.getProject(request.params.projectId);
    return reply.header('ETag', result.etag).send(result.view);
  });
  app.get('/api/v1/settings', { schema: { querystring: EmptyQuery, response: { 200: SettingsView, ...errors } } }, async (_request, reply) => {
    const result = projects.getSettings();
    return reply.header('ETag', result.etag).send(result.view);
  });
  app.put('/api/v1/settings', { schema: { querystring: EmptyQuery, body: SettingsUpdate, response: { 200: SettingsSaved, ...errors } } }, async (request, reply) => {
    const result = await projects.saveSettings(request.body, commandHeaders(request));
    return reply.header('ETag', result.etag).send({ ...result.view, operationId: result.operationId, receipt: result.receipt });
  });
  app.get('/api/v1/projects/:projectId/configuration', { schema: { params: ProjectParams, querystring: EmptyQuery, response: { 200: ConfigurationView, ...errors } } }, async (request, reply) => {
    const result = projects.getConfiguration(request.params.projectId);
    return reply.header('ETag', result.etag).send(result.view);
  });
  app.put('/api/v1/projects/:projectId/configuration', { schema: { params: ProjectParams, querystring: EmptyQuery, body: ConfigurationUpdate, response: { 200: ConfigurationSaved, ...errors } } }, async (request, reply) => {
    const result = await projects.saveConfiguration(request.params.projectId, request.body, commandHeaders(request));
    return reply.header('ETag', result.etag).send({ ...result.view, operationId: result.operationId, receipt: result.receipt });
  });
  app.get('/api/v1/projects/:projectId/configuration-options', { schema: { params: ProjectParams, querystring: ConfigurationOptionsQuery, response: { 200: ConfigurationOptions, ...errors } } }, async (request) => projects.getConfigurationOptions(request.params.projectId, request.query));
}
