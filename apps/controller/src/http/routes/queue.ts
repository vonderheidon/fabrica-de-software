import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { EmptyQuery, ErrorResponse, HttpQueueCommand, HttpQueueQuery, HttpQueueSaved, HttpQueueObservation, HttpQueueConflict } from '#contracts';
import { fromHttpQueueQuery, fromHttpQueueCommand, toHttpQueueObservation } from '../observation-views.js';
import { QueueSummaryChanged, type Projects } from '../../modules/projects/index.js';
import { commandHeaders } from '../security/index.js';

export function installQueueRoutes(instance: FastifyInstance, projects: Projects): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.get('/api/v1/queue', { schema: { querystring: HttpQueueQuery, response: { 200: HttpQueueObservation, ...errors } } }, async (request, reply) => {
    const result = await projects.getQueue(fromHttpQueueQuery(request.query));
    return reply.header('ETag', result.etag).send(toHttpQueueObservation(result.observation));
  });
  app.put('/api/v1/queue', { schema: { querystring: EmptyQuery, body: HttpQueueCommand, response: { 200: HttpQueueSaved, 409: Type.Union([HttpQueueConflict, ErrorResponse]), ...errors } } }, async (request, reply) => {
    try {
      const result = await projects.saveQueue(fromHttpQueueCommand(request.body), commandHeaders(request));
      return reply.header('ETag', result.etag).send({ queue: toHttpQueueObservation(result.queue), operation_id: result.operationId, receipt: result.receipt });
    } catch (error) {
      if (!(error instanceof QueueSummaryChanged)) throw error;
      return reply.code(409).header('ETag', error.current.etag).send({ code: error.code, message: error.message, request_id: request.id, queue: toHttpQueueObservation(error.current.observation) });
    }
  });
}
