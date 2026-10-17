import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Review, ProducerResult } from '#contracts';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ArtifactParams, CheckHistory, CheckHistoryQuery, CaptureRetry, CaptureRetryParams, DeliveryDiff, DeliveryDiffQuery, DeliveryParams, EmptyQuery, ErrorResponse, OperationAccepted } from '#contracts';
import type { Pipeline } from '../../modules/pipeline/index.js';
import type { Storage } from '../../modules/storage/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';
import { createQueries } from '../../modules/queries/index.js';
import { DeliveryDetail, DeliveryDetailQuery } from '#contracts';

export function installDeliveryRoutes(instance: FastifyInstance, pipeline: Pipeline, storage: Storage): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const queries = createQueries(storage);
  const errors = { 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse, 412: ErrorResponse, 428: ErrorResponse, 503: ErrorResponse };
  app.get('/api/v1/deliveries/:deliveryId/review', { schema: { params: DeliveryParams, querystring: EmptyQuery, response: { 200: Type.Union([Review, Type.Null()]), ...errors } } }, async request => storage.getReview(request.params.deliveryId));
  app.get('/api/v1/deliveries/:deliveryId/producer-result', { schema: { params: DeliveryParams, querystring: EmptyQuery, response: { 200: ProducerResult, ...errors } } }, async request => storage.getProducerResult(request.params.deliveryId));
  app.get('/api/v1/deliveries/:deliveryId/checks', { schema: { params: DeliveryParams, querystring: CheckHistoryQuery, response: { 200: CheckHistory, ...errors } } }, async request => storage.getCheckHistory(request.params.deliveryId, request.query));
  app.get('/api/v1/artifacts/:artifactId', { schema: { params: ArtifactParams, querystring: EmptyQuery, response: { 200: Type.Unsafe<Buffer>({ type: 'string' }), ...errors } } }, async (request, reply) => {
    const artifact = await pipeline.getArtifact(request.params.artifactId);
    return reply.type('text/plain; charset=utf-8').header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Content-Disposition', `attachment; filename="${artifact.filename}"`)
      .header('Cache-Control', 'no-store').send(artifact.bytes);
  });
  app.get('/api/v1/deliveries/:deliveryId', { schema: { params: DeliveryParams, querystring: DeliveryDetailQuery, response: { 200: DeliveryDetail, ...errors } } }, async (request, reply) => {
    const view = queries.getDelivery(request.params.deliveryId, request.query);
    const attempt = storage.getAttempt(view.delivery.attemptId);
    return reply.header('ETag', `"${view.delivery.id}:${view.delivery.revision}:${attempt.revision}"`).send(view);
  });
  app.get('/api/v1/deliveries/:deliveryId/diff', { schema: { params: DeliveryParams, querystring: DeliveryDiffQuery, response: { 200: DeliveryDiff, ...errors } } }, async request => pipeline.getDeliveryDiff(request.params.deliveryId, request.query));
  app.post('/api/v1/attempts/:attemptId/deliveries/:deliveryId/capture/retry', { schema: { params: CaptureRetryParams, querystring: EmptyQuery, body: CaptureRetry, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await pipeline.retryCapture({ ...commandHeaders(request), ...request.params, body: request.body });
    return sendOperationAccepted(reply, request.id, storage, operation.operationId);
  });
}
