import { fromHttpAuthorizeUpgrade, fromHttpCompletePublication, fromHttpReconcilePublication } from '../execution-views.js';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AttemptParams, HttpAuthorizeUpgrade as AuthorizeUpgrade, HttpCompletePublication as CompletePublication, HttpReconcilePublication as ReconcilePublication, EmptyBody, EmptyQuery, ErrorResponse, OperationAccepted } from '#contracts';
import type { Pipeline } from '../../modules/pipeline/index.js';
import type { Storage } from '../../modules/storage/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';

export function installPublicationRoutes(instance: FastifyInstance, pipeline: Pipeline, storage: Storage): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const response = { 202: OperationAccepted, '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.post('/api/v1/attempts/:attemptId/publication/authorize-upgrade', { schema: { params: AttemptParams, querystring: EmptyQuery, body: AuthorizeUpgrade, response } }, async (request,reply) => {
    const operation = await pipeline.authorizePublicationUpgrade(request.params.attemptId,fromHttpAuthorizeUpgrade(request.body),commandHeaders(request));
    return sendOperationAccepted(reply,request.id,storage,operation.operation_id);
  });
  app.post('/api/v1/attempts/:attemptId/publication/complete', { schema: { params: AttemptParams, querystring: EmptyQuery, body: CompletePublication, response } }, async (request, reply) => {
    const operation = pipeline.completePublication(request.params.attemptId, fromHttpCompletePublication(request.body), commandHeaders(request));
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
  app.post('/api/v1/attempts/:attemptId/publication/reconcile', { schema: { params: AttemptParams, querystring: EmptyQuery, body: ReconcilePublication, response } }, async (request, reply) => {
    const operation = pipeline.reconcilePublication(request.params.attemptId, fromHttpReconcilePublication(request.body), commandHeaders(request));
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
  app.post('/api/v1/attempts/:attemptId/revalidate', { schema: { params: AttemptParams, querystring: EmptyQuery, body: EmptyBody, response } }, async (request, reply) => {
    const operation = pipeline.revalidateAuthority(request.params.attemptId, commandHeaders(request));
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
}
