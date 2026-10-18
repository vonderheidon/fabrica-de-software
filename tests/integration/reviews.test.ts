import { toHttpRoundHistory, toHttpProducerResult } from '../../apps/controller/src/http/execution-views.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ImplementerResult, ReviewerResult } from '#contracts';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { removeReviewSchema } from '../fixtures/review-schema.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(limit = 2) {
  const f = await attemptFixture(); fixtures.push(f);
  const config = f.storage.getConfiguration(f.projectId);
  const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAtMs, ...configuration } = config.view.configuration;
  if (limit !== configuration.correction_limit) f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: config.etag, projectId: f.projectId,
    body: { project_changes: { correction_limit: limit } }, globalChanges: {}, configuration: { ...configuration, correction_limit: limit } });
  const verify = vi.fn(async (id: string) => {
    const plan = f.storage.beginVerification(id); f.storage.finishVerification(plan.id);
  });
  f.dependencies.verification = { verifyDelivery: verify, getArtifact: vi.fn(async () => { throw new Error('Not exercised'); }) };
  const materializeReview = vi.fn(async (d: { attemptId: string }, id: string) => join(f.directory, 'work', d.attemptId, 'reviews', id, 'checkout'));
  const captureDelivery = vi.fn(async (input: { deliveryId: string }) => ({ gitRef: `refs/factory/deliveries/${input.deliveryId}`,
    contentIdentity: digest(input).slice(0, 40), commitSha: digest({ commit: input }).slice(0, 40), hasDelta: true, warnings: [] }));
  Object.assign(f.workspaces, { captureDelivery, materializeReview });
  const preparation = await f.prepare(); const op = await f.pipeline.startAttempt(preparation.body, preparation.context); await f.pipeline.drain();
  const attemptId = op.resource.id;
  const status = () => f.storage.getAttempt(attemptId);
  const producer = () => f.persistence.getPassage({ passageId: status().passageId });
  function implement() {
    const passage = producer(); const previous = f.storage.getOpenFindings(attemptId, passage.binding.round);
    const result: ImplementerResult = { formatVersion: 1, summary: 'Implemented captured scope', writesStopped: true,
      criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed integration result'] })), checks: [],
      ...(passage.binding.round > 1 ? { findingResponses: previous.map(x => ({ findingId: x.id, response: 'Corrected behavior', evidence: ['New check evidence'] })) } : {}) };
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
      criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: approved ? 'passed' : 'failed', evidence: ['Observed exact captured version ' + review.contentIdentity] })),
      findings: approved ? [] : [{ key: 'response-value', criterionIds: ['ac-1'], category: 'correctness', problem: 'Response value is incorrect', evidence: ['GET returned 2 instead of 3'], expectedResult: 'GET returns 3', blocking: true }],
      resolutions: prior.map(x => ({ findingKey: x.id, verdict: approved ? 'resolved' : 'unresolved', evidence: ['Independently checked response on new tree'] })) };
  }
  function accept(value: ReviewerResult, valid = true) {
    const { passage } = reviewer(); f.storage.recordReviewIntegrity(passage.binding, valid);
    return f.persistence.acceptResult({ binding: passage.binding, result: value, sha256: digest(value) });
  }
  return { ...f, verify, materializeReview, captureDelivery, attemptId, status, producer, implement, reviewer, result, accept };
}

it('dispatches review after durable capture/checks, with exact profile/tree and no implementer conversation', async () => {
  const f = await fixture(); expect(f.materializeReview).not.toHaveBeenCalled();
  f.implement(); await f.pipeline.drain();
  const { review, passage } = f.reviewer(); const delivery = f.storage.getDelivery(review.deliveryId);
  expect(f.verify).toHaveBeenCalledExactlyOnceWith(delivery.delivery.id, expect.any(AbortSignal));
  const calls = vi.mocked(f.execution.startPassage).mock.calls; expect(calls).toHaveLength(2);
  const request = calls[1]![0]; const task = JSON.parse(request.task) as Record<string, unknown>;
  expect(request.binding.role).toBe('reviewer'); expect(request.cwd).toContain(join('reviews', review.id, 'checkout'));
  expect(request.cwd).not.toBe(calls[0]![0].cwd); expect(request.binding.passageId).not.toBe(calls[0]![0].binding.passageId);
  expect(task).not.toHaveProperty('transcript'); expect(task).not.toHaveProperty('implementerResult');
  expect(task.delivery).toEqual(delivery.delivery); expect(passage.effectiveProfile?.model).toBe(f.profile.model);
  expect(review.contentIdentity).toBe(delivery.verification?.contentIdentity);
  const accepted = f.accept(f.result()); await f.pipeline.drain();
  expect(f.storage.getReview(review.deliveryId)).toMatchObject({ state: 'approved', independenceState: 'valid' });
  expect(f.status()).toMatchObject({ phase: 'publishing', result: null, round: 1 });
  expect(f.persistence.acceptResult({ binding: passage.binding, result: accepted.result, sha256: accepted.sha256 }).receiptId).toBe(accepted.receiptId);
});

it('invalidates declared approval if the reviewer changed product, and never repairs independence in place', async () => {
  const f = await fixture(0); f.implement(); await f.pipeline.drain(); const { review, passage } = f.reviewer();
  f.storage.recordReviewIntegrity(passage.binding, false); f.storage.recordReviewIntegrity(passage.binding, true);
  f.accept(f.result()); await f.pipeline.drain();
  expect(f.storage.getReview(review.deliveryId)).toMatchObject({ state: 'rejected', independenceState: 'invalid', diagnostic: 'REVIEW_PRODUCT_CHANGED' });
  expect(f.status()).toMatchObject({ phase: 'finished', result: 'rejected', round: 1 });
});

it.each([0, 1, 2, 3, 4, 5])('exhausts correctionLimit=%i only after reviewing the last allowed version', async limit => {
  const f = await fixture(limit); const reviews = [];
  for (let round = 1; round <= 1 + limit; round++) {
    expect(f.status().round).toBe(round); f.implement(); await f.pipeline.drain();
    const { review } = f.reviewer(); reviews.push(review.deliveryId); f.accept(f.result(false)); await f.pipeline.drain();
  }
  expect(f.status()).toMatchObject({ result: 'rejected', phase: 'finished', round: 1 + limit });
  expect(new Set(reviews).size).toBe(1 + limit);
  expect(f.execution.continuePassage).toHaveBeenCalledTimes(limit);
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2 + limit); // One implementer session; every review is new.
  expect(f.verify).toHaveBeenCalledTimes(1 + limit); expect(f.captureDelivery).toHaveBeenCalledTimes(1 + limit);
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

it.each(['findings', 'finding_resolutions', 'reviews', 'events'])('rolls back result/receipt/review state when %s persistence fails', async table => {
  const f = await fixture(); f.implement(); await f.pipeline.drain();
  if (table === 'finding_resolutions') { f.accept(f.result(false)); await f.pipeline.drain(); f.implement(); await f.pipeline.drain(); }
  const { passage, review } = f.reviewer(); f.storage.recordReviewIntegrity(passage.binding, true);
  f.db.exec(`CREATE TRIGGER review_test_failure BEFORE ${table === 'reviews' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'controlled failure'); END`);
  const value = table === 'finding_resolutions' ? f.result() : f.result(false);
  expect(() => f.persistence.acceptResult({ binding: passage.binding, result: value, sha256: digest(value) })).toThrow('STORAGE_FAILED');
  expect(f.persistence.getResult(passage.handle)).toBeNull(); expect(f.storage.getReview(review.deliveryId)?.state).toBe('pending');
  f.db.exec('DROP TRIGGER review_test_failure');
  f.persistence.acceptResult({ binding: passage.binding, result: value, sha256: digest(value) });
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
    expect(reopened.getAttempt(f.attemptId).result).toBe('rejected');
  } finally { reopened.close(); }
});

it('migrates real SQLite v7 without reseeding, changing captured refs or fabricating reviews', async () => {
  const f = await fixture(); delete f.dependencies.verification;
  f.implement(); await f.pipeline.drain(); const d = f.status().deliveryId!;
  const old = f.storage.getDelivery(d); const identity = f.storage.getSettings().installation_id;
  await f.pipeline.close(); f.storage.close(); removeReviewSchema(f.db);
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    expect(reopened.getDiagnostics().schemaVersion).toBe(24); expect(reopened.getSettings().installation_id).toBe(identity);
    expect(reopened.getDelivery(d)).toMatchObject({ delivery: old.delivery, verification: old.verification }); expect(reopened.getReview(d)).toBeNull();
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
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

it('does not allocate review intent after a technical check error or an unfinished check', async () => {
  const f = await fixture(); delete f.dependencies.verification; f.implement(); await f.pipeline.drain(); const d = f.status().deliveryId!;
  expect(() => f.storage.beginReview(d)).toThrow(expect.objectContaining({ code: 'REVIEW_NOT_ALLOWED' }));
  const run = f.storage.beginVerification(d);
  expect(() => f.storage.beginReview(d)).toThrow(expect.objectContaining({ code: 'REVIEW_NOT_ALLOWED' }));
  f.storage.finishVerification(run.id, 'CHECK_STOP_UNCONFIRMED');
  expect(() => f.storage.beginReview(d)).toThrow(expect.objectContaining({ code: 'REVIEW_NOT_ALLOWED' }));
  expect(f.storage.getReview(d)).toBeNull(); expect(f.execution.startPassage).toHaveBeenCalledOnce();
});

it('preserves cancellation while a review workspace materialization returns late', async () => {
  const f = await fixture(); let release: (() => void) | undefined;
  f.materializeReview.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return 'controlled-review-checkout'; });
  f.implement(); await vi.waitFor(() => expect(release).toBeDefined());
  f.persistence.recordCancellation(f.attemptId, randomUUID()); release!(); await f.pipeline.drain();
  expect(f.status().result).toBe('cancelled'); expect(f.execution.startPassage).toHaveBeenCalledOnce();
});

it('rolls back review intent under SQLite busy before any reviewer materialization', async () => {
  const f = await fixture(); delete f.dependencies.verification; f.implement(); await f.pipeline.drain(); const d = f.status().deliveryId!;
  const run = f.storage.beginVerification(d); f.storage.finishVerification(run.id);
  f.db.exec('BEGIN IMMEDIATE');
  try { expect(() => f.storage.beginReview(d)).toThrow(expect.objectContaining({ code: 'CONFIGURATION_STORAGE_FAILED' })); }
  finally { f.db.exec('ROLLBACK'); }
  expect(f.storage.getReview(d)).toBeNull(); expect(f.materializeReview).not.toHaveBeenCalled();
  expect(f.storage.beginReview(d)?.state).toBe('pending');
});

it('does not revoke a correction when the completed previous reviewer disconnects', async () => {
  const f = await fixture(); f.implement(); await f.pipeline.drain(); const old = f.reviewer().passage;
  f.accept(f.result(false)); await f.pipeline.drain();
  f.persistence.record(old.handle, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
  expect(f.status()).toMatchObject({ round: 2, phase: 'implementing', suspension: null });
  f.implement(); await f.pipeline.drain(); f.accept(f.result()); await f.pipeline.drain();
  expect(f.status()).toMatchObject({ phase: 'publishing', result: null });
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
