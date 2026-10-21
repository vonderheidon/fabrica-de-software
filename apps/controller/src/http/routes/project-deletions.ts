import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { DeletionConfirmation, DeletionPreview, DeletionResume, DeletionStatus, EmptyQuery, ErrorResponse, OperationId, ProjectParams } from '#contracts';
import type { Storage } from '../../modules/storage/index.js';
import type { createProjectDeletions, createDeletionCoordinator } from '../../modules/projects/index.js';
import { HttpError } from '../errors.js';
import { commandHeaders } from '../security/index.js';

export function installProjectDeletionRoutes(instance: FastifyInstance, storage: Storage,
  service: ReturnType<typeof createProjectDeletions>, coordinator: Pick<ReturnType<typeof createDeletionCoordinator>, 'resume'>): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  const params = Type.Object({ operation_id: OperationId }, { additionalProperties: false });
  app.get('/api/v1/projects/:projectId/deletion-preview', {
    schema: { params: ProjectParams, querystring: EmptyQuery, response: { 200: DeletionPreview, ...errors } },
  }, async (request, reply) => {
    const result = await service.preview(request.params.projectId);
    return reply.header('ETag', result.etag).send(result.view);
  });
  app.post('/api/v1/projects/:projectId/deletion', {
    schema: { params: ProjectParams, querystring: EmptyQuery, body: DeletionConfirmation, response: { 200: DeletionStatus, 202: DeletionStatus, ...errors } },
  }, async (request, reply) => {
    const headers = commandHeaders(request);
    const status = await service.accept({ ...headers, projectId: request.params.projectId, body: request.body });
    return reply.code(status.state === 'succeeded' ? 200 : 202)
      .header('Location', `/api/v1/project-deletions/${status.operation_id}`).send(status);
  });
  app.get('/api/v1/project-deletions/:operation_id', {
    schema: { params, querystring: EmptyQuery, response: { 200: DeletionStatus, ...errors } },
  }, async (request) => {
    const status = storage.getProjectDeletion(request.params.operation_id);
    if (!status) throw new HttpError(404, 'OPERATION_NOT_FOUND', 'A exclusão não foi encontrada nesta instalação e conta.');
    return status;
  });
  app.post('/api/v1/project-deletions/:operation_id/resume', {
    schema: { params, querystring: EmptyQuery, body: DeletionResume, response: { 200: DeletionStatus, 202: DeletionStatus, ...errors } },
  }, async (request, reply) => {
    const { operationId } = commandHeaders(request);
    if (operationId !== request.params.operation_id) throw new HttpError(400, 'IDEMPOTENCY_KEY_INVALID', 'Use a chave original da exclusão para tentar novamente.');
    const status = await coordinator.resume(operationId);
    if (!status) throw new HttpError(404, 'OPERATION_NOT_FOUND', 'A exclusão não foi encontrada nesta instalação e conta.');
    return reply.code(status.state === 'succeeded' ? 200 : 202)
      .header('Location', `/api/v1/project-deletions/${operationId}`).send(status);
  });
}
