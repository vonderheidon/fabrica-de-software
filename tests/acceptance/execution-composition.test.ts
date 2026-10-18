import { randomUUID, createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import type { ImplementerResult } from '#contracts';
import { attemptFixture } from '../fixtures/attempt.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import type { Execution, ExecutionPersistence, PassageRecord, RoleResourceReference } from '../../apps/controller/src/modules/execution/index.js';
import { createQueries } from '../../apps/controller/src/modules/queries/index.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error('TEST_JSON_REQUIRED'); return encoded;
}
const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

/** Deliberately local test implementation; it launches no terminal and promises no production executor. */
function contractExecutor(port: ExecutionPersistence, roles: RoleResourceReference[]): Execution {
  const start: Execution['startPassage'] = async request => {
    const record: PassageRecord = { handle: { passageId: request.binding.passageId }, binding: request.binding, requestHash: fingerprint(request),
      state: 'starting', roleResource: request.roleResource, terminalName: port.getPassage({ passageId: request.binding.passageId }).terminalName, diagnostic: null, effectiveProfile: null, executorVersion: null };
    port.reserve(record);
    port.confirmReady(record.handle, request.profile, 'contract-test');
    return port.getPassage(record.handle);
  };
  return {
    getCatalog: async () => ({ state: 'unavailable', observed_at_ms: 1,
      diagnostics: [{ code: 'OMP_CATALOG_UNAVAILABLE', message: 'Controlled catalog unavailable.', recovery: 'No catalog call is required by this acceptance.' }] }),
    roleResources: () => structuredClone(roles), preflight: async () => ({ ready: true, code: null, ompVersion: 'contract-test' }), observeVersions: async () => [],
    startPassage: start,
    continuePassage: async () => { throw new Error('TEST_CONTINUATION_UNSUPPORTED'); },
    observe: (handle, cursor = 0) => port.observe(handle, cursor, 100), getResult: handle => port.getResult(handle),
    answerQuestion: async (handle, questionId, answer, operationId) => {
      const record = port.recordAnswer(handle, questionId, answer, operationId);
      if (!port.claimAnswer(handle, operationId)) return record;
      return port.confirmAnswer(handle, operationId, 'delivered');
    },
    cancelAttempt: async (attemptId, operationId) => port.recordCancellation(attemptId, operationId).map(handle => {
      const receipt = { passageId: handle.passageId, state: 'confirmed' as const }; port.recordStop(handle, receipt); return receipt;
    }),
    interactionSurface: handle => ({ kind: 'terminal', reference: `contract:${handle.passageId}`, available: false, reason: 'TEST_HAS_NO_TERMINAL', open: null }),
    close: async () => {},
  };
}

it('composes a test execution implementation with real SQL and unchanged query DTOs, including commit-before-receipt and revocation', async () => {
  const f = await attemptFixture(); let pipeline: ReturnType<typeof createPipeline> | undefined;
  try {
    await f.pipeline.close();
    const execution = contractExecutor(f.storage.executionPersistence(), f.roles);
    // The captured tool observation must match the test executor, rather than impersonating native OMP.
    const tools = f.tools.map(t => t.tool === 'omp' ? { ...t, version: 'contract-test' } : t);
    pipeline = createPipeline({ ...f.dependencies, execution, observeTools: async () => structuredClone(tools) });
    const prepared = await f.prepare(); const operation = await pipeline.startAttempt(prepared.body, prepared.context); await pipeline.drain();
    const status = f.storage.getAttempt(operation.resource.id); const handle = { passageId: status.passageId };
    expect(f.storage.getOperation(operation.operation_id)?.resource.id).toBe(status.id);
    expect(execution.observe(handle).some(e => e.type === 'passage-ready')).toBe(true);
    const passage = f.persistence.getPassage(handle); expect(passage.effectiveProfile).toMatchObject({ name: f.profile.name, provider: f.profile.provider, model: f.profile.model, effort: f.profile.effort });
    const content = { formatVersion: 1 as const, decision: 'Choose one', context: 'Contract test decision', alternatives: ['Continue', 'Stop'] };
    const question = f.persistence.raiseQuestion({ binding: passage.binding, question: content, sha256: fingerprint(content) });
    const answerId = randomUUID();
    await pipeline.answerQuestion({ attemptId: status.id, questionId: question.questionId, operationId: answerId,
      expectedRevision: f.storage.getQuestion(status.id, question.questionId).etag, body: { answer: 'Continue' } });
    await pipeline.drain();
    expect(f.storage.getQuestion(status.id, question.questionId).view.state).toBe('delivered');
    const result: ImplementerResult = { formatVersion: 1, writesStopped: true, summary: 'Contract implementation', checks: [],
      criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Controlled contract proof'] })) };
    const input = { binding: passage.binding, result, sha256: fingerprint(result) };
    const accepted = f.persistence.acceptResult(input);
    expect(execution.getResult(handle)).toEqual(accepted);
    expect(f.persistence.acceptResult(input).receiptId).toBe(accepted.receiptId);
    const queries = createQueries(f.storage);
    expect(queries.getAttempt(status.id, {}).id).toBe(status.id);
    await pipeline.cancelAttempt(status.id, {}, { operationId: randomUUID(), expectedRevision: undefined }); await pipeline.drain();
    expect(queries.getAttempt(status.id, {}).result).toBe('cancelled');
    expect(execution.getResult(handle)?.receiptId).toBe(accepted.receiptId);
    expect(execution.interactionSurface(handle)).toMatchObject({ available: false, open: null });
  } finally { await pipeline?.close(); await f.close(); }
});
