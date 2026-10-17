import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AttemptParams, AttemptResources, CancelAttempt, EmptyBody, EmptyQuery, ErrorResponse, FolderSurface,
  InteractionParams, OperationAccepted, PassageInteraction, RemovalPlan, RemoveResource, ResourceParams } from '#contracts';
import type { Pipeline } from '../../modules/pipeline/index.js';
import type { Storage } from '../../modules/storage/index.js';
import { CaptureError } from '../../modules/workspaces/index.js';
import { OperationError } from '../../modules/storage/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';

async function inspected<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) { if (error instanceof CaptureError) throw new OperationError(409, error.code, 'The registered environment could not be safely inspected.'); throw error; }
}
export function installRecoveryRoutes(instance: FastifyInstance, pipeline: Pipeline, storage: Storage): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>(); const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.post('/api/v1/attempts/:attemptId/cancel', { schema: { params: AttemptParams, querystring: EmptyQuery, body: CancelAttempt, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const op = await pipeline.cancelAttempt(request.params.attemptId, request.body, commandHeaders(request));
    return sendOperationAccepted(reply, request.id, storage, op.operationId);
  });
  app.get('/api/v1/attempts/:attemptId/resources', { schema: { params: AttemptParams, querystring: EmptyQuery, response: { 200: AttemptResources, ...errors } } }, async request => pipeline.getResources(request.params.attemptId));
  app.get('/api/v1/attempts/:attemptId/resources/:resourceId/removal-plan', { schema: { params: ResourceParams, querystring: EmptyQuery, response: { 200: RemovalPlan, ...errors } } }, async (request, reply) => {
    const plan = await inspected(() => pipeline.getRemovalPlan(request.params.attemptId, request.params.resourceId));
    return reply.header('ETag', plan.etag).send(plan.view);
  });
  app.post('/api/v1/attempts/:attemptId/resources/:resourceId/remove', { schema: { params: ResourceParams, querystring: EmptyQuery, body: RemoveResource, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const op = await inspected(() => pipeline.removeResource(request.params.attemptId, request.params.resourceId, request.body, commandHeaders(request)));
    return sendOperationAccepted(reply, request.id, storage, op.operationId);
  });
  app.get('/api/v1/attempts/:attemptId/passages/:passageId/interaction', { schema: { params: InteractionParams, querystring: EmptyQuery, response: { 200: PassageInteraction, ...errors } } }, async request => pipeline.getInteraction(request.params.attemptId, request.params.passageId));
  app.post('/api/v1/attempts/:attemptId/passages/:passageId/interaction/open', { schema: { params: InteractionParams, querystring: EmptyQuery, body: EmptyBody, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const op = await pipeline.openInteraction(request.params.attemptId, request.params.passageId, commandHeaders(request));
    return sendOperationAccepted(reply, request.id, storage, op.operationId);
  });
  app.get('/api/v1/attempts/:attemptId/resources/:resourceId/folder', { schema: { params: ResourceParams, querystring: EmptyQuery, response: { 200: FolderSurface, ...errors } } }, async request => inspected(() => pipeline.getFolder(request.params.attemptId, request.params.resourceId)));
  app.post('/api/v1/attempts/:attemptId/resources/:resourceId/folder/open', { schema: { params: ResourceParams, querystring: EmptyQuery, body: EmptyBody, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const op = await inspected(() => pipeline.openFolder(request.params.attemptId, request.params.resourceId, commandHeaders(request)));
    return sendOperationAccepted(reply, request.id, storage, op.operationId);
  });
}
