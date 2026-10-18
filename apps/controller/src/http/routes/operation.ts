import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { HttpDiagnosticContext, HttpDiagnosticChecks, HttpDiagnosticsView, ErrorResponse, OperationAccepted, HttpOperationSummary, HttpOperationSummaryQuery } from '#contracts';
import { fromHttpOperationSummaryQuery, toHttpOperationSummary, toHttpDiagnosticsView } from '../observation-views.js';
import type { Storage } from '../../modules/storage/index.js';
import type { Diagnostics } from '../../modules/diagnostics/index.js';
import { createQueries } from '../../modules/queries/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';

export function installOperationRoutes(base: FastifyInstance, storage: Storage, diagnostics: Diagnostics): void {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse }; const queries = createQueries(storage);
  app.get('/api/v1/operation', { schema: { querystring: HttpOperationSummaryQuery, response: { 200: HttpOperationSummary, ...errors } } }, async request => toHttpOperationSummary(queries.getOperation(fromHttpOperationSummaryQuery(request.query))));
  app.get('/api/v1/diagnostics', { schema: { querystring: HttpDiagnosticContext, response: { 200: HttpDiagnosticsView, ...errors } } }, async request => toHttpDiagnosticsView(diagnostics.get(request.query)));
  app.post('/api/v1/diagnostics', { schema: { querystring: HttpDiagnosticContext, body: HttpDiagnosticChecks, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await diagnostics.verify({ ...request.query, ...request.body }, commandHeaders(request).operationId);
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
}
