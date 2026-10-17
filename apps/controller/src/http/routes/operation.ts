import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { DiagnosticContext, DiagnosticChecks, DiagnosticsView, ErrorResponse, OperationAccepted, OperationSummary, OperationSummaryQuery } from '#contracts';
import type { Storage } from '../../modules/storage/index.js';
import type { Diagnostics } from '../../modules/diagnostics/index.js';
import { createQueries } from '../../modules/queries/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';

export function installOperationRoutes(base: FastifyInstance, storage: Storage, diagnostics: Diagnostics): void {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse }; const queries = createQueries(storage);
  app.get('/api/v1/operation', { schema: { querystring: OperationSummaryQuery, response: { 200: OperationSummary, ...errors } } }, async request => queries.getOperation(request.query));
  app.get('/api/v1/diagnostics', { schema: { querystring: DiagnosticContext, response: { 200: DiagnosticsView, ...errors } } }, async request => diagnostics.get(request.query));
  app.post('/api/v1/diagnostics', { schema: { querystring: DiagnosticContext, body: DiagnosticChecks, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await diagnostics.verify({ ...request.query, ...request.body }, commandHeaders(request).operationId);
    return sendOperationAccepted(reply, request.id, storage, operation.operationId);
  });
}
