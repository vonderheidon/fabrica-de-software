import { toHttpRoundHistory, toHttpProducerResult } from '../../apps/controller/src/http/execution-views.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewerResult, type ImplementerResult, type ReviewerResult as ReviewerResultType } from '#contracts';
import { Value } from '@sinclair/typebox/value';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { blockCorrection } from '../../apps/controller/src/modules/storage/progress.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(limit = 2, beforeStart?: (fixture: AttemptFixture) => Promise<void>) {
  const f = await attemptFixture(); fixtures.push(f);
  const config = f.storage.getConfiguration(f.projectId);
  const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAtMs, ...configuration } = config.view.configuration;
  if (limit !== configuration.correction_limit) f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: config.etag, projectId: f.projectId,
    body: { project_changes: { correction_limit: limit } }, globalChanges: {}, configuration: { ...configuration, correction_limit: limit } });
  const materializeReview = vi.fn(async (d: { attemptId: string }, _id: string) => join(f.directory, 'work', d.attemptId, 'implementation'));
  const captureDelivery = vi.fn(async (input: { deliveryId: string }) => ({ gitRef: `refs/factory/deliveries/${input.deliveryId}`,
    contentIdentity: digest(input).slice(0, 40), commitSha: digest({ commit: input }).slice(0, 40), hasDelta: true, warnings: [] }));
  Object.assign(f.workspaces, { captureDelivery, materializeReview,
    getDeliveryDiff: vi.fn(async () => ({ entries: [], nextCursor: null, hasMore: false })) });
  await beforeStart?.(f);
  const preparation = await f.prepare(); const op = await f.pipeline.startAttempt(preparation.body, preparation.context); await f.pipeline.drain();
  const attemptId = op.resource.id;
  const status = () => f.storage.getAttempt(attemptId);
  const producer = () => f.persistence.getPassage({ passageId: status().passageId });
  function implement(additionalChangesJustification: string | null = null, responseType: 'corrected' | 'disputed' = 'corrected',
    checks: ImplementerResult['checks'] = [{ id: 'npm.cmd run typecheck', outcome: 'passed', evidence: 'Observed integration result' }]) {
    const passage = producer(); const previous = f.storage.getOpenFindings(attemptId, passage.binding.round);
    const result: ImplementerResult = { formatVersion: 1, summary: 'Implemented captured scope', writesStopped: true, additionalChangesJustification,
      criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed integration result'] })), checks,
      ...(passage.binding.round > 1 ? { findingResponses: previous.map(x => ({ findingId: x.id, responseType, response: responseType === 'disputed' ? 'The captured criterion requires this behavior.' : 'Corrected behavior', evidence: ['New check evidence'] })) } : {}) };
    return f.persistence.acceptResult({ binding: passage.binding, result, sha256: digest(result) });
  }
  function reviewer() {
    const review = f.storage.getReview(status().deliveryId!)!;
    return { review, passage: f.persistence.getPassage({ passageId: review.passageId }) };
  }
  function result(approved = true): ReviewerResult {
    const { review, passage } = reviewer();
    const prior = f.storage.getOpenFindings(attemptId, passage.binding.round);
    return { formatVersion: 1, summary: approved ? 'Independent review passed' : 'Endpoint returns the wrong value', verdict: approved ? 'approved' : 'rejected',
      assessments: prior.map(finding => ({ findingId: finding.id, progress: 'not_assessable', evidence: [], justification: 'No independent evidence is available to assess progress on this finding.' })),
      criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: approved ? 'passed' : 'failed', evidence: ['Observed exact captured version ' + review.contentIdentity] })),
      findings: approved ? [] : [{ key: 'response-value', criterionIds: ['ac-1'], category: 'correctness', problem: 'Response value is incorrect', evidence: ['GET returned 2 instead of 3'], expectedResult: 'GET returns 3', priority: 'high', blocking: true }],
      resolutions: prior.map(x => ({ findingKey: x.id, verdict: approved ? 'resolved' : 'unresolved', evidence: ['Independently checked response on new tree'] })) };
  }
  function accept(value: ReviewerResult, valid = true) {
    const { passage } = reviewer(); f.storage.recordReviewIntegrity(passage.binding, valid);
    return f.persistence.acceptResult({ binding: passage.binding, result: value, sha256: digest(value) });
  }
  return { ...f, materializeReview, captureDelivery, attemptId, status, producer, implement, reviewer, result, accept };
}

async function disputedFixture(limit = 5, count = 1) {
  const f = await fixture(limit); const initialReceipt = f.implement(); await f.pipeline.drain();
  const first = f.result(false);
  first.findings = Array.from({ length: count }, (_, i) => ({ ...first.findings[0]!, key: `disputed-${i}` }));
  f.accept(first); const original = f.reviewer().review; await f.pipeline.drain();
  return { ...f, original, initialReceipt };
}

async function noProgressBlockedFixture(limit = 4) {
  const f = await fixture(limit);
  for (let round = 1; round <= 3; round++) {
    f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  }
  expect(f.storage.getAttemptBlock(f.attemptId)?.reason).toBe('no_progress');
  return f;
}

it('derives immutable dispute identity from the accepted finding and implementer passage without resolving it', async () => {
  const f = await disputedFixture(); const p = f.producer(); const finding = f.original.findings[0]!;
  const value: ImplementerResult = { ...f.initialReceipt.result as ImplementerResult,
    findingResponses: [{ findingId: finding.id, responseType: 'disputed', response: 'The captured criterion requires this behavior.', evidence: ['New check evidence'] }] };
  for (const response of [
    { ...value.findingResponses![0]!, findingId: randomUUID() },
    { ...value.findingResponses![0]!, responseType: 'invalid' },
    { ...value.findingResponses![0]!, response: ' ' },
    { ...value.findingResponses![0]!, evidence: [] },
    { ...value.findingResponses![0]!, evidence: ['\t'] },
    { ...value.findingResponses![0]!, deliveryId: f.original.deliveryId },
  ]) {
    const invalid = { ...value, findingResponses: [response] } as unknown as ImplementerResult;
    expect(() => f.persistence.acceptResult({ binding: p.binding, result: invalid, sha256: digest(invalid) })).toThrow('RESULT_INVALID');
    expect(f.persistence.getResult(p.handle)).toBeNull();
    expect(f.storage.getPendingFindingDisputes(f.attemptId, 2)).toEqual([]);
  }
  for (const binding of [{ ...p.binding, role: 'reviewer' as const }, { ...p.binding, attemptId: randomUUID() }]) {
    expect(() => f.persistence.acceptResult({ binding, result: value, sha256: digest(value) })).toThrow('RESULT_INVALID');
  }
  const receipt = f.persistence.acceptResult({ binding: p.binding, result: value, sha256: digest(value) });
  const dispute = f.storage.getPendingFindingDisputes(f.attemptId, 2)[0]!;
  expect(dispute).toMatchObject({ attemptId: f.attemptId, findingId: finding.id, passageId: p.binding.passageId,
    deliveryId: f.original.deliveryId, contentIdentity: f.original.contentIdentity, responseReviewId: null, responseVerdict: null });
  expect(f.storage.getOpenFindings(f.attemptId, 3).map(x => x.id)).toContain(finding.id);
  expect(f.storage.getReview(f.original.deliveryId)?.state).toBe('rejected');
  expect(f.persistence.acceptResult({ binding: p.binding, result: value, sha256: digest(value) })).toEqual(receipt);
  expect(f.storage.getPendingFindingDisputes(f.attemptId, 2)).toEqual([dispute]);
  const changed = { ...value, summary: 'Changed report' };
  expect(() => f.persistence.acceptResult({ binding: p.binding, result: changed, sha256: digest(changed) })).toThrow('RESULT_CONFLICT');
  for (const sql of ["UPDATE finding_disputes SET justification='overwritten'", 'DELETE FROM finding_disputes',
    "UPDATE finding_disputes SET response_verdict='resolved'", "UPDATE finding_disputes SET response_review_id='invalid'"])
    expect(() => f.db.exec(sql)).toThrow();
  await f.pipeline.drain();
  const task = JSON.parse(vi.mocked(f.execution.continuePassage).mock.calls.find(c => c[1].binding.role === 'reviewer')![1].task);
  expect(task.disputes).toEqual([dispute]);
  expect(task.producerResult.result.findingResponses[0].responseType).toBe('disputed');
});

it('accepts legacy finding responses without creating a dispute or rewriting the result', async () => {
  const f = await disputedFixture(); const p = f.producer();
  const value: ImplementerResult = { ...f.initialReceipt.result as ImplementerResult,
    findingResponses: [{ findingId: f.original.findings[0]!.id, response: 'Corrected the finding', evidence: ['Current version evidence'] }] };
  const receipt = f.persistence.acceptResult({ binding: p.binding, result: value, sha256: digest(value) });
  expect(receipt.result).toEqual(value);
  expect(f.persistence.acceptResult({ binding: p.binding, result: value, sha256: digest(value) })).toEqual(receipt);
  expect(f.storage.getPendingFindingDisputes(f.attemptId, 2)).toEqual([]);
});

it('requires complete explicit dispute responses and matching finding resolutions atomically', async () => {
  const f = await disputedFixture(5, 2); f.implement(null, 'disputed'); await f.pipeline.drain();
  const disputes = f.storage.getPendingFindingDisputes(f.attemptId, 2); const p = f.reviewer().passage;
  const value = f.result();
  const responses = disputes.map(x => ({ disputeId: x.id, verdict: 'resolved' as const, justification: 'Independent evidence now meets the criterion.', evidence: ['Current version check'] }));
  for (const disputeResponses of [undefined, [], responses.slice(0, 1), [responses[0]!, responses[0]!],
    [{ ...responses[0]!, disputeId: randomUUID() }, responses[1]!],
    [{ ...responses[0]!, verdict: 'maintained' as const }, responses[1]!],
    [{ ...responses[0]!, justification: ' ' }, responses[1]!], [{ ...responses[0]!, evidence: [] }, responses[1]!],
    [{ ...responses[0]!, evidence: [' '] }, responses[1]!],
  ]) {
    const invalid = disputeResponses === undefined ? value : { ...value, disputeResponses };
    expect(() => f.accept(invalid)).toThrow('RESULT_INVALID');
    expect(f.persistence.getResult(p.handle)).toBeNull();
    expect(f.storage.getReview(p.binding.deliveryVersion)?.resolutions).toEqual([]);
    expect(f.db.prepare('SELECT * FROM finding_assessments').all()).toEqual([]);
    expect(f.storage.getPendingFindingDisputes(f.attemptId, 2)).toEqual(disputes);
  }
  const receipt = f.accept({ ...value, disputeResponses: responses });
  expect(f.storage.getReview(p.binding.deliveryVersion)?.state).toBe('approved');
  const history = f.storage.getAttemptDetail(f.attemptId, { section: 'finding_disputes' }).v3Details!;
  expect(history.section).toBe('finding_disputes');
  for (const item of history.items) expect(item).toMatchObject({ responseReviewId: f.reviewer().review.id,
    responseDeliveryId: p.binding.deliveryVersion, responseContentIdentity: f.reviewer().review.contentIdentity,
    deliveryId: f.original.deliveryId, contentIdentity: f.original.contentIdentity, responseVerdict: 'resolved' });
  expect(f.persistence.acceptResult({ binding: p.binding, result: receipt.result, sha256: receipt.sha256 })).toEqual(receipt);
  expect(() => f.db.exec("UPDATE finding_disputes SET response_justification='replacement'")).toThrow();
  expect(() => f.db.exec('UPDATE finding_disputes SET response_review_id=NULL,response_verdict=NULL,response_justification=NULL,response_evidence_json=NULL,responded_at_ms=NULL')).toThrow();
  expect(f.storage.getReview(f.original.deliveryId)).toEqual(f.original);
});

it.each([1, 5])('blocks maintained disputes before another correction, retaining first condition and total limit (%s)', async limit => {
  const f = await disputedFixture(limit); f.implement(null, 'disputed'); await f.pipeline.drain();
  const dispute = f.storage.getPendingFindingDisputes(f.attemptId, 2)[0]!;
  const value = f.result(false); const calls = vi.mocked(f.execution.continuePassage).mock.calls.length;
  const receipt = f.accept({ ...value, disputeResponses: [{ disputeId: dispute.id, verdict: 'maintained', justification: 'The independent check still contradicts the criterion.', evidence: ['GET still returned 2'] }] });
  const block = f.storage.getAttemptBlock(f.attemptId)!;
  expect(block).toMatchObject({ reason: limit === 1 ? 'correction_limit' : 'dispute_maintained', corrections_used: 1, correction_limit: limit,
    delivery_id: f.reviewer().review.deliveryId, content_identity: f.reviewer().review.contentIdentity });
  if (limit > 1) {
    expect(block.finding_ids).toEqual([dispute.findingId]);
    expect(block.evidence).toEqual(expect.arrayContaining(dispute.evidence));
    expect(block.evidence).toEqual(expect.arrayContaining([
      'Contestação do Implementador: The captured criterion requires this behavior.',
      'Resposta do Revisor: The independent check still contradicts the criterion.',
      'GET still returned 2',
    ]));
  }
  await f.pipeline.drain();
  expect(f.status()).toMatchObject({ round: 2, suspension: 'CORRECTION_BLOCKED', result: null });
  expect(vi.mocked(f.execution.continuePassage).mock.calls).toHaveLength(calls);
  expect(f.storage.beginCorrection(receipt.binding.deliveryVersion)).toBeNull();
  expect(f.db.transaction(() => blockCorrection(f.db, f.original.deliveryId))()).toBe(true);
  expect(f.storage.getAttemptBlock(f.attemptId)).toEqual(block);
  expect(f.storage.getRounds(f.attemptId).entries).toHaveLength(2);
});

it('refuses to seal dispute responses from an invalid independent review', async () => {
  const f = await disputedFixture(); f.implement(null, 'disputed'); await f.pipeline.drain();
  const dispute = f.storage.getPendingFindingDisputes(f.attemptId, 2)[0]!; const value = f.result(false);
  value.assessments = [];
  expect(() => f.accept({ ...value, disputeResponses: [{ disputeId: dispute.id, verdict: 'maintained', justification: 'Claimed review.', evidence: ['Claim'] }] }, false)).toThrow('RESULT_INVALID');
  f.accept(value, false);
  expect(f.storage.getPendingFindingDisputes(f.attemptId, 2)).toEqual([dispute]);
  expect(f.storage.getAttemptBlock(f.attemptId)).toBeNull();
});

it('serves scoped paginated dispute history only on demand without mutating or dispatching', async () => {
  const f = await disputedFixture(5, 2); f.implement(null, 'disputed'); await f.pipeline.drain();
  const config = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory);
  const app = createApp(config, f.storage, undefined, undefined, undefined, f.pipeline); await app.ready();
  try {
    const host = new URL(config.browserOrigin).host; const url = `/api/v1/attempts/${f.attemptId}`;
    expect((await app.inject({ url: url + '?section=finding_disputes', headers: { host } })).statusCode).toBe(401);
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin: config.browserOrigin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
    const headers = { host, cookie: session.cookies.map(c => `${c.name}=${c.value}`).join('; ') };
    const calls = vi.mocked(f.execution.continuePassage).mock.calls.length; const before = f.status();
    const summary = await app.inject({ url, headers }); expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({ v3_details: null, details: null });
    expect(summary.json().history_sections).not.toContain('finding_disputes');
    expect(summary.json().history_sections).not.toContain('decisions');
    const originalSummary = await app.inject({ url: url + '?delivery_id=' + f.original.deliveryId, headers });
    expect(originalSummary.statusCode).toBe(200);
    expect(originalSummary.json().history_sections).toContain('finding_disputes');
    expect(originalSummary.json()).toMatchObject({ v3_details: null, details: null });
    expect(summary.body).not.toContain('New check evidence');
    const first = await app.inject({ url: url + '?section=finding_disputes&limit=1', headers });
    expect(first.statusCode).toBe(200); const page = first.json().v3_details;
    expect(page).toMatchObject({ section: 'finding_disputes', has_more: true, items: [{ delivery_id: f.original.deliveryId, content_identity: f.original.contentIdentity, response_review_id: null }] });
    expect(page.items).toHaveLength(1); expect(first.json().details).toBeNull();
    const second = await app.inject({ url: url + '?section=finding_disputes&limit=1&cursor=' + page.next_cursor, headers });
    expect(second.statusCode).toBe(200); expect(second.json().v3_details.has_more).toBe(false);
    expect(second.json().v3_details.items[0].id).not.toBe(page.items[0].id);
    expect((await app.inject({ url: url + '?section=finding_assessments&cursor=' + page.next_cursor, headers })).statusCode).toBe(400);
    expect((await app.inject({ url: url + '?section=finding_disputes&delivery_id=' + randomUUID(), headers })).statusCode).toBe(404);
    const review = await app.inject({ url: `/api/v1/deliveries/${f.status().deliveryId}/review`, headers });
    expect(review.statusCode).toBe(200); expect(review.json().dispute_details_url).toBe(url + '?section=finding_disputes');
    expect(review.body).not.toContain('New check evidence');
    expect(f.status()).toEqual(before); expect(vi.mocked(f.execution.continuePassage).mock.calls).toHaveLength(calls);
    f.db.prepare('UPDATE factory_settings SET account_id=NULL').run();
    expect((await app.inject({ url: url + '?section=finding_disputes', headers })).statusCode).toBe(404);
  } finally { await app.close(); }
});

it('records justified command repetitions without accepting evidence from a different version', async () => {
  const f = await fixture(); f.implement(null, 'corrected', [{ id: 'npm build version one', outcome: 'passed', evidence: 'Build evidence from version one' }]); await f.pipeline.drain();
  f.accept(f.result(false)); await f.pipeline.drain();
  f.implement(null, 'corrected', [{ id: 'npm build version two', outcome: 'passed', evidence: 'Build evidence from version two' }]); await f.pipeline.drain();
  const value: ReviewerResultType = f.result();
  value.commandRepetitions = [{ command: 'npm.cmd test -- tests/integration/reviews.test.ts', prior_evidence: ['Build evidence from version one'], reason: 'Retest the corrected review path.' }];
  expect(Value.Check(ReviewerResult, { ...value, commandRepetitions: [{ ...value.commandRepetitions[0]!, check_id: randomUUID() }] })).toBe(false);
  expect(() => f.accept(value)).toThrow('RESULT_INVALID');
  value.commandRepetitions[0]!.prior_evidence = ['Build evidence from version two'];
  expect(() => f.accept({ ...value, commandRepetitions: [{ ...value.commandRepetitions![0]!, reason: ' ' }] })).toThrow('RESULT_INVALID');
  expect(() => f.accept({ ...value, commandRepetitions: [{ ...value.commandRepetitions![0]!, prior_evidence: [randomUUID()] }] })).toThrow('RESULT_INVALID');
  const receipt = f.accept(value);
  expect(f.reviewer().review.commandRepetitions).toEqual(value.commandRepetitions);
  expect(f.persistence.acceptResult({ binding: receipt.binding, result: value, sha256: digest(value) })).toEqual(receipt);
});

it('supplies only the current producer checks on each corrected version', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); const first = f.reviewer().review;
  const task = JSON.parse(vi.mocked(f.execution.startPassage).mock.calls[1]![0].task);
  expect(task.producerResult).toMatchObject({ result: { checks: f.storage.getProducerResult(first.deliveryId)!.result.checks } });
  expect(task.reviewScope.mode).toBe('complete');
  f.accept(f.result(false)); await f.pipeline.drain(); f.implement(); await f.pipeline.drain();
  const next = f.reviewer().review;
  const request = vi.mocked(f.execution.continuePassage).mock.calls.find(c => c[1].binding.role === 'reviewer')![1];
  expect(JSON.parse(request.task).reviewScope.mode).toBe('focused');
  expect(next.implementerPassageId).not.toBe(first.implementerPassageId);
  expect(JSON.parse(request.task).producerResult).toEqual(f.storage.getProducerResult(next.deliveryId));
});

it('blocks direct SQL approval when current criterion coverage or earlier blockers are omitted', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain();
  const first = f.reviewer(); f.storage.recordReviewIntegrity(first.passage.binding, true);
  expect(() => f.db.prepare("UPDATE reviews SET state='approved' WHERE id=?").run(first.review.id)).toThrow('REVIEW_APPROVAL_INVALID');
  f.accept(f.result(false)); await f.pipeline.drain(); f.implement(); await f.pipeline.drain();
  const current = f.reviewer(); f.storage.recordReviewIntegrity(current.passage.binding, true);
  expect(() => f.db.prepare("UPDATE reviews SET state='approved' WHERE id=?").run(current.review.id)).toThrow('ASSESSMENT_EVIDENCE_INVALID');
  for (const value of [
    { ...f.result(), criteria: [f.result().criteria[0]!] },
    { ...f.result(), criteria: f.result().criteria.map(c => ({ ...c, verdict: 'not_verified' as const })) },
    { ...f.result(), resolutions: [] },
    { ...f.result(), resolutions: f.result().resolutions.map(r => ({ ...r, verdict: 'unresolved' as const })) },
  ]) expect(() => f.accept(value)).toThrow('RESULT_INVALID');
  expect(f.reviewer().review.state).toBe('pending');
  f.accept(f.result());
  expect(f.reviewer().review.state).toBe('approved');
  expect(f.storage.getReview(first.review.deliveryId)?.state).toBe('rejected');
});

it('requires priority for new findings, preserves controller version bindings and deduplicates the receipt', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain();
  const result = f.result(false); const missing = structuredClone(result); delete missing.findings[0]!.priority;
  expect(() => f.accept(missing)).toThrow('RESULT_INVALID');
  expect(f.storage.getReview(f.status().deliveryId!)!.findings).toEqual([]);
  const binding = f.reviewer().passage.binding;
  const receipt = f.accept(result); expect(f.persistence.acceptResult({ binding, result, sha256: digest(result) })).toEqual(receipt);
  const review = f.reviewer().review;
  expect(review.findings[0]).toMatchObject({ priority: 'high', originFindingId: null, deliveryId: review.deliveryId, contentIdentity: review.contentIdentity });
  const forged = { ...result, findings: [{ ...result.findings[0]!, id: randomUUID() } as never] };
  expect(() => f.persistence.acceptResult({ binding, result: forged, sha256: digest(forged) })).toThrow('RESULT_INVALID');
});

it('accepts only a compatible earlier root finding from this attempt, never a private identity or textual guess', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain();
  const original = f.reviewer().review; f.accept(f.result(false)); await f.pipeline.drain();
  const root = f.storage.getReview(original.deliveryId)!.findings[0]!;
  f.implement('Adjusted a shared helper because the supplied finding exposed the same invalid assumption.'); await f.pipeline.drain();
  const result = f.result(false);
  expect(() => f.accept({ ...result, findings: [{ ...result.findings[0]!, originFindingId: randomUUID() }] })).toThrow('RESULT_INVALID');
  expect(() => f.accept({ ...result, findings: [{ ...result.findings[0]!, originFindingId: root.id, criterionIds: ['ac-2'] }] })).toThrow('RESULT_INVALID');
  f.accept({ ...result, findings: [{ ...result.findings[0]!, originFindingId: root.id }] });
  const second = f.reviewer().review;
  expect(second.findings[0]).toMatchObject({ originFindingId: root.id, deliveryId: second.deliveryId });
  expect(f.storage.getReview(original.deliveryId)!.findings[0]).toEqual(root);
  const producer = toHttpProducerResult(f.storage.getProducerResult(second.deliveryId));
  expect(producer!.result.additional_changes_justification).toContain('shared helper');
  await f.pipeline.drain(); f.implement(); await f.pipeline.drain();
  const third = f.result(false);
  expect(() => f.accept({ ...third, findings: [{ ...third.findings[0]!, originFindingId: second.findings[0]!.id }] })).toThrow('RESULT_INVALID');
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('starts independent review for producer gaps and isolated technical failures without manual verification', async () => {
  const f = await fixture(); const p = f.producer();
  const result: ImplementerResult = { formatVersion: 1, summary: 'Partial implementation', writesStopped: true,
    criteria: ['ac-1','ac-2'].map(criterionId => ({ criterionId, verdict: 'not_verified', evidence: ['Browser unavailable; independent review required'] })),
    checks: [{ id: 'browser', outcome: 'technical_error', evidence: 'Browser could not start' }] };
  f.persistence.acceptResult({ binding:p.binding,result,sha256:digest(result) }); await f.pipeline.drain();
  const review = f.reviewer().review;
  expect(review).toMatchObject({ state: 'pending', implementerPassageId: p.binding.passageId });
  expect(review).not.toHaveProperty('verificationId');
  expect(f.storage.getProducerResult(review.deliveryId)?.result.checks).toEqual(result.checks);
});

it('requires an explicit nullable justification in corrections before issuing a receipt', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  const binding = f.producer().binding;
  const result: ImplementerResult = { formatVersion: 1, summary: 'Corrected the supplied findings', writesStopped: true,
    criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Checked'] })), checks: [],
    findingResponses: f.storage.getOpenFindings(f.attemptId, 2).map(finding => ({ findingId: finding.id, responseType: 'corrected' as const, response: 'Corrected', evidence: ['Observed'] })) };
  expect(() => f.persistence.acceptResult({ binding, result, sha256: digest(result) })).toThrow('RESULT_INVALID');
  expect(f.persistence.getResult({ passageId: binding.passageId })).toBeNull();
  result.additionalChangesJustification = null;
  const accepted = f.persistence.acceptResult({ binding, result, sha256: digest(result) });
  expect(f.persistence.acceptResult({ binding, result, sha256: digest(result) })).toEqual(accepted);
});

it('passes a producer technical validation failure to review without executing saved commands', async () => {
  const f = await fixture(2);
  const passage = f.producer();
  const result: ImplementerResult = { formatVersion: 1, summary: 'Validation could not run', writesStopped: true,
    criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'not_verified', evidence: ['The environment did not provide the required runtime'] })),
    checks: [{ id: 'node test.js', outcome: 'technical_error: command unavailable', evidence: 'The shell returned command-not-found before the test started' }] };
  f.persistence.acceptResult({ binding: passage.binding, result, sha256: digest(result) }); await f.pipeline.drain();
  expect(f.status()).toMatchObject({ suspension: null, phase: 'reviewing' });
  expect(f.storage.getOpenFindings(f.attemptId, 2)).toEqual([]);
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2); expect(f.execution.continuePassage).not.toHaveBeenCalled();
  expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('pending');
  expect(f.storage.getProducerResult(f.status().deliveryId!)?.result.checks).toEqual(result.checks);
  expect(JSON.parse(vi.mocked(f.execution.startPassage).mock.calls[0]![0].task)).not.toHaveProperty('checks');
});

it('dispatches review after durable capture and producer result, with exact profile/tree and no implementer conversation', async () => {
  const f = await fixture(); expect(f.materializeReview).not.toHaveBeenCalled();
  f.implement(); await f.pipeline.drain();
  const { review, passage } = f.reviewer(); const delivery = f.storage.getDelivery(review.deliveryId);
  const calls = vi.mocked(f.execution.startPassage).mock.calls; expect(calls).toHaveLength(2);
  const request = calls[1]![0]; const task = JSON.parse(request.task) as Record<string, unknown>;
  expect(request.binding.role).toBe('reviewer'); expect(request.cwd).toBe(calls[0]![0].cwd);
  expect(request.binding.passageId).not.toBe(calls[0]![0].binding.passageId);
  expect(task).not.toHaveProperty('transcript'); expect(task).not.toHaveProperty('implementerResult');
  expect(task).toHaveProperty('producerResult');
  expect(task.evidenceDirectory).toBe(`.factory-evidence/${review.id}/`);
  expect(task.delivery).toEqual(delivery.delivery); expect(passage.effectiveProfile?.model).toBe(f.profile.model);
  expect(review.contentIdentity).toBe(delivery.delivery.contentIdentity);
  const accepted = f.accept(f.result()); await f.pipeline.drain();
  expect(f.storage.getReview(review.deliveryId)).toMatchObject({ state: 'approved', independenceState: 'valid' });
  expect(f.status()).toMatchObject({ phase: 'publishing', result: null, round: 1 });
  expect(f.persistence.acceptResult({ binding: passage.binding, result: accepted.result, sha256: accepted.sha256 }).receiptId).toBe(accepted.receiptId);
});

it('never sends invalid review integrity back to the implementer even with corrections available', async () => {
  const f = await fixture(2); f.implement(); await f.pipeline.drain(); const { review, passage } = f.reviewer();
  f.storage.recordReviewIntegrity(passage.binding, false); f.storage.recordReviewIntegrity(passage.binding, true);
  f.accept(f.result()); await f.pipeline.drain();
  expect(f.storage.getReview(review.deliveryId)).toMatchObject({ state: 'rejected', independenceState: 'invalid', diagnostic: 'REVIEW_PRODUCT_CHANGED' });
  expect(f.status()).toMatchObject({ phase: 'finished', result: 'failed', round: 1, diagnostic: 'REVIEW_PRODUCT_CHANGED' });
  expect(f.execution.continuePassage).not.toHaveBeenCalled();
});

it.each([0, 1, 2, 3, 4, 5])('exhausts correctionLimit=%i only after reviewing the last allowed version', async limit => {
  const f = await fixture(limit); const reviews = [];
  const used = Math.min(limit, 2);
  for (let round = 1; round <= 1 + used; round++) {
    expect(f.status().round).toBe(round); f.implement(); await f.pipeline.drain();
    const { review } = f.reviewer(); reviews.push(review.deliveryId); f.accept(f.result(false)); await f.pipeline.drain();
  }
  expect(f.status()).toMatchObject({ result: null, phase: 'reviewing', suspension: 'CORRECTION_BLOCKED', round: 1 + used });
  expect(f.storage.getAttemptBlock(f.attemptId)).toMatchObject({ reason: limit <= 2 ? 'correction_limit' : 'no_progress', correction_limit: limit, corrections_used: used });
  expect(new Set(reviews).size).toBe(1 + used);
  expect(f.execution.continuePassage).toHaveBeenCalledTimes(2 * used);
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2); // One initial launch per role.
  expect(f.execution.preparePassageHandoff).toHaveBeenCalledTimes(1 + 2 * used);
  expect(f.captureDelivery).toHaveBeenCalledTimes(1 + used);
  for (const id of reviews) expect(f.storage.getReview(id)?.state).toBe('rejected');
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('approves a corrected new version only after independently resolving exact previous finding ids', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); const old = f.reviewer().review;
  f.accept(f.result(false)); await f.pipeline.drain(); const first = f.storage.getReview(old.deliveryId)!;
  expect(f.status().round).toBe(2); expect(first.findings[0]?.id).toBeDefined();
  f.implement(); await f.pipeline.drain(); const { review, passage } = f.reviewer(); const value = f.result();
  const accept = (r: ReviewerResult) => f.persistence.acceptResult({ binding: passage.binding, result: r, sha256: digest(r) });
  f.storage.recordReviewIntegrity(passage.binding, true);
  expect(() => accept({ ...value, resolutions: [] })).toThrow('RESULT_INVALID');
  expect(() => accept({ ...value, resolutions: [{ findingKey: randomUUID(), verdict: 'resolved', evidence: ['Unrelated'] }] })).toThrow('RESULT_INVALID');
  expect(() => accept({ ...value, resolutions: value.resolutions.map(x => ({ ...x, verdict: 'unresolved' })) })).toThrow('RESULT_INVALID');
  accept(value); await f.pipeline.drain();
  expect(f.status()).toMatchObject({ phase: 'publishing', result: null, round: 2 });
  expect(f.storage.getReview(review.deliveryId)?.resolutions[0]?.findingId).toBe(first.findings[0]?.id);
  expect(f.storage.getReview(old.deliveryId)).toEqual(first); expect(review.deliveryId).not.toBe(old.deliveryId);
  expect(f.storage.getOpenFindings(f.attemptId, 3)).toEqual([]);
});

it('keeps two conversations and three independent versions through two corrections', async () => {
  const f = await fixture(2);
  const snapshots = [];
  for (let round = 1; round <= 3; round++) {
    f.implement(); await f.pipeline.drain();
    const { review, passage } = f.reviewer();
    expect(f.db.prepare("SELECT stop_state FROM resources WHERE passage_id=? AND kind='terminal'").get(passage.binding.passageId)).toEqual({ stop_state: 'not_requested' });
    const request = round === 1 ? vi.mocked(f.execution.startPassage).mock.calls[1]![0]
      : vi.mocked(f.execution.continuePassage).mock.calls.find(c => c[1].binding.role === 'reviewer' && c[1].binding.round === round)![1];
    const task = JSON.parse(request.task) as { delivery: { id: string }; producerResult: { binding: { deliveryVersion: string }; result: ImplementerResult }; previousDelivery: string | null; previousDiff: unknown; findings: unknown[] };
    expect(task.delivery.id).toBe(review.deliveryId);
    expect(task.producerResult.binding.deliveryVersion).toBe(review.deliveryId);
    expect(task.previousDelivery).toBe(snapshots.at(-1)?.binding.deliveryVersion ?? null);
    expect(task.previousDiff).toEqual(round === 1 ? null : []);
    if (round > 1) expect(task.producerResult.result.findingResponses?.length).toBeGreaterThan(0);
    f.accept(f.result(round === 3)); await f.pipeline.drain();
    snapshots.push({ binding: passage.binding, result: f.persistence.getResult(passage.handle) });
  }
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
  expect(f.execution.continuePassage).toHaveBeenCalledTimes(4);
  expect(new Set(f.materializeReview.mock.calls.map(c => c[1])).size).toBe(3);
  const sessions = f.db.prepare('SELECT id,role,omp_session_id FROM attempt_sessions WHERE attempt_id=?').all(f.attemptId);
  expect(sessions).toHaveLength(2);
  const directories = f.db.prepare<[string], { role: string; session_directory_relative: string }>('SELECT role,session_directory_relative FROM attempt_sessions WHERE attempt_id=?').all(f.attemptId);
  for (const session of directories) expect(session.session_directory_relative).toBe(`sessions/${f.attemptId}/${session.role}`);
  for (const role of ['implementer','reviewer']) {
    const bindings = f.db.prepare('SELECT DISTINCT attempt_session_id FROM passages WHERE attempt_id=? AND role=?').all(f.attemptId, role);
    expect(bindings).toHaveLength(1);
  }
  for (const snapshot of snapshots) expect(f.persistence.getResult({ passageId: snapshot.binding.passageId })).toEqual(snapshot.result);
});

it('does not materialize the next reviewer checkout while the prior reviewer cannot be quiesced', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  vi.mocked(f.execution.preparePassageHandoff).mockRejectedValueOnce(new Error('Controlled busy producer'));
  f.implement(); await f.pipeline.drain();
  expect(f.materializeReview).toHaveBeenCalledOnce();
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
  expect(vi.mocked(f.execution.continuePassage).mock.calls.filter(c => c[1].binding.role === 'reviewer')).toEqual([]);
  expect(f.status().diagnostic).toBe('CAPTURE_HANDOFF_FAILED');
});



it('refuses cross-role, foreign-attempt and lost-session continuation identities', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain();
  const source = f.reviewer().passage;
  f.accept(f.result(false)); await f.pipeline.drain();
  const correction = f.producer();
  const targetSession = f.db.prepare<[string], { attempt_session_id: string }>('SELECT attempt_session_id FROM passages WHERE id=?').get(correction.binding.passageId)!;
  const insert = f.db.prepare(`INSERT INTO passages(id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,state,tracking_state,
    session_source_id,created_at_ms,attempt_session_id) VALUES (?,?,2,?,'implementer',?,'factory-test','starting','pending',?,0,?)`);
  expect(() => insert.run(randomUUID(), f.attemptId, correction.binding.deliveryVersion, JSON.stringify(correction.roleResource), source.binding.passageId, targetSession.attempt_session_id)).toThrow();
  expect(() => insert.run(randomUUID(), randomUUID(), correction.binding.deliveryVersion, JSON.stringify(correction.roleResource), correction.binding.passageId, targetSession.attempt_session_id)).toThrow();
  const reviewerSession = f.persistence.getAttemptSession(source.handle);
  expect(() => f.db.prepare('UPDATE managed_terminals SET generation=generation+1 WHERE id=?').run(reviewerSession.managedTerminalId)).toThrow('TERMINAL_CONVERSATION_IN_USE');
  f.persistence.record(source.handle, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
  expect(() => f.db.prepare("UPDATE attempt_sessions SET state='completed' WHERE id=?").run(reviewerSession.id)).toThrow('SESSION_CONTINUITY_LOST');
  expect(() => f.db.prepare('UPDATE attempt_sessions SET terminal_generation=terminal_generation+1 WHERE id=?').run(reviewerSession.id)).toThrow();
  expect(f.status().result).toBe('interrupted');
});

it('keeps the captured guidance and profile revision through a correction after the live profile changes', async () => {
  const f = await fixture();
  const captured = f.storage.getAttemptCapture(f.attemptId);
  const capturedProfile = captured.configuration.implementer_profile!;
  const current = f.storage.getGlobalConfiguration();
  f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag, changes: {},
    body: { changes: {}, profile_changes: [{ action: 'update', id: f.profile.id, changes: { guidance: 'Future attempts use this new guidance.' } }] } });
  expect(f.storage.getAttemptCapture(f.attemptId)).toEqual(captured);

  f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  expect(f.status()).toMatchObject({ round: 2, phase: 'implementing' });
  expect(f.execution.continuePassage).toHaveBeenCalledTimes(1);
  expect(f.execution.continuePassage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    profile: expect.objectContaining({ guidance: capturedProfile.guidance }),
  }));
  const correction = vi.mocked(f.execution.continuePassage).mock.calls[0]![1];
  expect(correction.profile.guidance).toBe('Profile guidance');
  expect(correction.profile.guidance).not.toContain('Future attempts');
  expect(f.storage.getAttemptCapture(f.attemptId)).toEqual(captured);
});

it('refuses an unproven review and rejects empty/cross-criterion/duplicate findings without occupying a receipt', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); const { passage } = f.reviewer();
  const accept = (r: ReviewerResult) => f.persistence.acceptResult({ binding: passage.binding, result: r, sha256: digest(r) });
  expect(() => accept(f.result())).toThrow('RESULT_INVALID');
  f.storage.recordReviewIntegrity(passage.binding, true); const rejected = f.result(false);
  for (const invalid of [
    { ...rejected, findings: [{ ...rejected.findings[0]!, criterionIds: ['ac-999'] }] },
    { ...rejected, findings: [{ ...rejected.findings[0]!, criterionIds: [], category: '' }] },
    { ...rejected, findings: [rejected.findings[0]!, rejected.findings[0]!] },
    { ...rejected, criteria: [rejected.criteria[0]!, rejected.criteria[0]!] },
    { ...f.result(), verdict: 'rejected' as const },
  ]) expect(() => accept(invalid)).toThrow('RESULT_INVALID');
  expect(f.persistence.getResult(passage.handle)).toBeNull();
  accept({ ...rejected, findings: [{ ...rejected.findings[0]!, criterionIds: [], category: 'security' }] });
  expect(f.storage.getReview(passage.binding.deliveryVersion)?.findings[0]?.criterionIds).toEqual([]);
});

it.each(['findings', 'finding_resolutions', 'finding_assessments', 'attempt_blocks', 'reviews', 'events'])('rolls back result/receipt/review state when %s persistence fails', async table => {
  const f = await fixture(); f.implement(); await f.pipeline.drain();
  if (['finding_resolutions', 'finding_assessments', 'attempt_blocks'].includes(table)) { f.accept(f.result(false)); await f.pipeline.drain(); f.implement(); await f.pipeline.drain(); }
  if (table === 'attempt_blocks') { f.accept(f.result(false)); await f.pipeline.drain(); f.implement(); await f.pipeline.drain(); }
  const { passage, review } = f.reviewer(); f.storage.recordReviewIntegrity(passage.binding, true);
  f.db.exec(`CREATE TRIGGER review_test_failure BEFORE ${table === 'reviews' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'controlled failure'); END`);
  const value = ['finding_resolutions', 'finding_assessments'].includes(table) ? f.result() : f.result(false);
  expect(() => f.persistence.acceptResult({ binding: passage.binding, result: value, sha256: digest(value) })).toThrow('STORAGE_FAILED');
  expect(f.persistence.getResult(passage.handle)).toBeNull(); expect(f.storage.getReview(review.deliveryId)?.state).toBe('pending');
  f.db.exec('DROP TRIGGER review_test_failure');
  f.persistence.acceptResult({ binding: passage.binding, result: value, sha256: digest(value) });
});

it('projects the immutable block and paged assessment history over authenticated HTTP', async () => {
  const f = await fixture(5);
  for (let round = 1; round <= 3; round++) { f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain(); }
  const config = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory);
  const app = createApp(config, f.storage, undefined, undefined, undefined, f.pipeline); await app.ready();
  try {
    const expected = f.storage.getAttemptBlock(f.attemptId);
    const host = new URL(config.browserOrigin).host;
    const url = `/api/v1/attempts/${f.attemptId}?section=finding_assessments&limit=1`;
    expect((await app.inject({ url, headers: { host } })).statusCode).toBe(401);
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin: config.browserOrigin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
    const headers = { host, cookie: bootstrap.cookies.map(c => `${c.name}=${c.value}`).join('; ') };
    const response = await app.inject({ url, headers }); expect(response.statusCode).toBe(200);
    const view = response.json(); expect(view.block).toEqual(expected); expect(view.details).toBeNull();
    expect(view.v3_details).toMatchObject({ section: 'finding_assessments', has_more: true, items: [{ attempt_id: f.attemptId, progress: 'not_assessable' }] });
    expect(view.v3_details.items[0]).not.toHaveProperty('findingId');
    const next = await app.inject({ url: `${url}&cursor=${encodeURIComponent(view.v3_details.next_cursor)}`, headers });
    expect(next.statusCode).toBe(200); expect(next.json().v3_details.items[0].id).not.toBe(view.v3_details.items[0].id);
    expect((await app.inject({ url: `${url}&round_id=1&cursor=${encodeURIComponent(view.v3_details.next_cursor)}`, headers })).statusCode).toBe(400);
  } finally { await app.close(); }
});



it('preserves historical results/findings/resolutions and rejects inserts into sealed reviews', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  const first = f.db.prepare('SELECT id FROM findings').get(); expect(first).toBeDefined();
  for (const sql of ["UPDATE findings SET problem='changed'", 'DELETE FROM findings', "UPDATE reviews SET reason='changed' WHERE state='rejected'", 'DELETE FROM reviews']) expect(() => f.db.exec(sql)).toThrow();
  f.implement(); await f.pipeline.drain(); f.accept(f.result()); await f.pipeline.drain();
  for (const sql of ["UPDATE finding_resolutions SET verdict='unresolved'", 'DELETE FROM finding_resolutions']) expect(() => f.db.exec(sql)).toThrow();
  expect(() => f.db.prepare('INSERT INTO finding_resolutions SELECT finding_id,review_id,attempt_id,verdict,evidence_json FROM finding_resolutions').run()).toThrow();
});

it('preserves a rejection when implementer continuation is lost, without recruiting a substitute', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); const original = f.reviewer().review;
  vi.mocked(f.execution.continuePassage).mockRejectedValueOnce(new Error('Controlled lost session'));
  f.accept(f.result(false)); await f.pipeline.drain();
  expect(f.status()).toMatchObject({ round: 2, suspension: 'DISPATCH_FAILED', result: null });
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2); expect(f.storage.getReview(original.deliveryId)?.state).toBe('rejected');
});

it('keeps rejected review and durable receipt across reopen without replaying review or correction', async () => {
  const f = await fixture(0); f.implement(); await f.pipeline.drain(); const { passage, review } = f.reviewer();
  const accepted = f.accept(f.result(false)); await f.pipeline.drain(); const old = f.storage.getReview(review.deliveryId);
  await f.pipeline.close(); f.storage.close(); const reopened = openStorage({ dataDirectory: f.directory });
  try {
    expect(reopened.getReview(review.deliveryId)).toEqual(old);
    expect(reopened.executionPersistence().acceptResult({ binding: passage.binding, result: accepted.result, sha256: accepted.sha256 }).receiptId).toBe(accepted.receiptId);
    expect(reopened.getAttemptDetail(f.attemptId, {}).block?.reason).toBe('correction_limit');
    expect(reopened.getAttempt(f.attemptId).result).toBe('interrupted');
  } finally { reopened.close(); }
});



it('exposes scoped lightweight round history and on-demand review/producer details over protected HTTP', async () => {
  const f = await fixture(0); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  const d = f.status().deliveryId!;
  const config = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory);
  const app = createApp(config, f.storage, undefined, undefined, undefined, f.pipeline); await app.ready();
  try {
    const host = new URL(config.browserOrigin).host;
    const paths = [`/api/v1/attempts/${f.attemptId}/rounds`, `/api/v1/deliveries/${d}/review`, `/api/v1/deliveries/${d}/producer-result`];
    for (const url of paths) expect((await app.inject({ url, headers: { host } })).statusCode).toBe(401);
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin: config.browserOrigin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
    expect(bootstrap.statusCode).toBe(200); const headers = { host, cookie: bootstrap.cookies.map(c => `${c.name}=${c.value}`).join('; ') };
    const rounds = await app.inject({ url: paths[0]!, headers }); expect(rounds.statusCode).toBe(200);
    expect(rounds.json()).toEqual(toHttpRoundHistory(f.storage.getRounds(f.attemptId))); expect(rounds.body).not.toContain('Response value is incorrect');
    const review = await app.inject({ url: paths[1]!, headers }); expect(review.statusCode).toBe(200);
    expect(review.json()).toMatchObject({ state: 'rejected', findings: [{ problem: 'Response value is incorrect' }] });
    const producer = await app.inject({ url: paths[2]!, headers }); expect(producer.statusCode).toBe(200);
    expect(producer.json()).toEqual(toHttpProducerResult(f.storage.getProducerResult(d)));
    for (const url of paths) expect((await app.inject({ url: url + '?unexpected=1', headers })).statusCode).toBe(400);
    f.db.prepare("UPDATE factory_settings SET account_id=NULL").run();
    for (const url of paths) expect((await app.inject({ url, headers })).statusCode).toBe(404);
  } finally { await app.close(); }
});

it('does not allocate a second review or resource on repeated planning', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); const d=f.status().deliveryId!;
  const before=f.db.prepare('SELECT count(*) AS n FROM resources').get();
  expect(f.storage.beginReview(d)).toBeNull();
  expect(f.db.prepare('SELECT count(*) AS n FROM resources').get()).toEqual(before);
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
});

it('preserves cancellation while a review workspace materialization returns late', async () => {
  const f = await fixture(); let release: (() => void) | undefined;
  f.materializeReview.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return 'controlled-review-checkout'; });
  f.implement(); await vi.waitFor(() => expect(release).toBeDefined());
  f.persistence.recordCancellation(f.attemptId, randomUUID()); release!(); await f.pipeline.drain();
  expect(f.status().result).toBe('cancelled'); expect(f.execution.startPassage).toHaveBeenCalledOnce();
});

it('rolls back review intent under SQLite busy before any reviewer materialization', async () => {
  const f = await fixture(2, async base => { vi.spyOn(base.storage,'beginReview').mockReturnValue(null); });
  f.implement(); await f.pipeline.drain(); const d = f.status().deliveryId!;
  vi.mocked(f.storage.beginReview).mockRestore();
  f.db.exec('BEGIN IMMEDIATE');
  try { expect(() => f.storage.beginReview(d)).toThrow(expect.objectContaining({ code: 'CONFIGURATION_STORAGE_FAILED' })); }
  finally { f.db.exec('ROLLBACK'); }
  expect(f.storage.getReview(d)).toBeNull(); expect(f.materializeReview).not.toHaveBeenCalled();
  expect(f.storage.beginReview(d)?.state).toBe('pending');
});

it('interrupts a correction when its continuous reviewer conversation is lost between rounds', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); const old = f.reviewer().passage;
  f.accept(f.result(false)); await f.pipeline.drain();
  f.persistence.record(old.handle, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
  expect(f.status()).toMatchObject({ round: 2, phase: 'finished', result: 'interrupted' });
  expect(f.storage.getReview(old.binding.deliveryVersion)?.state).toBe('rejected');
});

it('requires Implementer responses for the exact prior finding IDs without letting them resolve the findings', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  const p = f.producer();
  const base: ImplementerResult = { formatVersion: 1, summary: 'Corrections', writesStopped: true, criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed'] })), checks: [] };
  for (const value of [base, { ...base, findingResponses: [{ findingId: randomUUID(), response: 'Claimed fixed', evidence: ['Claim'] }] }]) {
    expect(() => f.persistence.acceptResult({ binding: p.binding, result: value, sha256: digest(value) })).toThrow('RESULT_INVALID');
  }
  expect(f.storage.getOpenFindings(f.attemptId, 2)).toHaveLength(1); expect(f.persistence.getResult(p.handle)).toBeNull();
  f.implement(); await f.pipeline.drain(); expect(f.storage.getOpenFindings(f.attemptId, 2)).toHaveLength(1);
});

it('permits an explicit nonblocking pending finding while independently resolving every blocker', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); const first = f.result(false);
  first.findings.push({ ...first.findings[0]!, key: 'style-note', problem: 'Optional naming improvement', blocking: false });
  f.accept(first); await f.pipeline.drain(); f.implement(); await f.pipeline.drain();
  const previous = f.storage.getOpenFindings(f.attemptId, 2); const value = f.result();
  value.resolutions = value.resolutions.map(x => ({ ...x, verdict: previous.find(f => f.id === x.findingKey)!.blocking ? 'resolved' : 'unresolved' }));
  f.accept(value); await f.pipeline.drain();
  expect(f.status().phase).toBe('publishing'); expect(f.storage.getOpenFindings(f.attemptId, 3)).toMatchObject([{ blocking: false }]);
});

it.each(['none', 'not_assessable'] as const)('blocks before recruitment after two completed corrections with %s progress despite new findings', async progress => {
  const f = await fixture(5); let root = '';
  for (let round = 1; round <= 3; round++) {
    f.implement(); await f.pipeline.drain();
    const value = f.result(false);
    if (round > 1) value.assessments = value.assessments!.map(assessment => assessment.findingId === root
      ? { findingId: root, progress, evidence: [], justification: 'No independent improvement evidence is available.' } : assessment);
    f.accept(value); await f.pipeline.drain();
    if (round === 1) root = f.storage.getOpenFindings(f.attemptId, 2)[0]!.id;
  }
  const detail = f.storage.getAttemptDetail(f.attemptId, { section: 'finding_assessments', limit: '1' });
  expect(detail.block).toMatchObject({ reason: 'no_progress', finding_ids: [root], corrections_used: 2, correction_limit: 5, consecutive_no_progress: 2 });
  expect(detail.v3Details).toMatchObject({ items: [expect.objectContaining({ findingId: root })], has_more: true });
  expect(detail.details).toBeNull();
  expect(f.db.prepare('SELECT * FROM findings').all()).toHaveLength(3);
  expect(f.execution.continuePassage).toHaveBeenCalledTimes(4);
  const original = detail.block;
  for (let i = 0; i < 2; i++) expect(f.storage.beginCorrection(f.status().deliveryId!)).toBeNull();
  expect(f.storage.getAttemptDetail(f.attemptId, {}).block).toEqual(original);
  for (const sql of ['UPDATE finding_assessments SET progress=\'partial\'', 'DELETE FROM finding_assessments', 'UPDATE attempt_blocks SET created_at_ms=0', 'DELETE FROM attempt_blocks']) expect(() => f.db.exec(sql)).toThrow();
  const page = f.storage.getAttemptDetail(f.attemptId, { section: 'finding_assessments', limit: '1', cursor: detail.v3Details!.next_cursor! });
  expect(page.v3Details!.items[0]).not.toEqual(detail.v3Details!.items[0]);
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('rejects an omitted evaluation for a prior finding without persisting a synthetic assessment', async () => {
  const f = await fixture(5); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  const root = f.storage.getOpenFindings(f.attemptId, 2)[0]!;
  f.implement(); await f.pipeline.drain();
  const { passage, review } = f.reviewer(); const missing = f.result(false); missing.assessments = [];
  expect(() => f.accept(missing)).toThrow('RESULT_INVALID');
  expect(f.persistence.getResult(passage.handle)).toBeNull();
  expect(f.storage.getReview(review.deliveryId)?.state).toBe('pending');
  expect(f.db.prepare('SELECT * FROM finding_assessments WHERE finding_id=?').all(root.id)).toEqual([]);
  const explicit = { ...missing, assessments: [{ findingId: root.id, progress: 'not_assessable' as const, evidence: [], justification: 'A technical impediment prevented an independent assessment.' }] };
  f.accept(explicit); await f.pipeline.drain();
  expect(f.db.prepare('SELECT progress,justification FROM finding_assessments WHERE finding_id=?').get(root.id))
    .toEqual({ progress: 'not_assessable', justification: 'A technical impediment prevented an independent assessment.' });
});

it('refuses to seal an independent review when an earlier finding has no matching assessment row', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  f.implement(); await f.pipeline.drain();
  const { passage, review } = f.reviewer(); f.storage.recordReviewIntegrity(passage.binding, true);
  const missing = f.result(false); missing.assessments = [];
  const { criteria, ...summary } = missing;
  f.db.prepare('INSERT INTO passage_results(passage_id,attempt_id,result_hash,receipt_id,summary_json,accepted_at_ms) VALUES (?,?,?,?,?,0)')
    .run(passage.binding.passageId, f.attemptId, digest(missing), randomUUID(), JSON.stringify(summary));
  for (const criterion of criteria) {
    f.db.prepare('INSERT INTO criterion_results(passage_id,attempt_id,criterion_id,verdict,evidence_json) VALUES (?,?,?,?,?)')
      .run(passage.binding.passageId, f.attemptId, criterion.criterionId, criterion.verdict, JSON.stringify(criterion.evidence));
  }
  expect(() => f.db.prepare("UPDATE reviews SET state='rejected',completed_at_ms=1 WHERE id=?").run(review.id))
    .toThrow('ASSESSMENT_EVIDENCE_INVALID');
  expect(f.storage.getReview(review.deliveryId)?.state).toBe('pending');
  expect(f.db.prepare('SELECT * FROM finding_assessments WHERE review_id=?').all(review.id)).toEqual([]);
});

it.each(['partial', 'proven'] as const)('resets recurrence only with %s progress backed by the exact independent current assessment', async progress => {
  const f = await fixture(5);
  let root = ''; let oldEvidence = '';
  for (let round = 1; round <= 5; round++) {
    f.implement(); await f.pipeline.drain();
    const value = f.result(false);
    if (round > 1) {
      const assessment = { findingId: root, progress: round === 3 ? progress : 'none' as const, evidence: round === 3 ? [value.criteria[0]!.evidence[0]!] : [], justification: 'Independent current check evidence.' };
      if (round === 3) {
        for (const evidence of [[], ['Edited the implementation'], [oldEvidence], [`artifact:${randomUUID()}`]]) expect(() => f.accept({ ...value, assessments: [{ ...assessment, evidence }] })).toThrow('RESULT_INVALID');
      }
      value.assessments = value.assessments!.map(existing => existing.findingId === root ? assessment : existing);
      if (round === 3) {
        // Resolve later unrelated roots; the same canonical blocker remains open.
        value.resolutions = value.resolutions.map(x => ({ ...x, verdict: x.findingKey === root ? 'unresolved' : 'resolved' }));
      }
    }
    f.accept(value); await f.pipeline.drain();
    if (round === 1) root = f.storage.getOpenFindings(f.attemptId, 2)[0]!.id;
    oldEvidence = value.criteria[0]!.evidence[0]!;
    if (round === 3) expect(f.storage.getAttemptDetail(f.attemptId, {}).block).toBeNull();
  }
  expect(f.storage.getAttemptDetail(f.attemptId, {}).block).toMatchObject({ reason: 'no_progress', finding_ids: expect.arrayContaining([root]), corrections_used: 4 });
});

it('rejects foreign, duplicate and noncanonical assessments atomically and keeps unfinished reviews out of recurrence', async () => {
  const f = await fixture(5); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  const root = f.storage.getOpenFindings(f.attemptId, 2)[0]!;
  f.implement(); await f.pipeline.drain(); const value = f.result(false);
  const assessment = { findingId: root.id, progress: 'none' as const, evidence: [], justification: 'No progress.' };
  for (const assessments of [[{ ...assessment, findingId: randomUUID() }], [assessment, assessment]]) expect(() => f.accept({ ...value, assessments })).toThrow('RESULT_INVALID');
  expect(f.db.prepare('SELECT * FROM finding_assessments').all()).toEqual([]);
  expect(() => f.accept({ ...value, assessments: [{ ...assessment, evidence: [`artifact:${randomUUID()}`] }] })).toThrow('RESULT_INVALID');
  expect(f.storage.beginCorrection(f.status().deliveryId!)).toBeNull();
  expect(f.storage.getAttemptDetail(f.attemptId, {}).block).toBeNull();
  const linked = { ...value, findings: [{ ...value.findings[0]!, originFindingId: root.id }], assessments: [assessment] };
  const linkedDeliveryId = f.reviewer().review.deliveryId;
  f.accept(linked); await f.pipeline.drain();
  const child = f.storage.getReview(linkedDeliveryId)!.findings[0]!;
  f.implement(); await f.pipeline.drain();
  expect(() => f.accept({ ...f.result(false), assessments: [{ ...assessment, findingId: child.id }] })).toThrow('RESULT_INVALID');
  expect(f.storage.getAttemptDetail(f.attemptId, {}).block).toBeNull();
});

it('serves V02 through the authenticated decision route with Idempotency-Key and attempt If-Match', async () => {
  let app: ReturnType<typeof createApp> | null = null; let browserOrigin = '';
  const f = await fixture(4, async initial => {
    const config = loadConfiguration({ FACTORY_DATA_DIR: initial.directory, FACTORY_LOG_LEVEL: 'silent' }, initial.directory);
    browserOrigin = config.browserOrigin;
    app = createApp(config, initial.storage, undefined, undefined, undefined, initial.pipeline);
    await app.ready();
  });
  try {
    for (let round = 1; round <= 3; round++) { f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain(); }
    const status = f.status(); const block = f.storage.getAttemptBlock(f.attemptId)!;
    const host = new URL(browserOrigin).host; const origin = browserOrigin;
    expect((await app!.inject({ method: 'POST', url: `/api/v1/attempts/${f.attemptId}/decisions`, headers: { host }, payload: {} })).statusCode).toBe(403);
    const bootstrap = await app!.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
    const idempotencyKey = randomUUID(); const cookie = bootstrap.cookies.map(value => `${value.name}=${value.value}`).join('; ');
    const headers = { host, origin, cookie, 'x-factory-client': 'web', 'x-csrf-token': bootstrap.json().csrf_token,
      'content-type': 'application/json', 'idempotency-key': idempotencyKey, 'if-match': `"${status.id}:${status.revision}"` };
    const payload = { block_id: block.id, block_revision: block.revision, delivery_id: status.deliveryId, authorized: true,
      action: 'guidance', guidance: 'Check the boundary case without changing captured scope.' };
    const first = await app!.inject({ method: 'POST', url: `/api/v1/attempts/${f.attemptId}/decisions`, headers, payload });
    expect(first.statusCode).toBe(202); const accepted = first.json(); expect(accepted.operation_id).toBe(idempotencyKey);
    const replay = await app!.inject({ method: 'POST', url: `/api/v1/attempts/${f.attemptId}/decisions`, headers, payload });
    expect(replay.statusCode).toBe(202); expect(replay.json()).toMatchObject({ operation_id: accepted.operation_id, resource: accepted.resource });
    const divergent = await app!.inject({ method: 'POST', url: `/api/v1/attempts/${f.attemptId}/decisions`, headers,
      payload: { ...payload, guidance: 'Different instruction.' } });
    expect(divergent.statusCode).toBe(409); expect(divergent.json().code).toBe('IDEMPOTENCY_CONFLICT');
    await f.pipeline.drain(); expect(f.status()).toMatchObject({ round: 4, phase: 'implementing', suspension: null });
    const history = await app!.inject({ url: `/api/v1/attempts/${f.attemptId}?section=decisions`, headers: { host, cookie } });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({ details: null, v3_details: { section: 'decisions', items: [{ action: 'guidance', guidance: payload.guidance, block_id: block.id }] } });
  } finally { await app!.close(); }
});

it('records guidance immutably, preserves the capture, and resumes the same attempt within its correction limit', async () => {
  const f = await noProgressBlockedFixture(4); const status = f.status(); const block = f.storage.getAttemptBlock(f.attemptId)!;
  const capture = f.db.prepare<[string], { capture_json: string }>('SELECT capture_json FROM attempts WHERE id=?').get(f.attemptId)!.capture_json;
  const calls = vi.mocked(f.execution.continuePassage).mock.calls.length;
  const command = { blockId: block.id, blockRevision: block.revision, deliveryId: status.deliveryId!, authorized: true as const,
    action: 'guidance' as const, guidance: 'Inspect the boundary case while preserving every captured criterion.' };
  const context = { operationId: randomUUID(), expectedRevision: `"${status.id}:${status.revision}"` };
  const accepted = await f.pipeline.makeAttemptDecision(f.attemptId, command, context);
  expect(accepted).toMatchObject({ kind: 'attempt.decision', state: 'succeeded', resource: { type: 'attempt', id: f.attemptId } });
  expect(await f.pipeline.makeAttemptDecision(f.attemptId, command, context)).toEqual(accepted);
  await expect(f.pipeline.makeAttemptDecision(f.attemptId, { ...command, guidance: 'Different request.' }, context)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await f.pipeline.drain();
  expect(f.status()).toMatchObject({ round: 4, phase: 'implementing', result: null, suspension: null });
  expect(f.db.prepare<[string], { capture_json: string }>('SELECT capture_json FROM attempts WHERE id=?').get(f.attemptId)!.capture_json).toBe(capture);
  expect(vi.mocked(f.execution.continuePassage)).toHaveBeenCalledTimes(calls + 1);
  const task = JSON.parse(vi.mocked(f.execution.continuePassage).mock.calls.at(-1)![1].task);
  expect(task.operatorGuidance).toBe(command.guidance);
  expect(f.storage.getAttemptBlock(f.attemptId)).toMatchObject({ id: block.id, guidance_capability: { available: false } });
  expect(f.storage.getAttemptDetail(f.attemptId, { section: 'decisions' }).v3Details).toMatchObject({
    section: 'decisions', items: [{ action: 'guidance', guidance: command.guidance, blockId: block.id }],
  });
});

it('prepares a role-matched successor without ending or starting the blocked attempt, then ends through cancellation', async () => {
  const f = await noProgressBlockedFixture(4);
  const global = f.storage.getGlobalConfiguration();
  f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: global.etag, changes: {}, body: { changes: {}, profile_changes: [
    { action: 'create', profile: { name: 'Successor Implementer', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider-next', model: 'model-next', effort: 'high', guidance: 'New profile guidance' } },
  ] } });
  const successorProfile = f.storage.getGlobalConfiguration().view.profiles.find(profile => profile.name === 'Successor Implementer')!;
  const status = f.status(); const block = f.storage.getAttemptBlock(f.attemptId)!;
  const command = { blockId: block.id, blockRevision: block.revision, deliveryId: status.deliveryId!, authorized: true as const,
    action: 'change_profile' as const, profileId: successorProfile.id, profileRevision: successorProfile.revision, role: 'implementer' as const };
  const context = { operationId: randomUUID(), expectedRevision: `"${status.id}:${status.revision}"` };
  await expect(f.pipeline.makeAttemptDecision(f.attemptId, { ...command, profileRevision: successorProfile.revision + 1 },
    { operationId: randomUUID(), expectedRevision: context.expectedRevision })).rejects.toMatchObject({ code: 'PROFILE_REFERENCE_CHANGED' });
  expect(f.db.prepare('SELECT * FROM attempt_decisions').all()).toEqual([]);
  const accepted = await f.pipeline.makeAttemptDecision(f.attemptId, command, context);
  expect(accepted).toMatchObject({ kind: 'attempt.decision', state: 'succeeded' });
  expect(await f.pipeline.makeAttemptDecision(f.attemptId, command, context)).toEqual(accepted);
  await f.pipeline.drain();
  const decision = f.storage.getAttemptDetail(f.attemptId, { section: 'decisions' }).v3Details!;
  expect(decision.items[0]).toMatchObject({ action: 'change_profile', successorPreparationRevision: 1 });
  f.db.function('factory_project_deletion_row_allowed', (_table: string, _keys: string, _context: string) => 0);
  f.db.function('factory_project_deletion_operation', () => null);
  expect(() => f.db.exec("UPDATE attempt_decisions SET action='end'")).toThrow('IMMUTABLE_RECORD');
  expect(() => f.db.exec('DELETE FROM attempt_decisions')).toThrow('IMMUTABLE_RECORD');
  const successorId = (decision.items[0] as { successorPreparationId: string }).successorPreparationId;
  const successor = await f.preparations.getPreparation(successorId);
  expect(successor.view.preparation).toMatchObject({ issue_id: f.issue.id, previous_attempt_id: f.attemptId,
    overrides: { implementer_profile: { kind: 'reference', id: successorProfile.id, revision: successorProfile.revision }, correction_limit: 4 } });
  expect(f.status()).toMatchObject({ result: null, suspension: 'CORRECTION_BLOCKED' });
  expect(vi.mocked(f.execution.startPassage)).toHaveBeenCalledTimes(2);
  expect(vi.mocked(f.execution.cancelAttempt)).not.toHaveBeenCalled();
  expect(() => f.storage.validatePreviousAttempt(f.attemptId, f.projectId, f.issue.id)).toThrow('End the previous attempt before preparing a new one.');
  await expect(f.pipeline.makeAttemptDecision(f.attemptId, { ...command, profileId: f.reviewerProfile.id, profileRevision: f.reviewerProfile.revision },
    { operationId: randomUUID(), expectedRevision: `"${f.status().id}:${f.status().revision}"` })).rejects.toMatchObject({ code: 'PROFILE_TYPE_MISMATCH' });

  const endStatus = f.status(); const endCommand = { blockId: block.id, blockRevision: block.revision, deliveryId: endStatus.deliveryId!, authorized: true as const, action: 'end' as const };
  const endContext = { operationId: randomUUID(), expectedRevision: `"${endStatus.id}:${endStatus.revision}"` };
  await f.pipeline.makeAttemptDecision(f.attemptId, endCommand, endContext); await f.pipeline.drain();
  expect(f.status()).toMatchObject({ phase: 'finished', result: 'cancelled', suspension: null });
  expect(f.db.prepare<[string], { attempt_id: string }>('SELECT attempt_id FROM cancellation_requests WHERE operation_id=?').get(endContext.operationId)).toEqual({ attempt_id: f.attemptId });
  expect(f.execution.cancelAttempt).toHaveBeenCalledExactlyOnceWith(f.attemptId, endContext.operationId);
  expect(f.storage.getResources(f.attemptId).cleanup).toBe('pending');
  f.storage.validatePreviousAttempt(f.attemptId, f.projectId, f.issue.id);
  expect((await f.preparations.getPreparation(successorId)).view.preparation.previous_attempt_id).toBe(f.attemptId);
});


it('blocks human decisions with a stale ETag and rejects guidance after the captured correction limit', async () => {
  const f = await fixture(0); f.implement(); await f.pipeline.drain(); f.accept(f.result(false)); await f.pipeline.drain();
  const status = f.status(); const block = f.storage.getAttemptBlock(f.attemptId)!;
  expect(block).toMatchObject({ reason: 'correction_limit', guidance_capability: { available: false } });
  const guidance = { blockId: block.id, blockRevision: block.revision, deliveryId: status.deliveryId!, authorized: true as const,
    action: 'guidance' as const, guidance: 'Try another correction.' };
  await expect(f.pipeline.makeAttemptDecision(f.attemptId, guidance, { operationId: randomUUID(), expectedRevision: `"${status.id}:${status.revision - 1}"` }))
    .rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  await expect(f.pipeline.makeAttemptDecision(f.attemptId, guidance, { operationId: randomUUID(), expectedRevision: `"${status.id}:${status.revision}"` }))
    .rejects.toMatchObject({ code: 'CORRECTION_LIMIT_REACHED' });
  expect(f.db.prepare('SELECT * FROM attempt_decisions').all()).toEqual([]);
});


it('requires the exact durable producer in internal and HTTP review identities', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain();
  const first = f.reviewer();
  expect(first.review.implementerPassageId).toBe(f.storage.getDelivery(first.review.deliveryId).delivery.producerPassageId);
  const { toHttpReview } = await import('../../apps/controller/src/http/execution-views.js');
  expect(toHttpReview(first.review)).toMatchObject({ implementer_passage_id: first.review.implementerPassageId });
  expect(toHttpReview(first.review)).not.toHaveProperty('verification_id');
  f.accept(f.result(false)); await f.pipeline.drain(); f.implement(); await f.pipeline.drain();
  const second = f.reviewer().review;
  const sql = f.db.prepare("INSERT INTO reviews(id,delivery_id,attempt_id,passage_id,implementer_passage_id,content_identity,state,independence_state,workspace_state,created_at_ms) VALUES (?,?,?,?,?,?,'pending','pending','planned',0)");
  const values = [randomUUID(),second.deliveryId,second.attemptId,second.passageId,second.implementerPassageId,second.contentIdentity];
  for (const [index,value] of [[4,first.review.implementerPassageId],[4,first.review.passageId],[1,first.review.deliveryId],[5,first.review.contentIdentity]] as const) {
    const invalid = [...values]; invalid[index]=value;
    expect(() => sql.run(...invalid)).toThrow('REVIEW_BINDING_INVALID');
  }
  for (const value of [first.review.implementerPassageId,first.review.passageId]) {
    expect(() => f.db.prepare('UPDATE reviews SET implementer_passage_id=? WHERE id=?').run(value,second.id)).toThrow('IMMUTABLE_RECORD');
  }
  expect(f.db.prepare('SELECT count(*) AS n FROM reviews').get()).toEqual({ n:2 });
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('refuses schema upgrade when persisted reviews would require conversion and leaves their rows untouched', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain();
  const reviews = f.db.prepare('SELECT id,delivery_id,attempt_id,passage_id,implementer_passage_id,content_identity,state FROM reviews ORDER BY id').all();
  const resources = f.db.prepare('SELECT id,attempt_id,passage_id,kind,reference FROM resources ORDER BY id').all();
  await f.pipeline.close(); f.storage.close();
  f.db.exec('DELETE FROM schema_migrations WHERE version>=52; PRAGMA user_version=51;');
  expect(() => openStorage({ dataDirectory: f.directory })).toThrow();
  expect(f.db.pragma('user_version', { simple: true })).toBe(51);
  expect(f.db.prepare('SELECT id,delivery_id,attempt_id,passage_id,implementer_passage_id,content_identity,state FROM reviews ORDER BY id').all()).toEqual(reviews);
  expect(f.db.prepare('SELECT id,attempt_id,passage_id,kind,reference FROM resources ORDER BY id').all()).toEqual(resources);
});

it.each(['uncaptured','revoked','finished'] as const)('rejects structural review planning without allocating resources: %s', async condition => {
  const f = await fixture(2, async base => { vi.spyOn(base.storage,'beginReview').mockReturnValue(null); });
  if (condition==='uncaptured') f.captureDelivery.mockRejectedValueOnce(new Error('Capture unavailable'));
  f.implement(); await f.pipeline.drain();
  vi.mocked(f.storage.beginReview).mockRestore();
  if(condition==='revoked') f.db.prepare("UPDATE passages SET state='interrupted' WHERE id=?").run(f.producer().binding.passageId);
  if(condition==='finished') f.persistence.recordCancellation(f.attemptId,randomUUID());
  const resources=f.db.prepare('SELECT count(*) AS n FROM resources').get();
  const passages=f.db.prepare('SELECT count(*) AS n FROM passages').get();
  expect(()=>f.storage.beginReview(f.status().deliveryId!)).toThrow(expect.objectContaining({code:'REVIEW_NOT_ALLOWED'}));
  expect(f.db.prepare('SELECT count(*) AS n FROM resources').get()).toEqual(resources);
  expect(f.db.prepare('SELECT count(*) AS n FROM passages').get()).toEqual(passages);
});

it('approves complete independent evidence without a manual verification or producer check list', async () => {
  const f=await fixture(); const p=f.producer();
  const value: ImplementerResult={formatVersion:1,summary:'Await independent evaluation',writesStopped:true,checks:[],
    criteria:['ac-1','ac-2'].map(criterionId=>({criterionId,verdict:'not_verified',evidence:['Independent evaluation required']}))};
  f.persistence.acceptResult({binding:p.binding,result:value,sha256:digest(value)}); await f.pipeline.drain();
  for(const evidence of [[],[' '],['a'.repeat(40)],['artifact:'+randomUUID()]]) {
    const invalid=f.result(); invalid.criteria[0]!.evidence=evidence;
    expect(()=>f.accept(invalid)).toThrow('RESULT_INVALID');
    expect(f.persistence.getResult(f.reviewer().passage.handle)).toBeNull();
  }
  f.accept(f.result());
  expect(f.reviewer().review.state).toBe('approved');
  expect(f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('verification_runs','checks','artifacts')").all()).toEqual([]);
});


it.each(['partial','proven','none','not_assessable'] as const)('guards %s assessment against the exact accepted reviewer payload while still pending', async progress => {
  const f=await disputedFixture(); f.implement(); await f.pipeline.drain();
  const {review,passage}=f.reviewer(); const root=f.original.findings[0]!;
  f.storage.recordReviewIntegrity(passage.binding,true);
  const value=f.result(false); const evidence=['proven','partial'].includes(progress) ? value.criteria[0]!.evidence : [];
  const assessment={findingId:root.id,progress,justification:'Independent observation of the current criterion',evidence};
  value.assessments=[assessment];
  const {criteria,...summary}=value;
  f.db.prepare('INSERT INTO passage_results(passage_id,attempt_id,result_hash,receipt_id,summary_json,accepted_at_ms) VALUES (?,?,?,?,?,0)')
    .run(passage.binding.passageId,f.attemptId,digest(value),randomUUID(),JSON.stringify(summary));
  for(const c of criteria) f.db.prepare('INSERT INTO criterion_results(passage_id,attempt_id,criterion_id,verdict,evidence_json) VALUES (?,?,?,?,?)')
    .run(passage.binding.passageId,f.attemptId,c.criterionId,c.verdict,JSON.stringify(c.evidence));
  const insert=f.db.prepare('INSERT INTO finding_assessments(id,attempt_id,finding_id,review_id,progress,evidence_json,justification,created_at_ms) VALUES (?,?,?,?,?,?,?,0)');
  const args=[randomUUID(),f.attemptId,root.id,review.id,progress,JSON.stringify(evidence),assessment.justification];
  const invalidRows: Array<readonly [number, string]> = [
    [5, JSON.stringify(['unrelated evidence'])],
    [5, JSON.stringify([`artifact:${randomUUID()}`])],
    [5, JSON.stringify(['a'.repeat(40)])],
    [6, 'Different justification'],
    [4, progress === 'partial' ? 'proven' : 'partial'],
  ];
  if (['proven','partial'].includes(progress)) invalidRows.push([5, '[]']);
  for(const [index,replacement] of invalidRows){
    const invalid=[...args];invalid[index]=replacement;
    expect(()=>insert.run(...invalid)).toThrow('ASSESSMENT_EVIDENCE_INVALID');
    expect(f.db.prepare('SELECT * FROM finding_assessments').all()).toEqual([]);
  }
  insert.run(...args);
  expect(f.storage.getReview(review.deliveryId)?.state).toBe('pending');
  expect(f.db.prepare('SELECT progress,evidence_json,justification FROM finding_assessments').get())
    .toEqual({progress,evidence_json:JSON.stringify(evidence),justification:assessment.justification});
  expect(()=>f.db.exec("UPDATE finding_assessments SET progress='none'")).toThrow('IMMUTABLE_RECORD');
  expect(f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('verification_runs','checks','artifacts')").all()).toEqual([]);
});
