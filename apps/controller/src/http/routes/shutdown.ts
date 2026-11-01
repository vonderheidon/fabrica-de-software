import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EmptyQuery, ErrorResponse, ShutdownAccepted, ShutdownCommand } from '#contracts';

export function installShutdownRoutes(instance: FastifyInstance): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const closeRequests = new Set<string>();
  let closing = false;
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };

  app.addHook('onResponse', async (request, reply) => {
    if (!closeRequests.delete(request.id) || reply.statusCode !== 202 || closing) return;
    closing = true;
    setImmediate(() => {
      void app.close().catch(() => {
        app.log.error({ code: 'SHUTDOWN_FAILED' }, 'Controller shutdown failed');
        process.exitCode = 1;
      });
    });
  });

  app.post('/api/v1/shutdown', { schema: { querystring: EmptyQuery, body: ShutdownCommand, response: { 202: ShutdownAccepted, ...errors } } }, async (request, reply) => {
    closeRequests.add(request.id);
    return reply.code(202).send({ state: 'closing' });
  });
}
