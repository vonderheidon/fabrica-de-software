import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImplementerResult, PassageBinding, PassageResult } from '#contracts';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createMaestriOmp } from '../../apps/controller/src/modules/execution/adapters/maestri-omp/adapter.js';
import type { ChannelCallbacks } from '../../apps/controller/src/modules/execution/adapters/maestri-omp/channel.js';
import { digest, loadRoleResources } from '../../apps/controller/src/modules/execution/roles.js';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() {
  const f = await attemptFixture(); fixtures.push(f); const c = await f.prepare();
  const op = await f.pipeline.startAttempt(c.body, c.context); await f.pipeline.drain();
  const status = f.storage.getAttempt(op.resource.id); const handle = { passageId: status.passageId };
  const binding = f.persistence.getPassage(handle).binding;
  const result: ImplementerResult = { formatVersion: 1, summary: 'Implementação concluída 😀', writesStopped: true,
    criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed check'] })), checks: [] };
  const accept = (value: PassageResult = result, link: PassageBinding = binding) => f.persistence.acceptResult({ binding: link, result: value, sha256: digest(value) });
  return { ...f, status, handle, binding, result, accept };
}
describe('durable official results', () => {
  it('commits one hash, receipt, summary, criterion evidence and event before returning; duplicates retain the receipt after restart', async () => {
    const f = await fixture(); const accepted = f.accept();
    expect(f.persistence.getResult(f.handle)).toEqual(accepted);
    expect(f.db.prepare('SELECT result_hash,receipt_id FROM passage_results WHERE passage_id=?').get(f.handle.passageId)).toEqual({ result_hash: digest(f.result), receipt_id: accepted.receiptId });
    expect(f.db.prepare('SELECT count(*) AS n FROM criterion_results WHERE passage_id=?').get(f.handle.passageId)).toEqual({ n: 2 });
    expect(f.storage.getAttempt(f.status.id)).toMatchObject({ phase: 'verifying', result: null, suspension: null, resultReceiptId: accepted.receiptId });
    const cursor = f.storage.getAttempt(f.status.id).eventCursor;
    expect(f.accept()).toEqual(accepted); expect(f.storage.getAttempt(f.status.id).eventCursor).toBe(cursor);
    expect(() => f.accept({ ...f.result, summary: 'Different valid result' })).toThrow('RESULT_CONFLICT');
    f.persistence.record(f.handle, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
    expect(f.persistence.getResult(f.handle)).toEqual(accepted); expect(f.accept()).toEqual(accepted);
    expect(f.storage.getAttempt(f.status.id)).toMatchObject({ phase: 'finished', result: 'interrupted', suspension: null, tracking: 'lost' });
    await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try { expect(reopened.executionPersistence().getResult(f.handle)).toEqual(accepted); expect(reopened.executionPersistence().acceptResult({ binding: f.binding, result: f.result, sha256: digest(f.result) })).toEqual(accepted); }
    finally { reopened.close(); }
  });
  it.each(['duplicate', 'missing', 'unknown', 'evidence', 'schema', 'writes', 'hash', 'binding'] as const)('refuses %s without occupying result or receipt and accepts the correction', async target => {
    const f = await fixture(); const value = structuredClone(f.result); let binding = f.binding;
    if (target === 'duplicate') value.criteria[1]!.criterionId = 'ac-1';
    if (target === 'missing') value.criteria.pop();
    if (target === 'unknown') value.criteria[1]!.criterionId = 'ac-99';
    if (target === 'evidence') value.criteria[0]!.evidence = [];
    if (target === 'schema') Object.assign(value, { privateIdentity: randomUUID() });
    if (target === 'writes') Object.assign(value, { writesStopped: false });
    if (target === 'binding') binding = { ...binding, deliveryVersion: randomUUID() };
    expect(() => f.persistence.acceptResult({ binding, result: value, sha256: target === 'hash' ? '0'.repeat(64) : digest(value) })).toThrow('RESULT_INVALID');
    expect(f.persistence.getResult(f.handle)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM passage_results').get()).toEqual({ n: 0 });
    expect(f.accept().receiptId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it.each(['passage_results', 'criterion_results', 'passage_events', 'events'] as const)('rolls back hash, receipt, summary, criterion rows, phase and events on %s failure', async table => {
    const f = await fixture(); const before = f.storage.getAttempt(f.status.id);
    f.db.exec(`CREATE TRIGGER fail_result BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'private-error'); END`);
    expect(() => f.accept()).toThrow('STORAGE_FAILED'); expect(f.persistence.getResult(f.handle)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM criterion_results').get()).toEqual({ n: 0 });
    expect(f.storage.getAttempt(f.status.id)).toEqual(before);
    f.db.exec('DROP TRIGGER fail_result'); expect(f.accept().receiptId).toBeDefined();
  });
  it('refuses SQL busy without acknowledging and later accepts the same payload', async () => {
    const f = await fixture(); f.db.exec('BEGIN IMMEDIATE');
    try { expect(() => f.accept()).toThrow('STORAGE_FAILED'); expect(f.persistence.getResult(f.handle)).toBeNull(); }
    finally { f.db.exec('ROLLBACK'); }
    expect(f.accept().receiptId).toBeDefined();
  });
  it('does not accept results before a handshake or after coordination was revoked', async () => {
    const f = await fixture(); f.persistence.record(f.handle, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
    expect(() => f.accept()).toThrow('TRACKING_LOST'); expect(f.persistence.getResult(f.handle)).toBeNull();
  });
  it('preserves phase and question identity, blocks results until the same-session answer receipt', async () => {
    const f = await fixture(); const question = { formatVersion: 1 as const, decision: 'Choose scope', context: 'A decision is required', alternatives: ['A', 'B'] };
    const input = { binding: f.binding, question, sha256: digest(question) };
    const q = f.persistence.raiseQuestion(input); expect(f.persistence.raiseQuestion(input)).toEqual(q);
    expect(f.storage.getAttempt(f.status.id)).toMatchObject({ phase: 'implementing', suspension: 'HUMAN_DECISION' });
    expect(() => f.accept()).toThrow(); expect(f.persistence.getResult(f.handle)).toBeNull();
    const answerId = randomUUID(); f.persistence.recordAnswer(f.handle, q.questionId, 'A', answerId);
    f.persistence.confirmAnswer(f.handle, answerId, 'delivery_unknown'); expect(() => f.accept()).toThrow();
    f.persistence.confirmAnswer(f.handle, answerId, 'delivered'); expect(f.accept().receiptId).toBeDefined();
  });
  it('enforces immutable captures/results and same-attempt criterion, round and resource constraints', async () => {
    const f = await fixture(); f.accept();
    for (const sql of [
      "UPDATE attempts SET capture_json='{}'", 'DELETE FROM attempts', "UPDATE attempt_criteria SET text='Changed'", 'DELETE FROM attempt_criteria',
      'UPDATE rounds SET round_number=2', 'DELETE FROM rounds', "UPDATE passages SET role='reviewer'", "UPDATE resources SET reference='elsewhere'",
      "UPDATE passage_results SET receipt_id='changed'", 'DELETE FROM passage_results', "UPDATE criterion_results SET verdict='failed'", 'DELETE FROM criterion_results',
    ]) expect(() => f.db.exec(sql)).toThrow();
    expect(() => f.db.prepare('INSERT INTO criterion_results VALUES (?,?,?,?,?)').run(f.handle.passageId, randomUUID(), 'ac-1', 'passed', '["evidence"]')).toThrow();
    expect(() => f.db.prepare('UPDATE resources SET passage_id=? WHERE attempt_id=?').run(randomUUID(), f.status.id)).toThrow();
    expect(() => f.db.prepare("UPDATE attempts SET phase='reviewing',revision=revision+1 WHERE id=?").run(f.status.id)).not.toThrow();
    expect(f.persistence.getResult(f.handle)?.result).toEqual(f.result);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it('extends validation to a bound reviewer without allowing approval with blocking findings', async () => {
    const f = await fixture(); f.accept();
    const claim = f.storage.beginCapture(f.binding.deliveryVersion)!;
    f.storage.finishCapture(claim, { gitRef: `refs/factory/deliveries/${f.binding.deliveryVersion}`, contentIdentity: 'b'.repeat(40), commitSha: 'c'.repeat(40), hasDelta: true, warnings: [] }, null);
    const reviewer = f.roles.find(r => r.role === 'reviewer')!;
    const verification = f.storage.beginVerification(f.binding.deliveryVersion); f.storage.finishVerification(verification.id);
    const review = f.storage.beginReview(f.binding.deliveryVersion)!; const id = review.passageId;
    f.storage.recordReviewWorkspace(f.binding.deliveryVersion, true, null);
    const binding = { ...f.binding, passageId: id, role: 'reviewer' as const }; const handle = { passageId: id };
    f.persistence.reserve({ handle, binding, requestHash: 'a'.repeat(64), state: 'starting', roleResource: reviewer, terminalName: `factory-${id}`, diagnostic: null, effectiveProfile: null, executorVersion: null });
    const { id: _id, revision: _revision, createdAtMs: _created, updatedAtMs: _updated, ...profile } = f.profile;
    f.persistence.confirmReady(handle, profile, '18.11.1');
    f.storage.recordReviewIntegrity(binding, true);
    const result = { formatVersion: 1 as const, summary: 'Review complete', verdict: 'approved' as const, criteria: f.result.criteria,
      findings: [{ key: 'finding-1', criterionIds: ['ac-1'], category: 'correctness', problem: 'Wrong behavior', evidence: ['Observed'], expectedResult: 'Correct behavior', blocking: true }], resolutions: [] };
    expect(() => f.accept(result, binding)).toThrow('RESULT_INVALID');
    expect(f.persistence.getResult(handle)).toBeNull();
    const accepted = f.accept({ ...result, findings: [] }, binding); expect(f.persistence.getResult(handle)).toEqual(accepted);
  });
  it('rejects cross-links between two existing attempts through composite foreign keys', async () => {
    const f = await fixture(); f.issue.id = 'I_second'; f.issue.number = 18;
    const c = await f.prepare(); const second = await f.pipeline.startAttempt(c.body, c.context); await f.pipeline.drain();
    const a = second.resource.id;
    expect(() => f.db.prepare('INSERT INTO passage_results VALUES (?,?,?,?,?,?)').run(f.handle.passageId, a, 'a'.repeat(64), randomUUID(), '{}', Date.now())).toThrow(/FOREIGN KEY/);
    expect(() => f.db.prepare(`INSERT INTO resources(id,attempt_id,passage_id,kind,reference,owned,launch_state,created_at_ms)
      VALUES (?,?,?,'terminal','cross-linked',0,'planned',?)`).run(randomUUID(), a, f.handle.passageId, Date.now())).toThrow(/FOREIGN KEY/);
    const secondBinding = f.persistence.getPassage({ passageId: f.storage.getAttempt(a).passageId }).binding;
    expect(() => f.db.prepare(`INSERT INTO passages(id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,state,tracking_state,created_at_ms)
      VALUES (?,?,1,?,'reviewer',?,'cross-linked','starting','pending',?)`).run(randomUUID(), f.status.id, secondBinding.deliveryVersion, JSON.stringify(f.roles[1]), Date.now())).toThrow(/FOREIGN KEY/);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('private adapter with real SQL persistence', () => {
  it('sends ACK only after SQL commits, keeps invalid/failed payload corrigible, and returns the same receipt on repeat', async () => {
    const f = await attemptFixture(); fixtures.push(f);
    const workspaceId = randomUUID(); const anchorId = randomUUID(); let callbacks!: ChannelCallbacks;
    const frames: unknown[] = []; const recruit = vi.fn(async () => {});
    const adapter = createMaestriOmp({ dataDirectory: f.directory, persistence: f.persistence,
      host: { maestriExecutable: 'C:\\tools\\maestri.exe', ompExecutable: 'C:\\tools\\omp.exe', powershellExecutable: 'C:\\tools\\powershell.exe',
        inheritedEnvironment: { MAESTRI_PIPE: 'fixture-only', MAESTRI_WORKSPACE_ID: workspaceId, MAESTRI_TERMINAL_ID: anchorId } } }, loadRoleResources(), {
      native: { validate: async () => ({ anchor: { workspaceId, terminalId: anchorId }, ompVersion: '18.11.1' }), recruit, stop: async () => 'uncertain' },
      bootstrap: async () => ({ path: 'fixture-only', removeSecret: async () => {} }),
      channel: async cb => {
        callbacks = cb;
        return { port: 1, token: 'x'.repeat(43), close: async () => {}, send: async frame => {
          if (typeof frame === 'object' && frame && 'receiptId' in frame) {
            expect(f.db.prepare('SELECT receipt_id FROM passage_results WHERE receipt_id=?').get(frame.receiptId)).toEqual({ receipt_id: frame.receiptId });
            expect(f.db.prepare('SELECT count(*) AS n FROM criterion_results').get()).toEqual({ n: 2 });
          }
          frames.push(frame);
        } };
      },
    });
    vi.mocked(f.execution.startPassage).mockImplementation((request, signal) => adapter.startPassage(request, signal));
    try {
      const c = await f.prepare(); const operation = await f.pipeline.startAttempt(c.body, c.context);
      await vi.waitFor(() => expect(recruit).toHaveBeenCalledTimes(1));
      const status = f.storage.getAttempt(operation.resource.id); const request = vi.mocked(f.execution.startPassage).mock.calls[0]![0];
      expect(f.persistence.getResult({ passageId: status.passageId })).toBeNull();
      await callbacks.hello({ type: 'hello', protocolVersion: 1, token: 'x'.repeat(43), sessionId: randomUUID(), terminalId: randomUUID(), workspaceId,
        cwd: request.cwd, provider: 'provider', model: 'model', effort: 'high', tui: true, roleDigest: request.roleResource.sha256, ompVersion: '18.11.1' });
      await callbacks.frame({ type: 'task-submitted' }); await f.pipeline.drain();
      const result = { formatVersion: 1, summary: 'Resultado oficial 😀', writesStopped: true,
        criteria: request.criterionIds.map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed'] })), checks: [] };
      const call = async (payload: unknown) => { await callbacks.frame({ type: 'call', id: randomUUID(), tool: 'execution_complete', payload }); return frames.at(-1); };
      expect(await call({ summary: 'Turn ended' })).toMatchObject({ ok: false, code: 'RESULT_INVALID' });
      f.db.exec("CREATE TRIGGER fail_result BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'fixture'); END");
      expect(await call(result)).toMatchObject({ ok: false, code: 'STORAGE_FAILED' });
      expect(f.persistence.getResult({ passageId: status.passageId })).toBeNull(); f.db.exec('DROP TRIGGER fail_result');
      const ack = await call(result); expect(ack).toMatchObject({ ok: true, receiptId: expect.any(String) });
      expect(await call(result)).toMatchObject({ ok: true, receiptId: (ack as { receiptId: string }).receiptId });
      expect(f.db.prepare('SELECT count(*) AS n FROM passage_results').get()).toEqual({ n: 1 });
    } finally { await adapter.close(); }
  });
});
