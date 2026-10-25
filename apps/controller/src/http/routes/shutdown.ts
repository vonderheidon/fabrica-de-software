import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EmptyQuery, ErrorResponse, OperationAccepted, ShutdownCommand, ShutdownQuery, ShutdownView } from '#contracts';
import { shutdownETag, type Storage } from '../../modules/storage/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';
import { createShutdownCoordinator } from '../../modules/shutdown/index.js';

export function installShutdownRoutes(instance: FastifyInstance, storage: Storage): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const coordinator = createShutdownCoordinator({ storage, close: async () => { await app.close(); },
    reportFailure: () => app.log.error({ code: 'SHUTDOWN_FAILED' }, 'Guided shutdown failed') });
  const accepted = new Map<string, string>();
  app.addHook('onResponse', async (request, reply) => {
    const operationId = accepted.get(request.id);
    accepted.delete(request.id);
    if (operationId && reply.statusCode === 202) coordinator.follow(operationId);
  });
  app.addHook('preClose', async () => { coordinator.stop(); });
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.get('/api/v1/shutdown', { schema: { querystring: ShutdownQuery, response: { 200: ShutdownView, ...errors } } }, async (request, reply) => {
    const view = storage.getShutdown(request.query);
    return reply.header('ETag', shutdownETag(view)).send(view);
  });
  app.post('/api/v1/shutdown', { schema: { querystring: EmptyQuery, body: ShutdownCommand, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = storage.acceptShutdown({ ...commandHeaders(request), body: request.body });
    if (request.body.action === 'close_when_idle') accepted.set(request.id, operation.operation_id);
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
}
