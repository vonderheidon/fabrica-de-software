import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { CreateScaffold, CreationParams, CreationView, EmptyQuery, ErrorResponse, OperationAccepted, ScaffoldInput, ScaffoldOptions, ScaffoldPlanned } from '#contracts';
import type { Scaffold } from '../../modules/projects/index.js';
import type { Storage } from '../../modules/storage/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';

export function installScaffoldRoutes(instance: FastifyInstance, scaffold: Scaffold, storage: Storage): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>(); const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.get('/api/v1/scaffold/options', { schema: { querystring: EmptyQuery, response: { 200: ScaffoldOptions, ...errors } } }, async () => scaffold.getOptions());
  app.post('/api/v1/scaffold/plans', { schema: { querystring: EmptyQuery, body: ScaffoldInput, response: { 200: ScaffoldPlanned, ...errors } } }, async request => scaffold.plan(request.body));
  app.post('/api/v1/scaffold/creations', { schema: { querystring: EmptyQuery, body: CreateScaffold, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await scaffold.create(request.body,commandHeaders(request).operationId);
    return sendOperationAccepted(reply,request.id,storage,operation.operationId);
  });
  app.get('/api/v1/scaffold/creations/:creationId', { schema: { querystring: EmptyQuery, params: CreationParams, response: { 200: CreationView, ...errors } } }, async (request, reply) => {
    const view = scaffold.getCreation(request.params.creationId);
    return reply.header('ETag', `"creation:${view.creation.id}:${view.creation.revision}"`).send(view);
  });
}
