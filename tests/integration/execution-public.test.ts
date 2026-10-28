import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { HttpAttemptDetail, HttpAttemptPage, HttpQuestion, HttpAttemptMeasurements, HttpDeliveryDetail, HttpReview, HttpProducerResult, HttpRoundHistory, HttpAttemptResources, type OperationAccepted } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { attemptFixture } from '../fixtures/attempt.js';
import { publicationFixture } from '../fixtures/publication.js';
import { startAttemptBody, answerQuestionBody } from '../../apps/web/src/features/attempts/execution-requests.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function session(app: ReturnType<typeof createApp>) {
  const base = { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'content-type': 'application/json', 'x-factory-client': 'web' };
  const boot = await app.inject({ method: 'POST', url: '/api/v1/session', headers: base, payload: {} });
  expect(boot.statusCode).toBe(200);
  return { ...base, cookie: String(boot.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': boot.json<{ csrf_token: string }>().csrf_token };
}

it('rejects old command and query aliases without durable writes, preserving path identities and HTTP security', async () => {
  const f = await attemptFixture(); cleanup.push(() => f.close());
  const app = createApp(loadConfiguration({ FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined, undefined, undefined, f.pipeline);
  cleanup.push(() => app.close());
  const headers = await session(app);
  const prepared = await f.prepare();
  const canonical = startAttemptBody(prepared.body.preparationId, prepared.body.preparationRevision, prepared.body.authorizedSummaryHash);
  const id = randomUUID();
  const before = f.db.prepare('SELECT * FROM operation_requests ORDER BY operation_id').all();
  const cases = [
    { url: '/api/v1/attempts', payload: prepared.body },
    { url: '/api/v1/attempts', payload: { ...canonical, preparationId: prepared.body.preparationId } },
    { url: `/api/v1/attempts/${id}/questions/${id}/answer`, payload: { answer: 'Decision', scope_choice: 'keep_captured', scopeChoice: 'keep_captured' } },
    { url: `/api/v1/attempts/${id}/deliveries/${id}/capture/retry`, payload: { producer_passage_id: id, producerPassageId: id } },
    { url: `/api/v1/attempts/${id}/resources/${id}/remove`, payload: { plan_hash: 'a'.repeat(64), planHash: 'a'.repeat(64), confirmed: true } },
    { url: `/api/v1/attempts/${id}/publication/complete`, payload: { delivery_id: id, authorized_mode: 'icr', authorizedMode: 'icr', authorized: true } },
    { url: `/api/v1/attempts/${id}/publication/reconcile`, payload: { delivery_id: id, deliveryId: id } },
    { url: `/api/v1/attempts/${id}/publication/authorize-upgrade`, payload: { delivery_id: id, current_mode: 'icr', target_mode: 'pr', authorized_additional_effects_hash: 'a'.repeat(64), authorized: true, targetMode: 'pr' } },
  ];
  for (const request of cases) {
    const response = await app.inject({ method: 'POST', ...request, headers: { ...headers, 'idempotency-key': randomUUID(), 'if-match': '"fixture"' } });
    expect(response.statusCode, response.body).toBe(400);
  }
  for (const url of [`/api/v1/attempts?projectId=${f.projectId}`, `/api/v1/attempts/${id}?roundId=1`, `/api/v1/attempts/${id}?deliveryId=${id}`, `/api/v1/attempts/${id}?round_id=1&roundId=1`]) {
    expect((await app.inject({ url, headers })).statusCode).toBe(400);
  }
  expect(f.db.prepare('SELECT * FROM operation_requests ORDER BY operation_id').all()).toEqual(before);
  expect(f.execution.startPassage).not.toHaveBeenCalled();
  const accepted = await app.inject({ method: 'POST', url: '/api/v1/attempts', headers: { ...headers, 'idempotency-key': prepared.context.operationId, 'if-match': prepared.context.expectedRevision }, payload: canonical });
  expect(accepted.statusCode, accepted.body).toBe(202);
  await f.pipeline.drain();
  const attemptId = accepted.json<OperationAccepted>().resource.id;
  const detail = await app.inject({ url: `/api/v1/attempts/${attemptId}?round_id=1`, headers });
  expect(Value.Check(HttpAttemptDetail, detail.json())).toBe(true);
  expect(detail.json()).toMatchObject({ id: attemptId, project_id: f.projectId, operation_id: prepared.context.operationId, selected_round: 1 });
  expect(detail.json()).not.toHaveProperty('projectId');
  const list = await app.inject({ url: `/api/v1/attempts?project_id=${f.projectId}&limit=1`, headers });
  expect(Value.Check(HttpAttemptPage, list.json())).toBe(true);
  expect(list.json()).toMatchObject({ items: [{ id: attemptId, project_id: f.projectId, issue_id: f.issue.id }] });
  expect(f.db.prepare('SELECT request_hash FROM operation_requests WHERE operation_id=?').get(prepared.context.operationId)).toEqual({ request_hash: digest({
    method: 'POST', route: '/api/v1/attempts', body: prepared.body, expectedRevision: prepared.context.expectedRevision,
  }) });
});

it('keeps question and answer correlation through delivery_unknown, late receipt and replay without a second dispatch', async () => {
  const f = await attemptFixture(); cleanup.push(() => f.close());
  const app = createApp(loadConfiguration({ FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined, undefined, undefined, f.pipeline);
  cleanup.push(() => app.close());
  const headers = await session(app);
  const prepared = await f.prepare(); const started = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const attemptId = started.resource.id; const handle = { passageId: f.storage.getAttempt(attemptId).passageId };
  const binding = f.persistence.getPassage(handle).binding;
  const question = { formatVersion: 1 as const, decision: 'Choose scopeChoice', context: '{"deliveryId":"operator content"} 😀', alternatives: ['Keep', 'Adopt'] };
  const raised = f.persistence.raiseQuestion({ binding, question, sha256: digest(question) });
  const url = `/api/v1/attempts/${attemptId}/questions/${raised.questionId}`;
  const read = await app.inject({ url, headers });
  expect(Value.Check(HttpQuestion, read.json())).toBe(true);
  expect(read.json()).toMatchObject({ attempt_id: attemptId, passage_id: binding.passageId, delivery_id: binding.deliveryVersion,
    question: { format_version: 1, context: question.context }, delivery_receipt: null });
  const key = randomUUID();
  vi.mocked(f.execution.answerQuestion).mockImplementation(async (h, questionId, answer, operationId) => {
    expect(h).toEqual(handle); expect(questionId).toBe(raised.questionId); expect(answer).toBe('Keep passageId literal');
    f.persistence.recordAnswer(h, questionId, answer, operationId); f.persistence.claimAnswer(h, operationId);
    return f.persistence.confirmAnswer(h, operationId, 'delivery_unknown');
  });
  const command = { method: 'POST' as const, url: url+'/answer', headers: { ...headers, 'idempotency-key': key, 'if-match': String(read.headers.etag) }, payload: answerQuestionBody('Keep passageId literal') };
  expect((await app.inject({ ...command, headers: { ...command.headers, 'x-csrf-token': '' } })).statusCode).toBe(403);
  const accepted = await app.inject(command); expect(accepted.statusCode, accepted.body).toBe(202); await f.pipeline.drain();
  const unknown = await app.inject({ url, headers }); expect(Value.Check(HttpQuestion, unknown.json())).toBe(true);
  expect(unknown.json()).toMatchObject({ state: 'delivery_unknown', answer_operation_id: key, delivery_receipt: null, passage_id: binding.passageId });
  expect(f.storage.getAttempt(attemptId).suspension).toBe('HUMAN_DECISION');
  const replay = await app.inject(command); expect(replay.statusCode).toBe(202);
  expect(replay.json<OperationAccepted>().receipt).toEqual(accepted.json<OperationAccepted>().receipt);
  expect(f.execution.answerQuestion).toHaveBeenCalledTimes(1);
  f.persistence.confirmAnswer(handle, key, 'delivered');
  const delivered = await app.inject({ url, headers }); expect(Value.Check(HttpQuestion, delivered.json())).toBe(true);
  expect(delivered.json()).toMatchObject({ state: 'delivered', delivery_receipt: { operation_id: key, question_id: raised.questionId, passage_id: binding.passageId } });
  expect(f.storage.getAttempt(attemptId).suspension).toBeNull();
  const metrics = await app.inject({ url: `/api/v1/attempts/${attemptId}/measurements`, headers });
  expect(Value.Check(HttpAttemptMeasurements, metrics.json())).toBe(true);
  expect((await app.inject({ url: `/api/v1/attempts/${randomUUID()}/questions/${raised.questionId}`, headers })).statusCode).toBe(404);
  expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
});

it('projects both historical versions, official results, checks and publication without rewriting private JSON or identities after reopen', async () => {
  const f = await publicationFixture(false); cleanup.push(() => f.close());
  await f.implement(); const first = f.status().deliveryId!; await f.approve(false);
  await f.implement(); const second = f.status().deliveryId!; await f.approve();
  const app = createApp(loadConfiguration({ FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined, undefined, undefined, f.pipeline);
  cleanup.push(() => app.close()); const headers = await session(app);
  const snapshots = () => ({ captures: f.db.prepare('SELECT id,capture_json FROM attempts ORDER BY id').all(),
    results: f.db.prepare('SELECT * FROM passage_results ORDER BY passage_id').all(),
    criteria: f.db.prepare('SELECT * FROM criterion_results ORDER BY passage_id,criterion_id').all(),
    reviews: f.db.prepare('SELECT * FROM reviews ORDER BY id').all(),
    preparations: f.db.prepare('SELECT * FROM preparation_revisions ORDER BY preparation_id,revision').all(),
    operations: f.db.prepare('SELECT * FROM operation_requests ORDER BY operation_id').all() });
  const before = snapshots(); const changes = f.db.prepare('SELECT total_changes() AS n').get();
  for (const [id, round, state] of [[first, 1, 'rejected'], [second, 2, 'approved']] as const) {
    const detail = await app.inject({ url: `/api/v1/attempts/${f.attemptId}?round_id=${round}&delivery_id=${id}&section=criteria&limit=1`, headers });
    expect(detail.statusCode, detail.body).toBe(200); expect(Value.Check(HttpAttemptDetail, detail.json())).toBe(true);
    expect(detail.json()).toMatchObject({ selected_delivery_id: id, selected_round: round, publication: { review_state: state } });
    for (const section of ['rounds', 'passages', 'criteria', 'reviews', 'findings', 'questions', 'effects', 'resources']) {
      const page = await app.inject({ url: `/api/v1/attempts/${f.attemptId}?round_id=${round}&delivery_id=${id}&section=${section}&limit=1`, headers });
      expect(page.statusCode, page.body).toBe(200); expect(Value.Check(HttpAttemptDetail, page.json())).toBe(true);
    }
    const expected = f.storage.getDelivery(id).delivery;
    const delivery = await app.inject({ url: `/api/v1/deliveries/${id}`, headers });
    expect(Value.Check(HttpDeliveryDetail, delivery.json())).toBe(true);
    expect(delivery.json()).not.toHaveProperty('verification');
    expect(delivery.json()).toMatchObject({ delivery: { id, git_ref: expected.gitRef, content_identity: expected.contentIdentity, base_sha: expected.baseSha, producer_passage_id: expected.producerPassageId }, review: { state, content_identity: expected.contentIdentity } });
    const review = await app.inject({ url: `/api/v1/deliveries/${id}/review`, headers }); expect(Value.Check(HttpReview, review.json())).toBe(true);
    const producer = await app.inject({ url: `/api/v1/deliveries/${id}/producer-result`, headers }); expect(Value.Check(HttpProducerResult, producer.json())).toBe(true);
    expect(producer.json()).toMatchObject({ binding: { attempt_id: f.attemptId, delivery_version: id, round }, result: { format_version: 1, writes_stopped: true, criteria: [{ criterion_id: 'ac-1' }, { criterion_id: 'ac-2' }] } });
    expect((await app.inject({ url: `/api/v1/attempts/${f.attemptId}?section=checks`, headers })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/v1/deliveries/${id}/checks`, headers })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/artifacts/${randomUUID()}`, headers })).statusCode).toBe(404);
  }
  const rounds = await app.inject({ url: `/api/v1/attempts/${f.attemptId}/rounds`, headers }); expect(Value.Check(HttpRoundHistory, rounds.json())).toBe(true);
  const resources = await app.inject({ url: `/api/v1/attempts/${f.attemptId}/resources`, headers }); expect(Value.Check(HttpAttemptResources, resources.json())).toBe(true);
  expect(snapshots()).toEqual(before); expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
  const firstIdentity = f.storage.getDelivery(first).delivery.contentIdentity;
  await app.close(); await f.pipeline.close(); f.storage.close(); const closed = snapshots();
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    expect(reopened.getAttemptCapture(f.attemptId).formatVersion).toBe(1);
    expect(reopened.getProducerResult(first)?.binding.deliveryVersion).toBe(first);
    expect(reopened.getReview(first)?.state).toBe('rejected'); expect(reopened.getReview(second)?.state).toBe('approved');
    expect(reopened.getDeliveryDetail(first, {}).delivery.contentIdentity).toBe(firstIdentity);
    expect(snapshots()).toEqual(closed);
  } finally { reopened.close(); }
});
