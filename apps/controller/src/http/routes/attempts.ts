import { toHttpAttemptMeasurements, toHttpQuestion, toHttpRoundHistory, toHttpAttemptPage, toHttpAttemptDetail, fromHttpAnswerQuestion, fromHttpStartAttempt, fromHttpAttemptListQuery, fromHttpAttemptDetailQuery, fromHttpMakeAttemptDecision } from '../execution-views.js';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { HttpAnswerQuestion as AnswerQuestion, QuestionParams, HttpQuestion as Question, HttpAttemptMeasurements as AttemptMeasurements, AttemptParams, EmptyQuery, ErrorResponse, OperationAccepted, HttpStartAttempt as StartAttempt, HttpRoundHistory as RoundHistory } from '#contracts';
import type { Pipeline } from '../../modules/pipeline/index.js';
import type { Storage } from '../../modules/storage/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';
import { installRecoveryRoutes } from './recovery.js';
import { installPublicationRoutes } from './publication.js';
import { createQueries } from '../../modules/queries/index.js';
import { HttpAttemptDetail as AttemptDetail, HttpAttemptDetailQuery as AttemptDetailQuery, HttpAttemptListQuery as AttemptListQuery, HttpAttemptPage as AttemptPage } from '#contracts';
import { HttpMakeAttemptDecision as MakeAttemptDecision } from '#contracts';

export function installAttemptRoutes(instance: FastifyInstance, pipeline: Pipeline, storage: Storage): void {
  installRecoveryRoutes(instance, pipeline, storage);
  installPublicationRoutes(instance, pipeline, storage);
  const queries = createQueries(storage);
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.get('/api/v1/attempts/:attemptId/measurements', { schema: { params: AttemptParams, querystring: EmptyQuery, response: { 200: AttemptMeasurements, ...errors } } }, async request => toHttpAttemptMeasurements(storage.getMeasurements(request.params.attemptId)));
  app.get('/api/v1/attempts/:attemptId/questions/:questionId', { schema: { params: QuestionParams, querystring: EmptyQuery, response: { 200: Question, ...errors } } }, async (request, reply) => {
    const question = storage.getQuestion(request.params.attemptId, request.params.questionId);
    return reply.header('ETag', question.etag).send(toHttpQuestion(question.view));
  });
  app.post('/api/v1/attempts/:attemptId/questions/:questionId/answer', { schema: { params: QuestionParams, querystring: EmptyQuery, body: AnswerQuestion, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await pipeline.answerQuestion({ ...request.params, ...commandHeaders(request), body: fromHttpAnswerQuestion(request.body) });
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
  app.post('/api/v1/attempts/:attemptId/decisions', { schema: { params: AttemptParams, querystring: EmptyQuery, body: MakeAttemptDecision, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await pipeline.makeAttemptDecision(request.params.attemptId, fromHttpMakeAttemptDecision(request.body), commandHeaders(request));
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
  app.get('/api/v1/attempts/:attemptId/rounds', { schema: { params: AttemptParams, querystring: EmptyQuery, response: { 200: RoundHistory, ...errors } } }, async request => toHttpRoundHistory(storage.getRounds(request.params.attemptId)));
  app.post('/api/v1/attempts', { schema: { querystring: EmptyQuery, body: StartAttempt, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await pipeline.startAttempt(fromHttpStartAttempt(request.body), commandHeaders(request));
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
  app.get('/api/v1/attempts', { schema: { querystring: AttemptListQuery, response: { 200: AttemptPage, ...errors } } }, async request => toHttpAttemptPage(queries.listAttempts(fromHttpAttemptListQuery(request.query))));
  app.get('/api/v1/attempts/:attemptId', { schema: { params: AttemptParams, querystring: AttemptDetailQuery, response: { 200: AttemptDetail, ...errors } } }, async (request, reply) => {
    const status = queries.getAttempt(request.params.attemptId, fromHttpAttemptDetailQuery(request.query));
    return reply.header('ETag', `"${status.id}:${status.revision}"`).send(toHttpAttemptDetail(status));
  });
}
