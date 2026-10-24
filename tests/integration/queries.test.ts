import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { AttemptDetail, DeliveryDetail, DetailPage, type DetailSection } from '#contracts';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { confirmTerminalStops } from '../fixtures/attempt.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';

const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(composed = true) { const f = await publicationFixture(composed); fixtures.push(f); return f; }

it('consults a planned round before capture without inventing a delivery or review', async () => {
  const f = await fixture();
  const before = f.db.prepare('SELECT max(seq) AS n FROM events').get();
  const calls = f.mutateEffect.mock.calls.length;
  const detail = f.storage.getAttemptDetail(f.attemptId,{});
  expect(Value.Check(AttemptDetail,detail)).toBe(true);
  expect(detail).toMatchObject({ selectedDeliveryId: null,selectedRound: 1,
    publication: { reviewState: null,localState: 'pending',completeCapability: { available: false,reason_code: 'DELIVERY_NOT_CAPTURED' } } });
  for (const section of ['rounds','passages','criteria','checks','reviews','findings','questions','effects','resources'] as const) {
    const selected = f.storage.getAttemptDetail(f.attemptId,{ roundId: '1',section,limit: '1' });
    expect(Value.Check(AttemptDetail,selected)).toBe(true);
    expect(selected.selectedDeliveryId).not.toBeNull();
    expect(selected.publication.reviewState).toBeNull();
  }
  expect(f.db.prepare('SELECT max(seq) AS n FROM events').get()).toEqual(before);
  expect(f.mutateEffect).toHaveBeenCalledTimes(calls);
});

it('returns independently paged sections with version-specific evidence, no GET effects and explicit continuation', async () => {
  const f = await fixture(); await f.implement(); await f.approve(); const deliveryId = f.status().deliveryId!;
  const before = f.db.prepare('SELECT max(seq) AS n FROM events').get(); const calls = f.mutateEffect.mock.calls.length;
  const sections: DetailSection[] = ['rounds','passages','criteria','checks','reviews','findings','questions','effects','resources'];
  for (const section of sections) {
    const first = f.storage.getAttemptDetail(f.attemptId,{ deliveryId,section,limit: '1' });
    expect(Value.Check(AttemptDetail,first)).toBe(true); expect(Value.Check(DetailPage,first.details)).toBe(true);
    expect(first.details!.items.length).toBeLessThanOrEqual(1);
    let page = first.details!; const all = [...page.items];
    while (page.has_more) {
      expect(page.next_cursor).not.toBeNull();
      page = f.storage.getAttemptDetail(f.attemptId,{ deliveryId,section,limit: '1',cursor: page.next_cursor! }).details!;
      all.push(...page.items);
    }
    if (section === 'criteria') expect(all).toMatchObject([{ id: 'ac-1',producer: { verdict: 'passed' },reviewer: { verdict: 'passed' } },{ id: 'ac-2' }]);
    if (section === 'passages') expect(all).toHaveLength(2);
    if (section === 'effects') expect(all).toHaveLength(4);
    const view = f.storage.getDeliveryDetail(deliveryId,{ section,limit: '1' });
    expect(Value.Check(DeliveryDetail,view)).toBe(true); expect(view.details?.section).toBe(section);
  }
  expect(f.db.prepare('SELECT max(seq) AS n FROM events').get()).toEqual(before);
  expect(f.mutateEffect).toHaveBeenCalledTimes(calls); expect(f.verifyRetainedDelivery).toHaveBeenCalledOnce();
});

it('keeps a selected rejected version while the next round and approved version advance', async () => {
  const f = await fixture(false); await f.implement(); const firstId = f.status().deliveryId!;
  await f.approve(false); expect(f.status().round).toBe(2);
  const historical = f.storage.getAttemptDetail(f.attemptId,{ deliveryId: firstId,section: 'findings',limit: '1' });
  expect(historical).toMatchObject({ selectedDeliveryId: firstId,selectedRound: 1,publication: { reviewState: 'rejected',completeCapability: { available: false } } });
  expect(historical.details?.items[0]).toMatchObject({ blocking: true,resolutions: [] });
  await f.implement(); const secondId = f.status().deliveryId!; await f.approve();
  const selected = f.storage.getAttemptDetail(f.attemptId,{ deliveryId: firstId,section: 'criteria' });
  expect(selected.selectedDeliveryId).toBe(firstId); expect(selected.selectedRound).toBe(1);
  expect(selected.details?.items[0]).toMatchObject({ reviewer: { verdict: 'failed' } });
  const finding = f.storage.getDeliveryDetail(firstId,{ section: 'findings' }).details?.items[0];
  expect(finding).toMatchObject({ resolutions: [{ deliveryId: secondId,verdict: 'resolved' }] });
  expect(f.storage.getDeliveryDetail(secondId,{}).review?.state).toBe('approved');
  expect(() => f.storage.getAttemptDetail(f.attemptId,{ deliveryId: secondId,roundId: '1' })).toThrow(expect.objectContaining({ statusCode: 404 }));
});

it('pages questions with receipt/timing metadata while leaving decision and answer bodies on demand', async () => {
  const f = await fixture(false); const passage = f.persistence.getPassage({ passageId: f.status().passageId });
  const question = { formatVersion: 1 as const,decision: 'A product choice?',context: 'PRIVATE_QUESTION_CONTEXT',alternatives: ['A','B'] };
  const raised = f.persistence.raiseQuestion({ binding: passage.binding,question,sha256: digest(question) });
  const view = f.storage.getAttemptDetail(f.attemptId,{ section: 'questions' });
  expect(view.details?.items).toMatchObject([{ id: raised.questionId,state: 'pending',deliveryReceipt: null }]);
  expect(JSON.stringify(view)).not.toContain('PRIVATE_QUESTION_CONTEXT');
  expect(f.storage.getQuestion(f.attemptId,raised.questionId).view.question.context).toBe('PRIVATE_QUESTION_CONTEXT');
});

it('binds section cursors to account, attempt, version and filters', async () => {
  const f = await fixture(); await f.implement(); await f.approve(); const deliveryId = f.status().deliveryId!;
  const page = f.storage.getAttemptDetail(f.attemptId,{ section: 'criteria',deliveryId,limit: '1' }).details!;
  expect(page.has_more).toBe(true);
  expect(() => f.storage.getAttemptDetail(f.attemptId,{ section: 'effects',deliveryId,cursor: page.next_cursor! })).toThrow(expect.objectContaining({ code: 'QUERY_CURSOR_INVALID' }));
  expect(() => f.storage.getAttemptDetail(f.attemptId,{ section: 'criteria',deliveryId,roundId: '1',cursor: page.next_cursor! })).toThrow(expect.objectContaining({ code: 'QUERY_CURSOR_INVALID' }));
  expect(() => f.storage.getDeliveryDetail(deliveryId,{ section: 'criteria',cursor: 'malformed' })).toThrow(expect.objectContaining({ code: 'QUERY_CURSOR_INVALID' }));
  expect(() => f.storage.getAttemptDetail(f.attemptId,{ deliveryId: randomUUID() })).toThrow(expect.objectContaining({ statusCode: 404 }));
  f.db.prepare('UPDATE factory_settings SET account_id=NULL').run();
  expect(f.storage.listAttempts({}).items).toEqual([]);
  expect(() => f.storage.getDeliveryDetail(deliveryId,{})).toThrow(expect.objectContaining({ statusCode: 404 }));
});

it('keeps list cursors stable with equal timestamps and new inserts and rejects filter changes', async () => {
  const f = await fixture(false);
  async function add(number: number) {
    f.issue.id = 'ISSUE_'+number; f.issue.number = number;
    const p = await f.prepare(); const op = await f.pipeline.startAttempt(p.body,p.context); await f.pipeline.drain(); return op.resource.id;
  }
  const second = await add(18);
  const first = f.storage.listAttempts({ projectId: f.projectId,limit: '1' }); expect(first.has_more).toBe(true);
  const added = await add(19);
  const next = f.storage.listAttempts({ projectId: f.projectId,limit: '1',cursor: first.next_cursor! });
  expect(next.items).toHaveLength(1); expect(next.items[0]!.id).not.toBe(first.items[0]!.id); expect(next.items[0]!.id).not.toBe(added);
  expect(new Set([first.items[0]!.id,next.items[0]!.id])).toEqual(new Set([f.attemptId,second]));
  expect(() => f.storage.listAttempts({ projectId: f.projectId,result: 'active',cursor: first.next_cursor! })).toThrow(expect.objectContaining({ code: 'QUERY_CURSOR_INVALID' }));
  expect(JSON.stringify(first)).not.toContain('criteria'); expect(JSON.stringify(first)).not.toContain('capture_json');
});

it('reads real check definitions and artifact metadata without accessing log bytes', async () => {
  const f = await fixture(false);
  // Configure a new attempt before its capture, preserving the first attempt's captured configuration.
  f.storage.interruptAttempts();
  confirmTerminalStops(f, f.attemptId);
  expect(f.storage.getConfiguration(f.projectId).view.configuration_lock).toBeNull();
  const config = f.storage.getConfiguration(f.projectId);
  const { id: _id,project_id: _projectId,revision: _revision,created_at_ms: _created,...configuration } = config.view.configuration;
  const checks = [{ id: 'test',command: 'node --version',cwd_relative: '.' }];
  const bytes = Buffer.from('proof'); f.verification.getArtifact.mockResolvedValue({ bytes, filename: 'proof.log' });
  f.storage.saveConfiguration({ operationId: randomUUID(),expectedRevision: config.etag,projectId: f.projectId,body: { project_changes: { checks } },configuration: { ...configuration,checks },globalChanges: {} });
  f.issue.id = 'ISSUE_CHECK'; f.issue.number = 20;
  const p = await f.prepare(); const op = await f.pipeline.startAttempt(p.body,p.context); await f.pipeline.drain(); const attemptId = op.resource.id;
  // The controlled verifier completes SQL metadata only. Filesystem artifacts have separate integration coverage.
  f.verification.verifyDelivery.mockImplementationOnce(async deliveryId => {
    const plan = f.storage.beginVerification(deliveryId);
    for (const check of plan.checks) {
      f.storage.startCheck(check.id);
      const artifactId = randomUUID();
      f.storage.finishCheck(check.id,{ state: 'passed',exitCode: 0,endedAtMs: Date.now(),durationMs: 0,diagnostic: null,executionDiagnostic: null,artifact: {
        id: artifactId,attemptId,deliveryId,checkId: check.id,kind: 'check_log',pathRelative: `${attemptId}/${check.id}/${artifactId}.log`,sha256: createHash('sha256').update(bytes).digest('hex'),sizeBytes: 5,
      } });
    }
    f.storage.finishVerification(plan.id);
  });
  const status = f.storage.getAttempt(attemptId); const passage = f.persistence.getPassage({ passageId: status.passageId });
  const result = { formatVersion: 1 as const,summary: 'Controlled implementation',writesStopped: true as const,
    criteria: ['ac-1','ac-2'].map(criterionId => ({ criterionId,verdict: 'passed' as const,evidence: ['Observed'] })),checks: [] };
  f.persistence.acceptResult({ binding: passage.binding,result,sha256: digest(result) }); await f.pipeline.drain();
  f.verification.getArtifact.mockClear();
  expect(f.storage.getAttemptDetail(attemptId,{ section: 'checks' }).details?.items).toMatchObject([{ state: 'passed',exitCode: 0,artifacts: [{ sizeBytes: 5 }] }]);
  expect(f.verification.getArtifact).not.toHaveBeenCalled();
  expect(f.storage.getAttemptCapture(f.attemptId).configuration.configuration.checks).toEqual([]);
});

it('keeps summary payloads and persisted bytes independent of a large ignored cache', async () => {
  const f = await fixture(); await f.implement(); await f.approve(); const deliveryId = f.status().deliveryId!;
  const payload = () => JSON.stringify([f.storage.listAttempts({}),f.storage.getAttemptDetail(f.attemptId,{}),f.storage.getDeliveryDetail(deliveryId,{})]);
  const sizes = () => [statSync(join(f.directory,'factory.sqlite')).size,statSync(join(f.directory,'factory.sqlite-wal')).size];
  const before = payload(); const bytes = sizes();
  const cache = join(f.directory,'work',f.attemptId,'implementation','node_modules','cache'); mkdirSync(cache,{ recursive: true }); writeFileSync(join(cache,'ignored.bin'),Buffer.alloc(16_777_216,93));
  expect(payload()).toBe(before); expect(sizes()).toEqual(bytes);
  expect(f.verifyRetainedDelivery).toHaveBeenCalledOnce(); expect(f.verification.getArtifact).not.toHaveBeenCalled();
  expect(f.workspaces.captureDelivery).toHaveBeenCalledOnce();
});
