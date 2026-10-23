import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionQuestion, ImplementerResult, SessionResponse } from '#contracts';
import { attemptFixture, complete, type AttemptFixture } from '../fixtures/attempt.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { openStorage, type AnswerCommand } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { removeQuestionSchema } from '../fixtures/question-schema.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(ttl: number | null = null, active = 100_000) {
  const f = await attemptFixture(); fixtures.push(f);
  const settings = f.storage.getGlobalConfiguration();
  f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag,
    changes: { time_defaults: { passage_active_time_ms: active,
      question_ttl: ttl === null ? { state: 'not_configured' } : { state: 'configured', value: ttl, unit: 'ms' } } },
    body: { changes: { time_defaults: { passage_active_time_ms: active, question_ttl: ttl === null ? { state: 'not_configured' } : { state: 'configured', value: ttl, unit: 'ms' } } } } });
  const prepared = await f.prepare(); const op = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const id = op.resource.id; const handle = { passageId: f.storage.getAttempt(id).passageId }; const binding = f.persistence.getPassage(handle).binding;
  const question: ExecutionQuestion = { formatVersion: 1, decision: 'Choose the product behavior', context: 'A real decision with context 😀', alternatives: ['First behavior', 'Second behavior'] };
  const raise = (q = question) => f.persistence.raiseQuestion({ binding, question: q, sha256: digest(q) }).questionId;
  const command = (questionId: string): AnswerCommand => ({ attemptId: id, questionId, operationId: randomUUID(),
    expectedRevision: f.storage.getQuestion(id, questionId).etag, body: { answer: 'First behavior 😀' } });
  const result: ImplementerResult = { formatVersion: 1, summary: 'Implemented', writesStopped: true, checks: [],
    criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed'] })) };
  return { ...f, id, handle, binding, question, raise, command, result };
}

describe('formal decisions and durable answers', () => {
  it('validates schema and exact binding without classifying maintenance; preserves phase, round, tools and capture', async () => {
    const f = await fixture(); const before = f.storage.getAttemptCapture(f.id);
    expect(() => f.persistence.raiseQuestion({ binding: { ...f.binding, deliveryVersion: randomUUID() }, question: f.question, sha256: digest(f.question) })).toThrow('RESULT_INVALID');
    expect(() => f.raise({ ...f.question, alternatives: [] })).toThrow('RESULT_INVALID');
    const q = f.raise({ ...f.question, decision: 'Choose how to repair an auxiliary tool' });
    expect(f.storage.getAttempt(f.id)).toMatchObject({ phase: 'implementing', round: 1, suspension: 'HUMAN_DECISION', tracking: 'tracked', pendingQuestionId: q });
    expect(f.persistence.getPassage(f.handle).state).toBe('ready');
    expect(() => f.persistence.acceptResult({ binding: f.binding, result: f.result, sha256: digest(f.result) })).toThrow('RESULT_INVALID');
    expect(f.persistence.getResult(f.handle)).toBeNull(); expect(f.storage.getAttemptCapture(f.id)).toEqual(before);
    expect(f.execution.cancelAttempt).not.toHaveBeenCalled(); expect(f.execution.continuePassage).not.toHaveBeenCalled();
  });
  it('commits answer/hash/operation/event before sending; only the receipt releases its own suspension', async () => {
    const f = await fixture(); const q = f.raise(); const c = f.command(q);
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(f.execution.answerQuestion).mockImplementation(async (h, questionId, answer, operationId) => {
      expect(f.storage.getQuestion(f.id, q).view).toMatchObject({ state: 'answer_recorded', answer, answerOperationId: operationId, deliveryReceipt: null });
      expect(f.storage.getOperation(operationId)?.state).toBe('accepted');
      expect(f.db.prepare('SELECT answer_hash FROM execution_questions WHERE id=?').get(q)).toEqual({ answer_hash: digest(c.body) });
      expect(f.db.prepare('SELECT event_type FROM events WHERE operation_id=?').get(operationId)).toEqual({ event_type: 'question.answer-recorded' });
      f.persistence.recordAnswer(h, questionId, answer, operationId); expect(f.persistence.claimAnswer(h, operationId)).toBe(true);
      expect(f.persistence.claimAnswer(h, operationId)).toBe(false);
      await pending; return f.persistence.confirmAnswer(h, operationId, 'delivered');
    });
    try {
      const op = await f.pipeline.answerQuestion(c); expect(op.state).toBe('accepted');
      expect(f.storage.getAttempt(f.id).suspension).toBe('HUMAN_DECISION');
      expect(await f.pipeline.answerQuestion(c)).toEqual(op);
      await vi.waitFor(() => expect(f.execution.answerQuestion).toHaveBeenCalledTimes(1));
      expect(f.storage.getQuestion(f.id, q).view.state).toBe('sending');
      expect(f.storage.getOperation(c.operationId)?.state).toBe('running');
    } finally { release(); await f.pipeline.drain(); }
    expect(f.storage.getQuestion(f.id, q).view.deliveryReceipt).toMatchObject({ operationId: c.operationId, questionId: q, passageId: f.handle.passageId });
    expect(f.storage.getOperation(c.operationId)?.state).toBe('succeeded'); expect(f.storage.getAttempt(f.id).suspension).toBeNull();
    expect(f.persistence.acceptResult({ binding: f.binding, result: f.result, sha256: digest(f.result) }).receiptId).toBeDefined();
  });
  it('keeps an uncertain answer paused and queryable; a late correlated receipt reconciles without resend', async () => {
    const f = await fixture(); const q = f.raise(); const c = f.command(q); f.storage.recordAnswer(c);
    expect(f.persistence.claimAnswer(f.handle, c.operationId)).toBe(true);
    f.persistence.confirmAnswer(f.handle, c.operationId, 'delivery_unknown');
    for (let i = 0; i < 3; i++) {
      expect((await f.pipeline.answerQuestion(c)).state).toBe('unknown');
      expect(f.storage.getQuestion(f.id, q).view).toMatchObject({ state: 'delivery_unknown', deliveryReceipt: null });
    }
    expect(f.execution.answerQuestion).not.toHaveBeenCalled(); expect(f.storage.getAttempt(f.id).suspension).toBe('HUMAN_DECISION');
    expect(f.persistence.claimAnswer(f.handle, c.operationId)).toBe(false);
    expect(() => f.persistence.confirmAnswer(f.handle, randomUUID(), 'delivered')).toThrow('ANSWER_CONFLICT');
    f.persistence.confirmAnswer(f.handle, c.operationId, 'delivered');
    const cursor = f.storage.getAttempt(f.id).eventCursor; f.persistence.confirmAnswer(f.handle, c.operationId, 'delivered');
    expect(f.storage.getAttempt(f.id).eventCursor).toBe(cursor);
  });
  it('never clears a different suspension on an answer receipt', async () => {
    const f = await fixture(); const q = f.raise(); const c = f.command(q); f.storage.recordAnswer(c); f.persistence.claimAnswer(f.handle, c.operationId);
    f.storage.recordDispatchFailure(f.id, 'OTHER_DEPENDENCY_MISSING');
    f.persistence.confirmAnswer(f.handle, c.operationId, 'delivered');
    expect(f.storage.getAttempt(f.id)).toMatchObject({ suspension: 'DISPATCH_FAILED', diagnostic: 'OTHER_DEPENDENCY_MISSING' });
  });
  it.each(['missing', 'stale', 'different', 'answered', 'foreign', 'cancelled'] as const)('rejects %s answers without another effect', async kind => {
    const f = await fixture(); const q = f.raise(); const c = f.command(q);
    if (kind === 'missing') c.expectedRevision = undefined;
    if (kind === 'stale') c.expectedRevision = '"old"';
    if (kind === 'different' || kind === 'answered') {
      f.storage.recordAnswer(c);
      if (kind === 'different') c.body = { answer: 'Another answer' }; else c.operationId = randomUUID();
    }
    if (kind === 'foreign') c.questionId = randomUUID();
    if (kind === 'cancelled') f.persistence.recordCancellation(f.id, randomUUID());
    await expect(f.pipeline.answerQuestion(c)).rejects.toMatchObject({ statusCode: kind === 'missing' ? 428 : kind === 'stale' || kind === 'answered' || kind === 'cancelled' ? 412 : kind === 'foreign' ? 404 : 409 });
    expect(f.execution.answerQuestion).not.toHaveBeenCalled();
  });
  it.each(['operation_requests','events','execution_questions'] as const)('rolls back the entire answer command if %s cannot be written', async table => {
    const f = await fixture(); const q = f.raise(); const c = f.command(q); const before = f.storage.getAttempt(f.id);
    f.db.exec(`CREATE TRIGGER fail_answer BEFORE ${table === 'execution_questions' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'fixture'); END`);
    expect(() => f.storage.recordAnswer(c)).toThrow();
    expect(f.storage.getOperation(c.operationId)).toBeNull(); expect(f.storage.getQuestion(f.id, q).view).toMatchObject({ state: 'pending', answer: null });
    expect(f.storage.getAttempt(f.id)).toEqual(before); f.db.exec('DROP TRIGGER fail_answer');
    expect(f.storage.recordAnswer(c).state).toBe('accepted');
  });
  it('refuses busy storage before sending and preserves a delivered answer/receipt across reopen', async () => {
    const f = await fixture(); const q = f.raise(); const c = f.command(q); f.db.exec('BEGIN IMMEDIATE');
    try { await expect(f.pipeline.answerQuestion(c)).rejects.toMatchObject({ code: 'CONFIGURATION_STORAGE_FAILED' }); }
    finally { f.db.exec('ROLLBACK'); }
    expect(f.execution.answerQuestion).not.toHaveBeenCalled(); f.storage.recordAnswer(c); f.persistence.claimAnswer(f.handle, c.operationId); f.persistence.confirmAnswer(f.handle, c.operationId, 'delivered');
    const saved = f.storage.getQuestion(f.id, q); await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try { expect(reopened.getQuestion(f.id, q)).toEqual(saved); expect(reopened.getOperation(c.operationId)?.state).toBe('succeeded'); }
    finally { reopened.close(); }
  });
  it('records delivery_unknown if the original passage cannot accept a committed answer and never retries on lookup', async () => {
    const f = await fixture(); const q = f.raise(); const c = f.command(q);
    vi.mocked(f.execution.answerQuestion).mockRejectedValue(new Error('private runtime error'));
    await f.pipeline.answerQuestion(c); await f.pipeline.drain();
    expect(f.storage.getQuestion(f.id, q).view).toMatchObject({ state: 'delivery_unknown', deliveryReceipt: null });
    expect((await f.pipeline.answerQuestion(c)).state).toBe('unknown'); await f.pipeline.drain();
    expect(f.execution.answerQuestion).toHaveBeenCalledTimes(1); expect(f.storage.getAttempt(f.id).suspension).toBe('HUMAN_DECISION');
    expect(f.logFailure).toHaveBeenCalledWith('PIPELINE_EFFECT_FAILED');
  });
});

describe('captured scope and current criteria', () => {
  it('continues on editorial text/comments outside criteria and creates a linked decision for changed criterion text', async () => {
    const f = await fixture(); f.dependencies.github = f.github;
    const captured = f.storage.getAttemptCapture(f.id);
    f.issue.body += '\n## Notas\nAn editorial clarification.';
    f.issue.comments.push({ id: 'COMMENT_scope', author: { login: 'test-user' }, body: '## Critérios de aceite\n- Comment must not become a criterion', updatedAt: '2026-10-16T00:00:00Z', url: 'https://github.com/test-org/repo/issues/17#issuecomment-1' });
    expect(await f.pipeline.revalidateScope(f.binding)).toBe(true); expect(f.storage.getAttempt(f.id).suspension).toBeNull();
    f.issue.body = f.issue.body.replace('- Same text', '- Changed product behavior');
    expect(await f.pipeline.revalidateScope(f.binding)).toBe(false);
    const id = f.storage.getAttempt(f.id).pendingQuestionId!; const q = f.storage.getQuestion(f.id, id);
    expect(q.view.scopeChange).toMatchObject({ capturedDigest: captured.criteriaDigest, capturedCriteria: captured.criteria });
    expect(q.view.scopeChange?.currentCriteria[0]?.text).toBe('Changed product behavior');
    expect(f.storage.getAttemptCapture(f.id)).toEqual(captured);
    const command = { ...f.command(id), body: { answer: 'Continue the original scope', scopeChoice: 'keep_captured' as const } };
    f.storage.recordAnswer(command); f.persistence.claimAnswer(f.handle, command.operationId); f.persistence.confirmAnswer(f.handle, command.operationId, 'delivered');
    expect(await f.pipeline.revalidateScope(f.binding)).toBe(true);
    expect(f.storage.getAttempt(f.id)).toMatchObject({ round: 1, phase: 'implementing', suspension: null });
    expect(f.storage.getAttemptCapture(f.id)).toEqual(captured);
    f.issue.body = f.issue.body.replace('Changed product behavior', 'Another product behavior');
    expect(await f.pipeline.revalidateScope(f.binding)).toBe(false); expect(f.storage.getAttempt(f.id).pendingQuestionId).not.toBe(id);
  });
  it('requires an explicit scope choice and refuses adoption in the current attempt without changing historical criteria', async () => {
    const f = await fixture(); f.dependencies.github = f.github; const original = f.storage.getAttemptCapture(f.id);
    f.issue.body += '\n- Another acceptance requirement'; expect(await f.pipeline.revalidateScope(f.binding)).toBe(false);
    const id = f.storage.getAttempt(f.id).pendingQuestionId!; const c = f.command(id);
    expect(() => f.storage.recordAnswer(c)).toThrow(expect.objectContaining({ code: 'SCOPE_DECISION_REQUIRED' }));
    expect(() => f.storage.recordAnswer({ ...c, body: { answer: 'Adopt new requirements', scopeChoice: 'adopt_new' } })).toThrow(expect.objectContaining({ code: 'NEW_ATTEMPT_REQUIRED' }));
    expect(f.storage.getOperation(c.operationId)).toBeNull(); expect(f.storage.getAttemptCapture(f.id)).toEqual(original);
  });
  it('refuses partial/inaccessible issue observations and detects changes through the existing periodic coordinator', async () => {
    const f = await fixture(); f.dependencies.github = f.github;
    f.github.getIssueContextById = vi.fn(async () => ({ ...complete(structuredClone(f.issue)), state: 'partial' as const }));
    await expect(f.pipeline.revalidateScope(f.binding)).rejects.toMatchObject({ code: 'SCOPE_OBSERVATION_UNAVAILABLE' });
    f.github.getIssueContextById = vi.fn(async () => complete(structuredClone(f.issue)));
    f.issue.body += '\n- New criterion'; await f.pipeline.tick();
    expect(f.storage.getAttempt(f.id).suspension).toBe('HUMAN_DECISION');
  });
});

describe('independent clocks and limits', () => {
  it('starts without inference limits and keeps cost observations separate', async () => {
    const f = await attemptFixture(); fixtures.push(f);
    f.tools[0]!.state = 'unavailable'; f.tools[0]!.version = null; f.tools[0]!.cause = 'TEST_UNAVAILABLE'; f.tools[0]!.affectedRequirements = ['RF-22'];
    const c = await f.prepare(); const op = await f.pipeline.startAttempt(c.body, c.context); await f.pipeline.drain();
    expect(f.storage.getMeasurements(op.resource.id)).toMatchObject({ cost: { state: 'not_applicable' }, activeTime: { state: 'not_applicable' } });
    f.issue.id = 'I_cost_observed'; f.issue.number = 19;
    Object.assign(f.tools[0]!, { state: 'observed', version: '24.0.0', cause: null, affectedRequirements: [] });
    const ready = await f.prepare(); const started = await f.pipeline.startAttempt(ready.body, ready.context); await f.pipeline.drain();
    const metrics = f.storage.getMeasurements(started.resource.id);
    expect(metrics).toMatchObject({ cost: { state: 'unavailable', reason: 'EXECUTOR_COST_NOT_OBSERVED' } });
    expect(metrics).not.toHaveProperty('costLimit'); expect(metrics).not.toHaveProperty('costLimitState');
    expect(metrics.passages[0]?.activeTime.state).toBe('measured'); expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
  });
  it('measures zero and separates human wait through unknown delivery from active time; silence alone is not failure', async () => {
    const f = await fixture(null, 5000); let now = Date.now(); const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const before = f.storage.getMeasurements(f.id);
    expect(before.humanWait).toEqual({ state: 'measured', value: 0, unit: 'ms' }); expect(before.questionTtl.state).toBe('not_configured');
    now += 1000; const q = f.raise(); const c = f.command(q); f.storage.recordAnswer(c); f.persistence.claimAnswer(f.handle, c.operationId);
    const active = f.storage.getMeasurements(f.id).activeTime; now += 60_000; f.storage.expireLimits();
    f.persistence.confirmAnswer(f.handle, c.operationId, 'delivery_unknown');
    expect(f.storage.getMeasurements(f.id)).toMatchObject({ activeTime: active, humanWait: { state: 'measured', value: 60_000 }, cost: { state: 'unavailable', reason: 'EXECUTOR_COST_NOT_OBSERVED' } });
    expect(f.storage.getAttempt(f.id)).toMatchObject({ tracking: 'tracked', suspension: 'HUMAN_DECISION' });
    f.persistence.confirmAnswer(f.handle, c.operationId, 'delivered'); now += 1000;
    const after = f.storage.getMeasurements(f.id); expect(after.activeTime).toMatchObject({ state: 'measured', value: active.state === 'measured' ? active.value + 1000 : -1 });
    expect(after.pendingRequirements).toEqual(expect.arrayContaining([expect.objectContaining({ cause: 'EXECUTOR_COST_NOT_OBSERVED', affectedRequirements: ['RF-61'] })])); clock.mockRestore();
  });
  it.each([0, 1000])('records question TTL %s expiration, refuses late answers and receipts, without declaring physical stop', async ttl => {
    const f = await fixture(ttl); let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    const q = f.raise(); const c = f.command(q);
    const active = f.storage.getMeasurements(f.id).activeTime;
    if (ttl > 0) { f.storage.recordAnswer(c); f.persistence.claimAnswer(f.handle, c.operationId); }
    now += ttl; f.storage.expireLimits();
    expect(f.storage.getMeasurements(f.id).activeTime).toEqual(active);
    expect(f.storage.getQuestion(f.id, q).view).toMatchObject({ state: 'expired', expiredAtMs: now });
    expect(f.storage.getAttempt(f.id)).toMatchObject({ phase: 'implementing', suspension: 'QUESTION_EXPIRED', round: 1 });
    expect(() => f.persistence.confirmAnswer(f.handle, c.operationId, 'delivered')).toThrow('ANSWER_CONFLICT');
    await expect(f.pipeline.answerQuestion({ ...c, operationId: randomUUID(), expectedRevision: f.storage.getQuestion(f.id, q).etag })).rejects.toMatchObject({ code: 'ANSWER_NOT_ALLOWED' });
    expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
    expect(f.db.prepare("SELECT DISTINCT stop_state FROM resources WHERE attempt_id=?").all(f.id)).toEqual([{ stop_state: 'not_requested' }]);
  });
  it('records active expiration before asking the executor to stop and preserves an uncertain stop receipt', async () => {
    const f = await fixture(null, 1000); const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 1001);
    expect(() => f.persistence.acceptResult({ binding: f.binding, result: f.result, sha256: digest(f.result) })).toThrow('TRACKING_LOST');
    expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
    vi.mocked(f.execution.cancelAttempt).mockImplementation(async (id, op) => {
      expect(f.storage.getMeasurements(id)).toMatchObject({ activeLimitState: 'expired', activeExpiredAtMs: now + 1001 });
      const handles = f.persistence.recordCancellation(id, op);
      for (const h of handles) f.persistence.recordStop(h, { passageId: h.passageId, state: 'uncertain' });
      return handles.map(h => ({ passageId: h.passageId, state: 'uncertain' as const }));
    });
    await f.pipeline.tick(); expect(f.execution.cancelAttempt).toHaveBeenCalledTimes(1); await f.pipeline.tick(); expect(f.execution.cancelAttempt).toHaveBeenCalledTimes(1);
    expect(f.storage.getAttempt(f.id)).toMatchObject({ result: 'cancelled', diagnostic: 'ACTIVE_TIME_EXPIRED' });
    expect(f.db.prepare("SELECT stop_state FROM resources WHERE attempt_id=? AND kind='terminal'").get(f.id)).toEqual({ stop_state: 'uncertain' });
  });
  it('migrates SQLite v8 preserving question identity and bytes, revokes incomplete historical coordination and reports unavailable timing', async () => {
    const f = await fixture(); const q = f.raise(); const old = f.storage.getQuestion(f.id, q).view; const identity = f.storage.getSettings().installation_id;
    await f.pipeline.close(); f.storage.close(); removeQuestionSchema(f.db);
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
    expect(reopened.getDiagnostics().schemaVersion).toBe(34); expect(reopened.getSettings().installation_id).toBe(identity);
      expect(reopened.getQuestion(f.id, q).view).toMatchObject({ id: q, question: old.question, state: 'cancelled', deliveryReceipt: null });
      expect(reopened.getMeasurements(f.id).activeTime.state).toBe('unavailable'); expect(f.db.pragma('foreign_key_check')).toEqual([]);
    } finally { reopened.close(); }
  });
});

it('offers protected question/answer/measurement HTTP with question ETag, operation receipt and no automatic retry', async () => {
  const f = await fixture();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined, undefined, undefined, f.pipeline);
  await app.ready(); // Bootstrap first: createApp interrupts previously running attempts by design.
  f.issue.id = 'I_http'; f.issue.number = 18; const prepared = await f.prepare(); const op = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const id = op.resource.id; const handle = { passageId: f.storage.getAttempt(id).passageId }; const binding = f.persistence.getPassage(handle).binding;
  const q = f.persistence.raiseQuestion({ binding, question: f.question, sha256: digest(f.question) }).questionId;
  const url = `/api/v1/attempts/${id}/questions/${q}`; const host = '127.0.0.1:4310'; const origin = `http://${host}`;
  try {
    expect((await app.inject({ url, headers: { host } })).statusCode).toBe(401);
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
    const headers = { host, origin, cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<SessionResponse>().csrf_token, 'idempotency-key': randomUUID(), 'content-type': 'application/json' };
    const read = await app.inject({ url, headers }); expect(read.statusCode).toBe(200); expect(read.headers['cache-control']).toBe('no-store');
    expect((await app.inject({ method: 'POST', url: url + '/answer', headers, payload: { answer: 'Decision' } })).statusCode).toBe(428);
    expect((await app.inject({ method: 'POST', url: url + '/answer', headers: { ...headers, 'if-match': String(read.headers.etag), 'x-csrf-token': '' }, payload: { answer: 'Decision' } })).statusCode).toBe(403);
    vi.mocked(f.execution.answerQuestion).mockImplementation(async (h, questionId, answer, operationId) => {
      f.persistence.recordAnswer(h, questionId, answer, operationId); f.persistence.claimAnswer(h, operationId);
      return f.persistence.confirmAnswer(h, operationId, 'delivery_unknown');
    });
    const write = () => app.inject({ method: 'POST', url: url + '/answer', headers: { ...headers, 'if-match': String(read.headers.etag) }, payload: { answer: 'Decision 😀' } });
    const accepted = await write(); expect(accepted.statusCode, accepted.body).toBe(202); await f.pipeline.drain();
    expect((await app.inject({ url: String(accepted.headers.location), headers })).json()).toMatchObject({ kind: 'question.answer', state: 'unknown' });
    expect((await write()).statusCode).toBe(202); await f.pipeline.drain(); expect(f.execution.answerQuestion).toHaveBeenCalledTimes(1);
    const metrics = await app.inject({ url: `/api/v1/attempts/${id}/measurements`, headers }); expect(metrics.statusCode, metrics.body).toBe(200);
    expect(metrics.json()).toMatchObject({ cost: { state: 'unavailable' }, question_ttl: { state: 'not_configured' } });
    f.db.prepare("UPDATE factory_settings SET account_id=NULL").run(); expect((await app.inject({ url, headers })).statusCode).toBe(404);
  } finally { await app.close(); }
});
