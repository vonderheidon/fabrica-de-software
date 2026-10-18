import { preparationView } from '../configuration-views.js';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { CatalogQuery, EmptyQuery, ErrorResponse, IssueOptions, PreparationChoices, PreparationCreated, PreparationParams, PreparationUpdate, PreparationView, ProjectParams } from '#contracts';
import type { Preparations } from '../../modules/projects/index.js';
import { commandHeaders } from '../security/index.js';

export function installPreparationRoutes(instance: FastifyInstance, preparations: Preparations): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.get('/api/v1/projects/:projectId/issues', { schema: { params: ProjectParams, querystring: CatalogQuery, response: { 200: IssueOptions, ...errors } } },
    async (request) => preparations.listIssues(request.params.projectId, request.query));
  app.post('/api/v1/projects/:projectId/preparations', { schema: { params: ProjectParams, querystring: EmptyQuery, body: PreparationChoices, response: { 201: PreparationCreated, ...errors } } }, async (request, reply) => {
    const result = await preparations.createPreparation(request.params.projectId, request.body, commandHeaders(request));
    return reply.code(201).header('ETag', result.etag).header('Location', `/api/v1/preparations/${result.view.preparation.id}`)
      .send({ ...preparationView(result.view), operation_id: result.operationId, receipt: result.receipt });
  });
  app.get('/api/v1/preparations/:preparationId', { schema: { params: PreparationParams, querystring: EmptyQuery, response: { 200: PreparationView, ...errors } } }, async (request, reply) => {
    const result = await preparations.getPreparation(request.params.preparationId);
    return reply.header('ETag', result.etag).send(preparationView(result.view));
  });
  app.put('/api/v1/preparations/:preparationId', { schema: { params: PreparationParams, querystring: EmptyQuery, body: PreparationUpdate, response: { 200: PreparationCreated, ...errors } } }, async (request, reply) => {
    const result = await preparations.updatePreparation(request.params.preparationId, request.body, commandHeaders(request));
    return reply.header('ETag', result.etag).send({ ...preparationView(result.view), operation_id: result.operationId, receipt: result.receipt });
  });
}
