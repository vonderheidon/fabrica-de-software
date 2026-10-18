import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { HttpCreateScaffold, CreationParams, HttpCreationView, EmptyBody, EmptyQuery, ErrorResponse, OperationAccepted, HttpScaffoldInput, HttpScaffoldOptions, HttpScaffoldPlanned } from '#contracts';
import { fromHttpScaffoldInput, fromHttpCreateScaffold, toHttpScaffoldPlanned, toHttpScaffoldOptions, toHttpCreationView } from '../observation-views.js';
import type { Scaffold } from '../../modules/projects/index.js';
import type { Storage } from '../../modules/storage/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';

export function installScaffoldRoutes(instance: FastifyInstance, scaffold: Scaffold, storage: Storage): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>(); const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.get('/api/v1/scaffold/options', { schema: { querystring: EmptyQuery, response: { 200: HttpScaffoldOptions, ...errors } } }, async () => toHttpScaffoldOptions(await scaffold.getOptions()));
  app.post('/api/v1/scaffold/plans', { schema: { querystring: EmptyQuery, body: HttpScaffoldInput, response: { 200: HttpScaffoldPlanned, ...errors } } }, async request => toHttpScaffoldPlanned(await scaffold.plan(fromHttpScaffoldInput(request.body))));
  app.post('/api/v1/scaffold/creations', { schema: { querystring: EmptyQuery, body: HttpCreateScaffold, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await scaffold.create(fromHttpCreateScaffold(request.body),commandHeaders(request).operationId);
    return sendOperationAccepted(reply,request.id,storage,operation.operation_id);
  });
  app.get('/api/v1/scaffold/creations/:creationId', { schema: { querystring: EmptyQuery, params: CreationParams, response: { 200: HttpCreationView, ...errors } } }, async (request, reply) => {
    const view = scaffold.getCreation(request.params.creationId);
    return reply.header('ETag', `"creation:${view.creation.id}:${view.creation.revision}"`).send(toHttpCreationView(view));
  });
  app.post('/api/v1/scaffold/creations/:creationId/reconcile', { schema: { querystring: EmptyQuery,params: CreationParams,body: EmptyBody,response: { 202: OperationAccepted,...errors } } },async (request,reply) => {
    const command = commandHeaders(request);
    const operation = await scaffold.reconcile(request.params.creationId,command.operationId,command.expectedRevision);
    return sendOperationAccepted(reply,request.id,storage,operation.operation_id);
  });
}
