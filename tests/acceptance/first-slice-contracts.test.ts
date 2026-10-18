import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { JsonLines, executionLimits } from '../../apps/controller/src/modules/execution/adapters/maestri-omp/wire.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import type { CapturedContent } from '../../apps/controller/src/modules/workspaces/index.js';

// SQLite and domain services are real; GitHub, Git, runtime and check execution
// are controlled by the existing fixture. These tests never satisfy real acceptance.
const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() { const f = await publicationFixture(); fixtures.push(f); return f; }

describe('first slice contracts across domain boundaries (controlled)', () => {
  it('preserves S1-S4 through scope decision, uncertain answer, correction and version-specific ICR', async () => {
    const f = await fixture();
    const captured = f.storage.getAttemptCapture(f.attemptId);
    const producer = f.persistence.getPassage({ passageId: f.status().passageId });
    expect(captured.roleResources.map(r => r.role).sort()).toEqual(['implementer', 'reviewer']);
    expect(captured.tools.map(t => t.tool).sort()).toEqual(['gh', 'git', 'maestri', 'node', 'omp']);
    expect(captured.criteria.map(c => c.id)).toEqual(['ac-1', 'ac-2']);
    expect(captured.criteria[0]!.text).toBe(captured.criteria[1]!.text);

    // S4: editorial changes do not suspend; criteria changes preserve the capture.
    f.issue.body += '\n## Notes\nEditorial clarification.';
    expect(await f.pipeline.revalidateScope(producer.binding)).toBe(true);
    f.issue.body = f.issue.body.replace('- Same text', '- Changed criterion');
    expect(await f.pipeline.revalidateScope(producer.binding)).toBe(false);
    const questionId = f.status().pendingQuestionId!;
    const question = f.storage.getQuestion(f.attemptId, questionId);
    expect(question.view.scopeChange?.capturedCriteria).toEqual(captured.criteria);
    const answer = { attemptId: f.attemptId, questionId, operationId: randomUUID(), expectedRevision: question.etag,
      body: { answer: 'Manter o escopo capturado 😀', scopeChoice: 'keep_captured' as const } };
    f.storage.recordAnswer(answer);
    expect(f.persistence.claimAnswer(producer.handle, answer.operationId)).toBe(true);
    f.persistence.confirmAnswer(producer.handle, answer.operationId, 'delivery_unknown');
    expect((await f.pipeline.answerQuestion(answer)).state).toBe('unknown');
    expect(f.execution.answerQuestion).not.toHaveBeenCalled();
    expect(f.status().suspension).toBe('HUMAN_DECISION');
    expect(f.storage.getAttemptCapture(f.attemptId)).toEqual(captured);
    const receipt = f.persistence.confirmAnswer(producer.handle, answer.operationId, 'delivered');
    expect(receipt).toMatchObject({ questionId, state: 'delivered' });
    expect(f.storage.getQuestion(f.attemptId, questionId).view.deliveryReceipt?.passageId).toBe(producer.handle.passageId);
    expect(await f.pipeline.revalidateScope(producer.binding)).toBe(true);

    // S2: project bytes are never inserted into the warning or detail projection.
    Object.assign(f.workspaces, { captureDelivery: vi.fn(async (input: { deliveryId: string }): Promise<CapturedContent> => {
      const delivery = f.storage.getDelivery(input.deliveryId).delivery;
      return { gitRef: `refs/factory/deliveries/${delivery.id}`, contentIdentity: digest(input).slice(0, 40),
        commitSha: digest({ commit: input }).slice(0, 40), hasDelta: true,
        warnings: [{ attemptId: delivery.attemptId, passageId: delivery.producerPassageId, deliveryId: delivery.id,
          path: 'cache/declared.txt', reason: 'DECLARED_NEW_FILE_IGNORED' }] };
    }) });
    await f.implement(); const firstDeliveryId = f.status().deliveryId!;
    expect(f.storage.getDelivery(firstDeliveryId).delivery.warnings[0]).toMatchObject({ deliveryId: firstDeliveryId, path: 'cache/declared.txt' });
    await f.approve(false);
    expect(f.status()).toMatchObject({ round: 2, phase: 'implementing', result: null });
    expect(f.execution.continuePassage).toHaveBeenCalledTimes(1);
    await f.implement(); const approvedId = f.status().deliveryId!;
    await f.approve();
    expect(approvedId).not.toBe(firstDeliveryId);
    expect(f.status()).toMatchObject({ phase: 'finished', result: 'delivered', round: 2 });
    const previous = f.storage.getDeliveryDetail(firstDeliveryId, { section: 'reviews' });
    expect(previous.review?.state).toBe('rejected');
    expect(previous.delivery.warnings[0]?.deliveryId).toBe(firstDeliveryId);
    expect(f.storage.getDeliveryDetail(approvedId, {}).review?.state).toBe('approved');
    expect(f.storage.getReview(approvedId)?.contentIdentity).toBe(f.storage.getDelivery(approvedId).delivery.contentIdentity);
    expect(f.issue.comments).toHaveLength(1);
    expect(f.issue.comments[0]!.body).toContain(f.storage.getDelivery(approvedId).delivery.contentIdentity);
    expect(f.storage.getAttemptCapture(f.attemptId)).toEqual(captured);
    expect(f.storage.getAttemptDetail(f.attemptId, { section: 'rounds', limit: '1' }).details?.has_more).toBe(true);
    // S1: subsequent defaults and tool observations cannot rewrite the attempt.
    const settings = f.storage.getGlobalConfiguration();
    const changes = { time_defaults: { passage_active_time_ms: 90_000 } };
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, changes, body: { changes } });
    f.tools[0]!.version = 'changed-after-capture';
    expect(f.storage.getAttemptCapture(f.attemptId)).toEqual(captured);
  });

  it('revokes old authority on reopen, keeps history paginated and starts an explicit retry outside Ready', async () => {
    const f = await fixture(); const oldId = f.attemptId; const old = f.status();
    const captured = f.storage.getAttemptCapture(oldId);
    await f.pipeline.cancelAttempt(oldId, {}, { operationId: randomUUID(), expectedRevision: undefined });
    await f.pipeline.drain();
    f.issue.memberships[0]!.statusValues[0]!.optionId = 'PROGRESS';
    const saved = await f.preparations.createPreparation(f.projectId, { issue_id: f.issue.id, delivery_mode: 'icr', guidance: 'Nova tentativa 😀', overrides: {}, previous_attempt_id: oldId }, { operationId: randomUUID(), expectedRevision: undefined });
    const p = saved.view.preparation;
    const command = { operationId: randomUUID(), expectedRevision: saved.etag };
    const body = { preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summary_hash, authorized: true as const };
    const operation = await f.pipeline.startAttempt(body, command); await f.pipeline.drain();
    expect((await f.pipeline.startAttempt(body, command)).operation_id).toBe(operation.operation_id);
    expect(operation.resource.id).not.toBe(oldId);
    expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(2);
    expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
    expect(f.execution.continuePassage).not.toHaveBeenCalled();
    // S3 API contract: a new active attempt does not change the selected old one.
    const page = f.storage.listAttempts({ limit: '1' });
    expect(page.has_more).toBe(true);
    const next = f.storage.listAttempts({ limit: '1', cursor: page.next_cursor! });
    expect(new Set([...page.items, ...next.items].map(a => a.id))).toEqual(new Set([oldId, operation.resource.id]));
    expect(f.storage.getAttemptDetail(oldId, {}).result).toBe('cancelled');
    expect(f.storage.getAttemptCapture(oldId)).toEqual(captured);
    await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
      expect(reopened.getAttempt(operation.resource.id).result).toBe('interrupted');
      expect(reopened.getOperation(command.operationId)?.resource.id).toBe(operation.resource.id);
      expect(reopened.getAttemptCapture(oldId)).toEqual(captured);
      expect(() => reopened.executionPersistence().confirmReady({ passageId: old.passageId }, f.profile, '18.11.1')).toThrow();
      expect(reopened.listAttempts({}).items).toHaveLength(2);
    } finally { reopened.close(); }
  });
});

describe('transport diagnostic reproduction without provider', () => {
  it('preserves Portuguese and emoji with every byte fragmented', () => {
    const decoder = new JsonLines(); const content = { text: 'Implementação, ação e revisão 😀🧪' };
    const encoded = Buffer.from(`${JSON.stringify(content)}\n`);
    const frames = [...encoded].flatMap(byte => decoder.feed(Uint8Array.of(byte)));
    expect(frames).toEqual([content]); decoder.end();
  });
  it.each(['malformed', 'oversize', 'eof'] as const)('terminates %s with a stable diagnostic', kind => {
    const decoder = new JsonLines();
    const run = () => {
      if (kind === 'malformed') decoder.feed(Buffer.from('{invalid}\n'));
      else if (kind === 'oversize') decoder.feed(Buffer.alloc(executionLimits.frameBytes + 1, 65));
      else { decoder.feed(Buffer.from('{"partial":')); decoder.end(); }
    };
    expect(run).toThrow(expect.objectContaining({ code: kind === 'malformed' ? 'FRAME_INVALID' : kind === 'oversize' ? 'FRAME_OVERSIZE' : 'CHANNEL_EOF' }));
  });
});
