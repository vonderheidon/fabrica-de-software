import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { EmptyQuery, ErrorResponse, QueueCommand, QueueQuery, QueueSaved, QueueObservation, QueueConflict } from '#contracts';
import { QueueSummaryChanged, type Projects } from '../../modules/projects/index.js';
import { commandHeaders } from '../security/index.js';

export function installQueueRoutes(instance: FastifyInstance, projects: Projects): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.get('/api/v1/queue', { schema: { querystring: QueueQuery, response: { 200: QueueObservation, ...errors } } }, async (request, reply) => {
    const result = await projects.getQueue(request.query);
    return reply.header('ETag', result.etag).send(result.observation);
  });
  app.put('/api/v1/queue', { schema: { querystring: EmptyQuery, body: QueueCommand, response: { 200: QueueSaved, 409: Type.Union([QueueConflict, ErrorResponse]), ...errors } } }, async (request, reply) => {
    try {
      const result = await projects.saveQueue(request.body, commandHeaders(request));
      return reply.header('ETag', result.etag).send({ queue: result.queue, operationId: result.operationId, receipt: result.receipt });
    } catch (error) {
      if (!(error instanceof QueueSummaryChanged)) throw error;
      return reply.code(409).header('ETag', error.current.etag).send({ code: error.code, message: error.message, requestId: request.id, queue: error.current.observation });
    }
  });
}
