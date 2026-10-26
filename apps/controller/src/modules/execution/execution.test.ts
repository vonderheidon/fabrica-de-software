import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptSessionIdentity, ExecutionEvent, ExecutionHost, ExecutionPersistence, PassageRecord, QuestionRecord, ResultRecord, AnswerRecord, PassageRequest } from './index.js';
import { createExecution, ExecutionError } from './index.js';
import { digest, loadRoleResources } from './roles.js';
import { createMaestriOmp } from './adapters/maestri-omp/adapter.js';
import { createNative, inheritedAnchor, launchCommand, type CliRunner } from './adapters/maestri-omp/native.js';
import { buildOmpArguments } from './adapters/maestri-omp/bootstrap.js';
import { connectWire, executionLimits, JsonLines } from './adapters/maestri-omp/wire.js';
import type { ChannelCallbacks, Hello } from './adapters/maestri-omp/channel.js';

/** Volatile fixture only. Production must supply domain transactions, never this implementation. */
function fixtureStore() {
  const records = new Map<string, PassageRecord>();
  const results = new Map<string, ResultRecord>();
  const questions = new Map<string, QuestionRecord>();
  const answers = new Map<string, AnswerRecord>();
  const sessionRows = new Map<string, AttemptSessionIdentity>();
  const events: ExecutionEvent[] = [];
  const store: ExecutionPersistence = {
    claimAnswer: () => true,
    getAttemptSession: (handle, binding) => {
      const passage = records.get(handle.passageId);
      const sessionBinding = passage?.binding ?? binding;
      if (!sessionBinding) throw new Error('NOT_FOUND');
      let session = sessionRows.get(sessionBinding.attemptId);
      if (!session) {
        const managedTerminalId = randomUUID();
        session = { id: randomUUID(), attemptId: sessionBinding.attemptId, role: sessionBinding.role, managedTerminalId,
          terminalName: `factory-${managedTerminalId}`, terminalId: null, workspaceId: null, generation: 1, terminalState: 'planned',
          state: 'reserved', ompSessionId: null, sessionDirectoryRelative: `work/${sessionBinding.attemptId}/sessions/${sessionBinding.role}` };
        sessionRows.set(sessionBinding.attemptId, session);
      }
      return structuredClone(session);
    },
    allocateTerminal: (handle, binding) => {
      const session = store.getAttemptSession(handle, binding);
      const managedTerminalId = randomUUID();
      const replacement: AttemptSessionIdentity = { ...session, managedTerminalId, terminalName: `factory-${managedTerminalId}`,
        terminalId: null, workspaceId: null, generation: 1, terminalState: 'planned', state: 'reserved', ompSessionId: null };
      sessionRows.set(replacement.attemptId, replacement);
      return structuredClone(replacement);
    },
    confirmTerminal: vi.fn((handle, observation) => {
      const passage = records.get(handle.passageId); if (!passage) return;
      const session = sessionRows.get(passage.binding.attemptId); if (!session) return;
      Object.assign(session, { terminalId: observation.terminalId, workspaceId: observation.workspaceId, ompSessionId: observation.ompSessionId,
        terminalState: 'occupied' as const, state: 'active' as const });
    }),
    claimContinuation: vi.fn(), releaseOccupancy: vi.fn(),
    reserve: input => {
      const prior = records.get(input.handle.passageId);
      if (prior && prior.requestHash !== input.requestHash) throw new ExecutionError('RESULT_CONFLICT');
      if (prior) return { created: false, record: structuredClone(prior) };
      records.set(input.handle.passageId, structuredClone(input));
      return { created: true, record: input };
    },
    getPassage: h => { const r = records.get(h.passageId); if (!r) throw new Error('NOT_FOUND'); return structuredClone(r); },
    record: (h, state, diagnostic, type) => { const r = store.getPassage(h); records.set(h.passageId, { ...r, state, diagnostic }); events.push({ sequence: events.length + 1, type, code: diagnostic }); },
    confirmReady: (h, effectiveProfile, executorVersion) => { store.record(h, 'ready', null, 'passage-ready'); records.set(h.passageId, { ...store.getPassage(h), effectiveProfile, executorVersion }); },
    observe: (_h, after, limit) => events.filter(e => e.sequence > after).slice(0, limit),
    acceptResult: input => {
      const prior = results.get(input.binding.passageId);
      if (prior && prior.sha256 !== input.sha256) throw new ExecutionError('RESULT_CONFLICT');
      if (prior) return prior;
      const result = { ...input, receiptId: randomUUID() }; results.set(input.binding.passageId, result);
      const session = sessionRows.get(input.binding.attemptId);
      if (session) Object.assign(session, { state: 'completed', terminalState: 'available' });
      return result;
    },
    getResult: h => results.get(h.passageId) ?? null,
    raiseQuestion: input => {
      const prior = [...questions.values()].find(q => q.binding.passageId === input.binding.passageId && q.sha256 === input.sha256);
      if (prior) return prior;
      const result = { ...input, questionId: randomUUID() }; questions.set(result.questionId, result); return result;
    },
    recordAnswer: (h, questionId, answer, operationId) => {
      if (questions.get(questionId)?.binding.passageId !== h.passageId) throw new ExecutionError('ANSWER_CONFLICT');
      const prior = answers.get(operationId);
      if (prior && (prior.questionId !== questionId || prior.answer !== answer)) throw new ExecutionError('ANSWER_CONFLICT');
      if (prior) return prior;
      const result: AnswerRecord = { operationId, questionId, answer, state: 'recorded' }; answers.set(operationId, result); return result;
    },
    confirmAnswer: (_h, operationId, state) => { const r = answers.get(operationId); if (!r) throw new Error('NOT_FOUND'); const result = { ...r, state }; answers.set(operationId, result); return result; },
    recordCancellation: attemptId => {
      const own = [...records.values()].filter(r => r.binding.attemptId === attemptId);
      for (const r of own) store.record(r.handle, 'cancelled', 'CANCELLED', 'tracking-lost');
      return own.map(r => r.handle);
    },
    recordStop: vi.fn(),
  };
  return { store, records, results, questions, answers, sessionRows };
}
const anchorId = randomUUID();
const workspaceId = randomUUID();
const confirmStoppedTerminal = vi.fn(async () => true);
const host: ExecutionHost = {
  maestriExecutable: 'C:\\Ferramentas ç\\maestri.exe', ompExecutable: 'C:\\Ferramentas ç\\omp.exe',
  powershellExecutable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  inheritedEnvironment: { MAESTRI_PIPE: '\\\\.\\pipe\\test-only', MAESTRI_TERMINAL_ID: anchorId, MAESTRI_WORKSPACE_ID: workspaceId },
  confirmStoppedTerminal,
};
const payload = () => ({ formatVersion: 1 as const, summary: 'Implementação concluída 😀', writesStopped: true as const,
  additionalChangesJustification: null,
  criteria: [{ criterionId: 'ac-1', verdict: 'passed' as const, evidence: ['Teste observado'] }], checks: [] });
function fixture(role: 'implementer' | 'reviewer' = 'implementer', effort: string | null = 'high', ompVersion = '18.11.1') {
  confirmStoppedTerminal.mockReset(); confirmStoppedTerminal.mockResolvedValue(true);
  const journal = fixtureStore();
  const resources = loadRoleResources();
  const request: PassageRequest = {
    binding: { attemptId: randomUUID(), passageId: randomUUID(), role, round: 1, deliveryVersion: randomUUID() },
    profile: { name: 'Exact', executor: 'maestri-omp', provider: 'provider', model: 'model', effort, guidance: 'Orientação real' },
    cwd: 'C:\\Projetos ç\\tentativa 😀', task: 'Tarefa '.repeat(20000), criterionIds: ['ac-1'], previousFindingKeys: [], gitNexusRequired: true,
    roleResource: resources.get(role)!.reference,
  };
  let callbacks: ChannelCallbacks | undefined;
  const frames: unknown[] = [];
  const close = vi.fn(async () => {});
  const removed = vi.fn(async () => {});
  const openExistingTerminal = vi.fn(async () => {});
  const runtime = {
    getCatalog: vi.fn(async () => ({ state: 'unavailable' as const, observed_at_ms: 1,
      diagnostics: [{ code: 'OMP_CATALOG_UNAVAILABLE', message: 'Controlled catalog unavailable.', recovery: 'Configure a catalog fixture.' }] })),
    validate: vi.fn(async () => ({ anchor: { terminalId: anchorId, workspaceId }, ompVersion })),
    recruit: vi.fn(async () => {}), stop: vi.fn(async (): Promise<'confirmed' | 'uncertain'> => 'uncertain'),
  };
  const execution = createMaestriOmp({ dataDirectory: 'C:\\Dados', host: { ...host, openExistingTerminal }, persistence: journal.store, validateReviewerResult: async () => {} }, resources, {
    native: runtime,
    channel: async value => { callbacks = value; return { port: 12345, token: 'x'.repeat(43), send: async frame => { frames.push(frame); }, close }; },
    bootstrap: async () => ({ path: 'C:\\Dados ç\\launch.json', removeSecret: removed }),
  });
  const hello: Hello = { type: 'hello', protocolVersion: 1, token: 'x'.repeat(43),
    sessionId: randomUUID(), terminalId: randomUUID(), workspaceId, cwd: request.cwd,
    provider: 'provider', model: 'model', effort, tui: true, roleDigest: request.roleResource.sha256, ompVersion };
  const waitLaunch = async () => { await vi.waitFor(() => expect(runtime.recruit).toHaveBeenCalledTimes(1)); };
  const start = async () => { const promise = execution.startPassage(request); await waitLaunch(); await callbacks!.hello(hello); await callbacks!.frame({ type: 'task-submitted' }); return promise; };
  const call = async (tool: string, value: unknown, extra = {}) => {
    await callbacks!.frame({ type: 'call', id: randomUUID(), tool, payload: value, ...extra }); return frames.at(-1);
  };
  return { ...journal, execution, request, runtime, hello, frames, removed, close, openExistingTerminal, confirmStoppedTerminal, start, waitLaunch, call, callbacks: () => callbacks! };
}

describe('distributed role contracts', () => {
  it.each(['confirmed', 'uncertain'] as const)('preserves readiness rejection and withholds task authorization with physical stop=%s', async state => {
    const f = fixture();
    f.store.confirmReady = () => { throw new ExecutionError('PROFILE_MISMATCH'); };
    f.runtime.stop.mockResolvedValue(state);
    const pending = f.execution.startPassage(f.request); await f.waitLaunch(); await f.callbacks().hello(f.hello);
    await expect(f.callbacks().frame({ type: 'task-submitted' })).rejects.toThrow('PROFILE_MISMATCH');
    f.callbacks().lost('PROFILE_MISMATCH');
    const record = await pending;
    expect(record).toMatchObject({ state: 'partial', diagnostic: 'PROFILE_MISMATCH' });
    expect(f.frames).not.toContainEqual({ type: 'task-authorized' });
    await vi.waitFor(() => expect(f.store.recordStop).toHaveBeenCalledWith(record.handle,
      { passageId: record.handle.passageId, state }));
    expect(f.runtime.stop).toHaveBeenCalledOnce();
    await f.execution.close();
  });
  it('stops a late recruitment after startup tracking has already failed without recruiting again', async () => {
    const f = fixture(); let finishLaunch!: () => void;
    f.runtime.recruit.mockImplementation(() => new Promise<void>(resolve => { finishLaunch = resolve; }));
    f.runtime.stop.mockResolvedValue('confirmed');
    const pending = f.execution.startPassage(f.request); await f.waitLaunch();
    f.callbacks().lost('TRACKING_LOST');
    const record = await pending;
    expect(record).toMatchObject({ state: 'partial', diagnostic: 'TRACKING_LOST' });
    expect(f.runtime.stop).not.toHaveBeenCalled();
    expect(f.store.recordStop).toHaveBeenCalledWith(record.handle, { passageId: record.handle.passageId, state: 'requested' });
    finishLaunch();
    await vi.waitFor(() => expect(f.store.recordStop).toHaveBeenCalledWith(record.handle,
      { passageId: record.handle.passageId, state: 'confirmed' }));
    expect(f.runtime.recruit).toHaveBeenCalledOnce();
    expect(f.frames).not.toContainEqual({ type: 'task-authorized' });
    await f.execution.close();
  });
  it('observes a Maestri build hash as its version without recruiting a terminal', async () => {
    const runCli = vi.fn(async () => ({ exitCode: 0, stdout: '97e32e94\n', stderr: '' }));
    const execution = createMaestriOmp({ dataDirectory: 'C:\\Dados', host, persistence: fixtureStore().store }, loadRoleResources(), {
      native: fixture().runtime, runCli,
    });
    expect(await execution.observeVersions()).toContainEqual(expect.objectContaining({ tool: 'maestri', state: 'observed', version: '97e32e94', cause: null }));
    expect(runCli).toHaveBeenCalledOnce();
    await execution.close();
  });
  it('loads both exact schemas and stable file digests without personal skills', () => {
    const roles = loadRoleResources();
    expect([...roles.keys()]).toEqual(['implementer', 'reviewer']);
    expect(roles.get('implementer')?.reference.path).toBe('resources/roles/implementer.v1.json');
    expect(roles.get('reviewer')?.reference.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => loadRoleResources('missing-role-directory')).toThrow('RESOURCE_INVALID');
  });
});

describe('shutdown coordination', () => {
  it.each([false, true])('preserves an approved reviewer result on close with physical handoff=%s', async handedOff => {
    const f = fixture('reviewer'); await f.start();
    await f.call('execution_complete', { formatVersion: 1, summary: 'Approved version', verdict: 'approved',
      criteria: f.request.criterionIds.map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed version'] })),
      assessments: [], disputeResponses: [], commandRepetitions: [], findings: [], resolutions: [] });
    const handle = { passageId: f.request.binding.passageId };
    const receipt = f.execution.getResult(handle);
    if (handedOff) {
      f.runtime.stop.mockResolvedValue('confirmed');
      const pending = f.execution.preparePassageHandoff(handle);
      await vi.waitFor(() => expect(f.frames.at(-1)).toMatchObject({ type: 'continuation-check' }));
      await f.callbacks().frame({ type: 'continuation-idle', passageId: handle.passageId });
      await pending;
    }
    await f.execution.close();
    expect(f.execution.getResult(handle)).toEqual(receipt);
    expect(f.store.getPassage(handle)).toMatchObject(handedOff ? { state: 'ready', diagnostic: null } : { state: 'interrupted', diagnostic: 'TRACKING_LOST' });
    if (handedOff) expect(f.store.recordStop).toHaveBeenCalledWith(handle, { passageId: handle.passageId, state: 'confirmed' });
    else expect(f.store.recordStop).toHaveBeenCalledWith(handle, { passageId: handle.passageId, state: 'uncertain' });
  });
  it('persists physical stop before closing the native owner during shutdown', async () => {
    const f = fixture('reviewer'); await f.start();
    f.runtime.stop.mockResolvedValue('confirmed');
    await f.execution.close();
    expect(f.store.recordStop).toHaveBeenCalledWith({ passageId: f.request.binding.passageId },
      { passageId: f.request.binding.passageId, state: 'confirmed' });
    expect(f.runtime.stop.mock.invocationCallOrder[0]).toBeLessThan(f.close.mock.invocationCallOrder[0]!);
  });
  it.each([true, false])('reconciles only a physically confirmed terminal: %s', async confirmed => {
    const f = fixture('reviewer'); await f.start();
    vi.mocked(f.store.recordStop).mockClear();
    f.confirmStoppedTerminal.mockResolvedValue(confirmed);
    const restarted = createMaestriOmp({ dataDirectory: 'C:\\Dados', host, persistence: f.store }, loadRoleResources());
    expect(await restarted.reconcilePassageStop!({ passageId: f.request.binding.passageId })).toBe(confirmed);
    expect(f.store.recordStop).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    expect(f.runtime.stop).not.toHaveBeenCalled();
    await f.execution.close();
    await restarted.close();
  });
  it('settles answer waits without replay and shares an idempotent close promise', async () => {
    const f = fixture(); const ready = await f.start();
    const question = await f.call('execution_question', { formatVersion: 1, decision: 'Escolha?', context: 'Contexto 😀', alternatives: ['Manter', 'Alterar'] });
    const questionId = (question as { questionId: string }).questionId;
    const answering = f.execution.answerQuestion(ready.handle, questionId, 'Manter', randomUUID());
    const first = f.execution.close(); const second = f.execution.close();
    expect(second).toBe(first); await first;
    expect((await answering).state).toBe('delivery_unknown');
    expect(f.store.getPassage(ready.handle).diagnostic).toBe('TRACKING_LOST');
    expect(f.runtime.recruit).toHaveBeenCalledOnce();
    expect(f.execution.interactionSurface(ready.handle).available).toBe(false);
  });
  it('removes the bootstrap even when closing a channel fails, with a sanitized error', async () => {
    const f = fixture(); await f.start(); f.removed.mockClear();
    f.close.mockRejectedValue(new Error('Synthetic private runtime detail'));
    await expect(f.execution.close()).rejects.toThrow('TRACKING_LOST');
    expect(f.removed).toHaveBeenCalledOnce();
    expect(f.store.getPassage({ passageId: f.request.binding.passageId }).state).toBe('interrupted');
  });
});

describe('correction in the same tracked session', () => {
  it.each(['role','attempt','session'] as const)('refuses a %s binding that does not belong to the live conversation', async kind => {
    const f = fixture(); await f.start(); await f.call('execution_complete', payload());
    const binding = { ...f.request.binding, passageId: randomUUID(), round: 2, deliveryVersion: randomUUID(),
      ...(kind === 'role' ? { role: 'reviewer' as const } : {}), ...(kind === 'attempt' ? { attemptId: randomUUID() } : {}) };
    if (kind === 'session') {
      const original = f.store.getAttemptSession;
      vi.spyOn(f.store, 'getAttemptSession').mockImplementation((handle, value) => {
        const session = original(handle, value);
        return handle.passageId === binding.passageId ? { ...session, id: randomUUID() } : session;
      });
    }
    const { cwd: _cwd, ...input } = { ...f.request, binding };
    await expect(f.execution.continuePassage({ passageId: f.request.binding.passageId }, input)).rejects.toThrow('TRACKING_LOST');
    expect(f.runtime.recruit).toHaveBeenCalledOnce();
    expect(f.frames.some(frame => frame && typeof frame === 'object' && 'type' in frame && frame.type === 'continuation')).toBe(false);
    await f.execution.close();
  });
  it('rejects a new OMP conversation instead of silently accepting it as reviewer continuation', async () => {
    const f = fixture('reviewer'); await f.start();
    await f.call('execution_complete', { formatVersion: 1, summary: 'Review', verdict: 'rejected',
      criteria: [{ criterionId: 'ac-1', verdict: 'failed', evidence: ['Observed'] }], assessments: [], disputeResponses: [], commandRepetitions: [], findings: [], resolutions: [] });
    f.runtime.stop.mockResolvedValue('confirmed');
    const source = { passageId: f.request.binding.passageId };
    const preparing = f.execution.preparePassageHandoff(source);
    await vi.waitFor(() => expect(f.frames.at(-1)).toMatchObject({ type: 'continuation-check' }));
    await f.callbacks().frame({ type: 'continuation-idle', passageId: source.passageId }); await preparing;
    const request = { ...f.request,
      binding: { ...f.request.binding, passageId: randomUUID(), round: 2, deliveryVersion: randomUUID() } };
    const pending = f.execution.continuePassage(source, request);
    const assertion = expect(pending).rejects.toThrow('TRACKING_LOST');
    await vi.waitFor(() => expect(f.runtime.recruit).toHaveBeenCalledTimes(2));
    await expect(f.callbacks().hello({ ...f.hello, cwd: request.cwd, sessionId: randomUUID() })).rejects.toThrow('TRACKING_LOST');
    f.callbacks().lost('TRACKING_LOST'); await assertion;
    expect(f.store.getPassage({ passageId: request.binding.passageId }).state).not.toBe('ready');
    expect(f.store.getResult(source)).not.toBeNull();
    await f.execution.close();
  });
  it('quiesces a reviewer before resuming the exact OMP session in the same attempt checkout', async () => {
    const f = fixture('reviewer'); await f.start();
    const result = { formatVersion: 1, summary: 'Review rejected', verdict: 'rejected',
      criteria: [{ criterionId: 'ac-1', verdict: 'failed', evidence: ['Version one'] }], assessments: [], disputeResponses: [], commandRepetitions: [], findings: [], resolutions: [] };
    await f.call('execution_complete', result);
    f.runtime.stop.mockResolvedValue('confirmed');
    const source = { passageId: f.request.binding.passageId };
    const preparation = f.execution.preparePassageHandoff(source);
    await vi.waitFor(() => expect(f.frames.at(-1)).toMatchObject({ type: 'continuation-check', passageId: source.passageId }));
    expect(f.runtime.stop).not.toHaveBeenCalled();
    await f.callbacks().frame({ type: 'continuation-idle', passageId: source.passageId });
    await preparation;
    expect(f.runtime.stop).toHaveBeenCalledOnce();
    const next = { ...f.request,
      binding: { ...f.request.binding, passageId: randomUUID(), round: 2, deliveryVersion: randomUUID() } };
    const continuation = f.execution.continuePassage(source, next);
    await vi.waitFor(() => expect(f.runtime.recruit).toHaveBeenCalledTimes(2));
    await f.callbacks().hello({ ...f.hello, cwd: next.cwd });
    await f.callbacks().frame({ type: 'task-submitted' });
    expect((await continuation).binding).toEqual(next.binding);
    expect(f.store.getAttemptSession({ passageId: next.binding.passageId }).ompSessionId).toBe(f.hello.sessionId);
    expect(f.store.getResult(source)?.binding).toEqual(f.request.binding);
    await f.execution.close();
  });
  it('never resumes a reviewer when physical stop is uncertain', async () => {
    const f = fixture('reviewer'); await f.start();
    await f.call('execution_complete', { formatVersion: 1, summary: 'Review', verdict: 'rejected',
      criteria: [{ criterionId: 'ac-1', verdict: 'failed', evidence: ['Observed'] }], assessments: [], disputeResponses: [], commandRepetitions: [], findings: [], resolutions: [] });
    const pending = f.execution.preparePassageHandoff({ passageId: f.request.binding.passageId });
    const assertion = expect(pending).rejects.toThrow('TRACKING_LOST');
    await vi.waitFor(() => expect(f.frames.at(-1)).toMatchObject({ type: 'continuation-check' }));
    await f.callbacks().frame({ type: 'continuation-idle', passageId: f.request.binding.passageId });
    await assertion;
    expect(f.runtime.recruit).toHaveBeenCalledOnce();
    expect(f.store.getPassage({ passageId: f.request.binding.passageId }).state).toBe('interrupted');
    await f.execution.close();
  });
  it('waits beyond the RPC timeout for finalization before stopping and handing off', async () => {
    const f = fixture(); await f.start(); await f.call('execution_complete', payload());
    f.runtime.stop.mockResolvedValue('confirmed');
    vi.useFakeTimers();
    try {
      const source = { passageId: f.request.binding.passageId };
      let completed = false;
      const preparing = f.execution.preparePassageHandoff(source).then(() => { completed = true; });
      const assertion = expect(preparing).resolves.toBeUndefined();
      await vi.advanceTimersByTimeAsync(executionLimits.requestMs + 1_000);
      expect(completed).toBe(false);
      expect(f.runtime.stop).not.toHaveBeenCalled();
      expect(f.store.getPassage(source).state).toBe('ready');
      await f.callbacks().frame({ type: 'continuation-idle', passageId: source.passageId });
      await assertion;
      expect(f.runtime.stop).toHaveBeenCalledOnce();
      expect(f.store.getResult(source)).not.toBeNull();
    } finally { vi.useRealTimers(); await f.execution.close(); }
  });
  it('rejects finalization wait on actual channel loss while preserving the accepted result', async () => {
    const f = fixture(); await f.start(); await f.call('execution_complete', payload());
    const source = { passageId: f.request.binding.passageId };
    const preparing = f.execution.preparePassageHandoff(source);
    const assertion = expect(preparing).rejects.toThrow('TRACKING_LOST');
    f.callbacks().lost('CHANNEL_EOF');
    await assertion;
    expect(f.store.getResult(source)).not.toBeNull();
    expect(f.store.getPassage(source).state).toBe('interrupted');
    await f.execution.close();
  });
  it('rebinds a new passage only after continuation ACK, without another recruit', async () => {
    const f = fixture(); await f.start(); await f.call('execution_complete', payload());
    const next = { ...f.request, binding: { ...f.request.binding, passageId: randomUUID(), round: 2, deliveryVersion: randomUUID() }, task: 'Structured correction context' };
    const { cwd: _cwd, ...input } = next;
    const continuing = f.execution.continuePassage({ passageId: f.request.binding.passageId }, input);
    await vi.waitFor(() => expect(f.frames.at(-1)).toMatchObject({ type: 'continuation', passageId: next.binding.passageId, task: next.task }));
    expect(f.store.getPassage({ passageId: next.binding.passageId }).state).toBe('starting');
    await f.callbacks().frame({ type: 'continuation-receipt', passageId: next.binding.passageId });
    expect((await continuing).state).toBe('ready'); expect(f.runtime.recruit).toHaveBeenCalledOnce();
    const raised = await f.call('execution_question', { formatVersion: 1, decision: 'Correction scope?', context: 'Current logical passage', alternatives: ['Keep', 'Change'] });
    const questionId = (raised as { questionId: string }).questionId; const operationId = randomUUID();
    const confirm = vi.spyOn(f.store, 'confirmAnswer');
    const answering = f.execution.answerQuestion({ passageId: next.binding.passageId }, questionId, 'Keep', operationId);
    await f.callbacks().frame({ type: 'answer-receipt', operationId });
    expect((await answering).state).toBe('delivered');
    expect(confirm).toHaveBeenCalledWith({ passageId: next.binding.passageId }, operationId, 'delivered');
    expect(f.questions.get(questionId)?.binding).toEqual(next.binding);
    const corrected = { ...payload(), summary: 'Correction result' };
    await f.call('execution_complete', corrected);
    expect(f.store.getResult({ passageId: next.binding.passageId })?.binding).toEqual(next.binding);
    expect(f.store.getResult({ passageId: f.request.binding.passageId })?.result).toEqual(payload());
    await f.execution.close();
  });
  it('refuses continuation without a live session and never starts a replacement', async () => {
    const f = fixture(); await f.start(); await f.call('execution_complete', payload());
    f.callbacks().lost('TRACKING_LOST');
    const { cwd: _cwd, ...input } = { ...f.request, binding: { ...f.request.binding, passageId: randomUUID(), round: 2, deliveryVersion: randomUUID() } };
    await expect(f.execution.continuePassage({ passageId: f.request.binding.passageId }, input)).rejects.toThrow('TRACKING_LOST');
    expect(f.runtime.recruit).toHaveBeenCalledOnce(); await f.execution.close();
  });
  it('keeps an uncertain continuation interrupted and refuses a second send', async () => {
    const f = fixture(); await f.start(); await f.call('execution_complete', payload());
    const { cwd: _cwd, ...input } = { ...f.request, binding: { ...f.request.binding, passageId: randomUUID(), round: 2, deliveryVersion: randomUUID() } };
    vi.useFakeTimers();
    try {
      const pending = f.execution.continuePassage({ passageId: f.request.binding.passageId }, input);
      const assertion = expect(pending).rejects.toThrow('TRACKING_LOST');
      await vi.advanceTimersByTimeAsync(executionLimits.requestMs + 1); await assertion;
      expect(f.store.getPassage({ passageId: input.binding.passageId }).state).toBe('interrupted');
      await expect(f.execution.continuePassage({ passageId: input.binding.passageId }, { ...input, binding: { ...input.binding, round: 3 } })).rejects.toThrow();
      expect(f.runtime.recruit).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); await f.execution.close(); }
  });
});
describe('private UTF-8 framing', () => {
  it('preserves Portuguese and emoji split at every byte and separates frames', () => {
    const decoder = new JsonLines();
    const bytes = Buffer.from(JSON.stringify({ text: 'Ação, revisão 😀🧪' }) + '\n' + JSON.stringify({ done: true }) + '\n');
    const frames = [...bytes].flatMap(b => decoder.feed(Buffer.from([b])));
    expect(frames).toEqual([{ text: 'Ação, revisão 😀🧪' }, { done: true }]); decoder.end();
  });
  it.each([Buffer.from('{oops}\n'), Buffer.from([0x22, 0xc3, 0x22, 10])])('rejects malformed JSON and UTF-8', bytes => {
    expect(() => new JsonLines().feed(bytes)).toThrow('FRAME_INVALID');
  });
  it('bounds frames, queue, chunks and incomplete EOF', () => {
    expect(() => new JsonLines().feed(Buffer.alloc(executionLimits.frameBytes + 1, 65))).toThrow('FRAME_OVERSIZE');
    expect(() => new JsonLines().feed(Buffer.from('{}\n'.repeat(17)))).toThrow('FRAME_OVERSIZE');
    expect(() => new JsonLines().feed(Buffer.alloc(executionLimits.socketBufferBytes + 1))).toThrow('FRAME_OVERSIZE');
    const decoder = new JsonLines(); decoder.feed(Buffer.from('{')); expect(() => decoder.end()).toThrow('CHANNEL_EOF');
  });
  it('closes an actual wire callback with a finite diagnostic on EOF', () => {
    const socket = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> };
    socket.destroy = vi.fn(); socket.pause = vi.fn(); socket.resume = vi.fn();
    const lost = vi.fn(); connectWire(socket as unknown as Socket, async () => {}, lost);
    socket.emit('end'); expect(lost).toHaveBeenCalledExactlyOnceWith('CHANNEL_EOF'); expect(socket.destroy).toHaveBeenCalledOnce();
    socket.emit('close'); expect(lost).toHaveBeenCalledOnce();
  });
});
describe('native Maestri and Windows launch', () => {
  it('stops only a privately owned pending launch before terminal handshake', async () => {
    const run = vi.fn<CliRunner>(async () => ({ exitCode: 0, stdout: '' })); const name = `factory-${randomUUID()}`;
    const stopPendingTerminal = vi.fn(async () => true);
    const native = createNative({ ...host, stopPendingTerminal }, 'C:\\Data', run);
    expect(await native.stop(name)).toBe('confirmed');
    expect(stopPendingTerminal).toHaveBeenCalledExactlyOnceWith({ workspaceId, terminalName: name });
    stopPendingTerminal.mockResolvedValue(false);
    expect(await native.stop(name)).toBe('uncertain');
    stopPendingTerminal.mockResolvedValue(true);
    expect(await native.stop(name, { workspaceId, terminalId: randomUUID() }, 2)).toBe('confirmed');
    expect(stopPendingTerminal).toHaveBeenLastCalledWith({ workspaceId, terminalName: name, generation: 2 });
    await expect(native.stop('manual')).rejects.toThrow('RESOURCE_INVALID');
    expect(stopPendingTerminal).toHaveBeenCalledTimes(3); expect(run).not.toHaveBeenCalled();
  });
  it('requires trusted observed termination to confirm stop and never accepts an arbitrary process target', async () => {
    const run = vi.fn<CliRunner>(async () => ({ exitCode: 0, stdout: '' })); const name = `factory-${randomUUID()}`;
    expect(await createNative(host, 'C:\\Data', run).stop(name)).toBe('uncertain');
    expect(run).not.toHaveBeenCalled();
    const confirmStoppedTerminal = vi.fn(async () => true); const identity = { workspaceId, terminalId: randomUUID() };
    const stopTerminal = vi.fn(async () => {});
    expect(await createNative({ ...host, confirmStoppedTerminal, stopTerminal }, 'C:\\Data', run).stop(name, identity)).toBe('confirmed');
    expect(stopTerminal).toHaveBeenCalledExactlyOnceWith({ workspaceId: workspaceId.toLowerCase(), terminalName: name, terminalId: identity.terminalId });
    expect(run).not.toHaveBeenCalled();
    expect(confirmStoppedTerminal).toHaveBeenCalledExactlyOnceWith({ workspaceId: workspaceId.toLowerCase(), terminalName: name, terminalId: identity.terminalId });
    confirmStoppedTerminal.mockResolvedValue(false);
    expect(await createNative({ ...host, confirmStoppedTerminal }, 'C:\\Data', run).stop(name)).toBe('uncertain');
    const count = run.mock.calls.length;
    await expect(createNative(host, 'C:\\Data', run).stop('manual-terminal')).rejects.toMatchObject({ code: 'RESOURCE_INVALID' });
    expect(run.mock.calls.length).toBe(count);
  });
  it('preserves the terminal when native stop is unavailable, rejected or unconfirmed', async () => {
    const run = vi.fn<CliRunner>(async () => ({ exitCode: 0, stdout: '' }));
    const name = `factory-${randomUUID()}`; const identity = { workspaceId, terminalId: randomUUID() };
    const confirmStoppedTerminal = vi.fn(async () => true);
    expect(await createNative({ ...host, confirmStoppedTerminal }, 'C:\\Data', run).stop(name, identity)).toBe('uncertain');
    expect(confirmStoppedTerminal).not.toHaveBeenCalled();
    const stopTerminal = vi.fn<NonNullable<ExecutionHost['stopTerminal']>>(async () => { throw new Error('stop rejected'); });
    expect(await createNative({ ...host, confirmStoppedTerminal, stopTerminal }, 'C:\\Data', run).stop(name, identity)).toBe('uncertain');
    expect(confirmStoppedTerminal).not.toHaveBeenCalled();
    stopTerminal.mockImplementation(async () => {}); confirmStoppedTerminal.mockResolvedValue(false);
    expect(await createNative({ ...host, confirmStoppedTerminal, stopTerminal }, 'C:\\Data', run).stop(name, identity)).toBe('uncertain');
    expect(await createNative({ ...host, confirmStoppedTerminal, stopTerminal }, 'C:\\Data', run).stop(name, { ...identity, workspaceId: randomUUID() })).toBe('uncertain');
    expect(stopTerminal).toHaveBeenCalledTimes(2);
    expect(run).not.toHaveBeenCalled();
  });
  it('diagnoses missing and stale inherited context without launching', async () => {
    const execution = createExecution({ dataDirectory: 'C:\\Data', persistence: fixtureStore().store });
    expect(await execution.preflight()).toEqual({ ready: false, code: 'CONTEXT_MISSING', ompVersion: null });
    expect(() => inheritedAnchor(undefined)).toThrow('CONTEXT_MISSING');
    const run: CliRunner = vi.fn(async () => ({ exitCode: 1, stdout: '' }));
    await expect(createNative(host, 'C:\\Data', run).validate()).rejects.toThrow('CONTEXT_STALE');
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('uses only supported queries and exact argv/cwd/env; validates version without provider', async () => {
    const run = vi.fn<CliRunner>(async (_exe, args) => ({ exitCode: 0, stdout: args[0] === 'list' ? 'You: Anchor\nConnected agents:' : args[0] === 'recruit' ? '--command --dir' : 'omp/19.2.0-beta.1\n' }));
    expect((await createNative(host, 'C:\\Dados ç', run).validate()).ompVersion).toBe('19.2.0-beta.1');
    expect(run.mock.calls.map(c => c[1])).toEqual([['list'], ['recruit', '--help'], ['--version']]);
    expect(run.mock.calls.every(c => c[2] === 'C:\\Dados ç' && c[3] === host.inheritedEnvironment)).toBe(true);
  });
  it.each(['17.10.4', '20.0.0-rc.2'])('accepts OMP %s when the concrete Maestri capabilities are present', async version => {
    const run = vi.fn<CliRunner>(async (_exe, args) => ({ exitCode: 0,
      stdout: args[0] === 'list' ? 'You: Anchor\nConnected agents:' : args[0] === 'recruit' ? '--command --dir' : `omp/${version}` }));
    expect((await createNative(host, 'C:\\Dados ç', run).validate()).ompVersion).toBe(version);
  });
  it('reads the exact selectable chat catalog without refresh or terminal recruitment', async () => {
    const catalog = { models: [
      { provider: 'provider-a', kind: 'chat', id: 'reasoning', selector: 'provider-a/reasoning', name: 'Reasoning model', thinking: ['low', 'high'] },
      { provider: 'provider-b', kind: 'chat', id: 'plain', selector: 'provider-b/plain', name: 'Plain model', thinking: null },
    ] };
    const run = vi.fn<CliRunner>(async (_exe, args) => args[0] === '--version'
      ? { exitCode: 0, stdout: 'omp/99.0.0-local' }
      : { exitCode: 0, stdout: JSON.stringify(catalog) });
    const result = await createNative(host, 'C:\\Dados ç', run).getCatalog();
    expect(result).toMatchObject({ state: 'loaded', executor: 'maestri-omp', executor_version: '99.0.0-local', models: [
      { provider: 'provider-a', provider_name: 'provider-a', model: 'reasoning', model_name: 'Reasoning model', efforts: ['low', 'high'] },
      { provider: 'provider-b', provider_name: 'provider-b', model: 'plain', model_name: 'Plain model', efforts: [] },
    ] });
    expect(run.mock.calls.map(call => call[1])).toEqual([['--version'], ['models', '--json']]);
  });
  it.each([
    ['empty', JSON.stringify({ models: [] }), 'OMP_CATALOG_EMPTY'],
    ['malformed', '{invalid', 'OMP_CATALOG_INVALID'],
    ['partial row', JSON.stringify({ models: [{ provider: 'provider', kind: 'chat', id: 'model', selector: 'provider/model', name: 'Model' }] }), 'OMP_CATALOG_INVALID'],
    ['duplicate row', JSON.stringify({ models: [
      { provider: 'provider', kind: 'chat', id: 'model', selector: 'provider/model', name: 'Model', thinking: null },
      { provider: 'provider', kind: 'chat', id: 'model', selector: 'provider/model', name: 'Model', thinking: null },
    ] }), 'OMP_CATALOG_INVALID'],
  ])('marks %s catalogs unavailable instead of publishing a partial list', async (_name, stdout, code) => {
    const run = vi.fn<CliRunner>(async (_exe, args) => args[0] === '--version'
      ? { exitCode: 0, stdout: 'omp/18.11.2' } : { exitCode: 0, stdout });
    expect(await createNative(host, 'C:\\Dados ç', run).getCatalog()).toMatchObject({ state: 'unavailable', diagnostics: [{ code }] });
  });
  it('does not infer an empty catalog when the installed CLI cannot confirm the JSON surface', async () => {
    const run = vi.fn<CliRunner>(async (_exe, args) => args[0] === '--version'
      ? { exitCode: 0, stdout: 'omp/21.0.0' } : { exitCode: 2, stdout: 'Synthetic untrusted runtime output' });
    const result = await createNative(host, 'C:\\Dados ç', run).getCatalog();
    expect(result).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'OMP_CATALOG_UNSUPPORTED' }] });
    expect(JSON.stringify(result)).not.toContain('Synthetic untrusted runtime output');
    const missingVersion = vi.fn<CliRunner>(async () => ({ exitCode: 0, stdout: '' }));
    expect(await createNative(host, 'C:\\Dados ç', missingVersion).getCatalog())
      .toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'OMP_VERSION_UNAVAILABLE' }] });
    expect(missingVersion.mock.calls).toHaveLength(1);
  });
  it('uses a per-attempt OMP session directory and omits thinking only when no effort applies', () => {
    const f = fixture();
    expect(buildOmpArguments(f.request, 'extension.js', 'C:\\factory\\attempt-a\\sessions\\implementer')).toEqual([
      '--provider', 'provider', '--model', 'model', '--thinking', 'high', '--session-dir', 'C:\\factory\\attempt-a\\sessions\\implementer', '--extension', 'extension.js',
    ]);
    expect(buildOmpArguments({ ...f.request, profile: { ...f.request.profile, effort: null } }, 'extension.js', 'C:\\factory\\attempt-b\\sessions\\implementer'))
      .toEqual(['--provider', 'provider', '--model', 'model', '--session-dir', 'C:\\factory\\attempt-b\\sessions\\implementer', '--extension', 'extension.js']);
    expect(buildOmpArguments({ ...f.request, binding: { ...f.request.binding, role: 'reviewer', round: 2 } }, 'extension.js', 'C:\\factory\\attempt-b\\sessions\\reviewer'))
      .toContain('--continue');
  });
  it('encodes only a bootstrap path and preserves Unicode, quotes and spaces', () => {
    const own = "C:\\Dados ç 😀\\O'Brien\\launch.json";
    const command = launchCommand(host.powershellExecutable, own);
    expect(command).toMatch(/^& '/);
    expect(launchCommand("C:\\O'Brien\\pwsh.exe", own)).toMatch(/^& 'C:\\O''Brien\\pwsh.exe' -NoLogo /);
    const script = Buffer.from(command.split(' ').at(-1)!, 'base64').toString('utf16le');
    expect(script).toContain("C:\\Dados ç 😀\\O''Brien\\launch.json");
    expect(script).toContain('[System.Text.Encoding]::UTF8');
    expect(script).toContain('& $launch.ompExecutable @($launch.args)');
    expect(script).not.toContain('--no-tools'); expect(command).not.toContain('token');
  });
});
describe('passage coordination under controlled native dependencies', () => {
  it('accepts a confirmed terminal generation in another attempt without adopting its old conversation', async () => {
    const f = fixture(); await f.start(); await f.call('execution_complete', payload());
    const old = f.store.getAttemptSession({ passageId: f.request.binding.passageId });
    const request = { ...f.request, binding: { ...f.request.binding, attemptId: randomUUID(), passageId: randomUUID(), deliveryVersion: randomUUID() } };
    f.sessionRows.set(request.binding.attemptId, { ...old, id: randomUUID(), attemptId: request.binding.attemptId, state: 'reserved', terminalState: 'available', ompSessionId: null, generation: old.generation + 1 });
    const pending = f.execution.startPassage(request);
    await vi.waitFor(() => expect(f.runtime.recruit).toHaveBeenCalledTimes(2));
    await f.callbacks().hello({ ...f.hello, sessionId: randomUUID() });
    await f.callbacks().frame({ type: 'task-submitted' });
    expect((await pending).state).toBe('ready');
    await f.execution.close();
  });
  it('blocks launch when a managed terminal cannot be confirmed instead of allocating a substitute', async () => {
    const f = fixture(); const handle = { passageId: f.request.binding.passageId };
    const session = f.store.getAttemptSession(handle, f.request.binding);
    f.sessionRows.set(f.request.binding.attemptId, { ...session, terminalId: randomUUID(), workspaceId, ompSessionId: null,
      terminalState: 'available', state: 'reserved', generation: 2 });
    const priorTerminalId = f.store.getAttemptSession(handle, f.request.binding).managedTerminalId;
    f.confirmStoppedTerminal.mockResolvedValue(false);
    await expect(f.execution.startPassage(f.request)).rejects.toMatchObject({ code: 'TRACKING_LOST' });
    expect(f.store.getAttemptSession(handle, f.request.binding).managedTerminalId).toBe(priorTerminalId);
    expect(f.runtime.recruit).not.toHaveBeenCalled();
    expect(f.confirmStoppedTerminal).toHaveBeenCalledOnce();
  });
  it('reuses only the confirmed factory terminal and starts a distinct OMP session', async () => {
    const f = fixture(); const handle = { passageId: f.request.binding.passageId };
    const session = f.store.getAttemptSession(handle, f.request.binding);
    const previousOmpSessionId = randomUUID(); const physicalTerminalId = randomUUID();
    const managed = { ...session, terminalId: physicalTerminalId, workspaceId, ompSessionId: null,
      terminalState: 'available' as const, state: 'reserved' as const, generation: 2 };
    f.sessionRows.set(f.request.binding.attemptId, managed);
    f.hello.terminalId = physicalTerminalId;
    const started = await f.start();
    expect(started.state).toBe('ready');
    expect(f.confirmStoppedTerminal).toHaveBeenCalledTimes(2); // Rechecked immediately before --replace.
    expect(f.runtime.recruit).toHaveBeenCalledWith(managed.terminalName, f.request.cwd, expect.any(String), true);
    expect(f.hello.sessionId).not.toBe(previousOmpSessionId);
  });
  it('confirms a version without an effort and retains both facts exactly', async () => {
    const f = fixture('implementer', null, '19.0.0'); const ready = await f.start();
    expect(ready.state).toBe('ready'); expect(ready.effectiveProfile?.effort).toBeNull(); expect(ready.executorVersion).toBe('19.0.0');
    expect(f.hello.effort).toBeNull(); await f.execution.close();
  });
  it('rejects an OMP default effort when the captured profile has none', async () => {
    const f = fixture('implementer', null, '19.0.0'); const pending = f.execution.startPassage(f.request); await f.waitLaunch();
    await expect(f.callbacks().hello({ ...f.hello, effort: 'low' })).rejects.toThrow();
    f.callbacks().lost('PROFILE_MISMATCH');
    expect((await pending).state).toBe('partial'); expect(f.store.getPassage({ passageId: f.request.binding.passageId }).effectiveProfile).toBeNull();
    await f.execution.close();
  });
  it('returns ready only after the effective handshake and task submission, deduplicates launch and opens the same session', async () => {
    const f = fixture(); const pending = f.execution.startPassage(f.request); await f.waitLaunch();
    expect(f.store.getPassage({ passageId: f.request.binding.passageId }).state).toBe('starting');
    await f.callbacks().hello(f.hello);
    expect(f.removed).toHaveBeenCalledOnce();
    expect(f.store.getPassage({ passageId: f.request.binding.passageId }).state).toBe('starting');
    await f.callbacks().frame({ type: 'task-submitted' });
    const ready = await pending; expect(ready.state).toBe('ready');
    expect(ready.effectiveProfile).toEqual(f.request.profile); expect(ready.executorVersion).toBe('18.11.1');
    await f.execution.startPassage(f.request); expect(f.runtime.recruit).toHaveBeenCalledOnce();
    expect(f.frames).toEqual([{ type: 'run' }, { type: 'task-authorized' }]);
    await f.execution.interactionSurface(ready.handle).open?.();
    expect(f.openExistingTerminal).toHaveBeenCalledWith({ terminalId: f.hello.terminalId, workspaceId });
    await f.execution.close(); expect(f.store.getPassage(ready.handle).state).toBe('interrupted');
  });
  it('refuses profile fallback, mismatched version digest and anchor adoption', async () => {
    for (const patch of [{ model: 'fallback' }, { roleDigest: '0'.repeat(64) }, { terminalId: anchorId }]) {
      const f = fixture(); const pending = f.execution.startPassage(f.request); await f.waitLaunch();
      await expect(f.callbacks().hello({ ...f.hello, ...patch })).rejects.toThrow();
      f.callbacks().lost('PROFILE_MISMATCH');
      expect((await pending).state).toBe('partial'); expect(f.frames).toHaveLength(0); await f.execution.close();
    }
  });
  it('injects all private identities, allows corrected payloads, retains result before consumer and deduplicates complete', async () => {
    const f = fixture(); const ready = await f.start();
    expect(await f.call('execution_complete', { ...payload(), passageId: randomUUID() })).toMatchObject({ ok: false, code: 'RESULT_INVALID' });
    expect(f.execution.getResult(ready.handle)).toBeNull();
    expect(await f.call('execution_complete', { ...payload(), criteria: [] })).toMatchObject({ ok: false });
    const receipt = await f.call('execution_complete', payload());
    expect(receipt).toMatchObject({ ok: true });
    expect(f.execution.getResult(ready.handle)?.binding).toEqual(f.request.binding);
    expect(await f.call('execution_complete', payload())).toMatchObject({ ok: true, receiptId: (receipt as { receiptId: string }).receiptId });
    expect(await f.call('execution_complete', { ...payload(), summary: 'different' })).toMatchObject({ ok: false, code: 'RESULT_CONFLICT' });
    expect(f.execution.interactionSurface(ready.handle).available).toBe(true);
    expect(f.store.getPassage(ready.handle).state).toBe('ready'); await f.execution.close();
  });
  it('never acknowledges a storage failure and permits a retry in the same TUI', async () => {
    const f = fixture(); await f.start(); const accept = f.store.acceptResult;
    f.store.acceptResult = () => { throw new Error('secret native database error'); };
    expect(await f.call('execution_complete', payload())).toMatchObject({ ok: false, code: 'STORAGE_FAILED' });
    expect(JSON.stringify(f.frames)).not.toContain('secret'); expect(f.results.size).toBe(0);
    f.store.acceptResult = accept;
    expect(await f.call('execution_complete', payload())).toMatchObject({ ok: true }); await f.execution.close();
  });
  it('requires exact review coverage, finding identity and prior resolution, rejects inconsistent approval', async () => {
    const f = fixture('reviewer'); f.request.previousFindingKeys = ['F-1']; await f.start();
    const review = { formatVersion: 1, summary: 'Revisão', verdict: 'approved', criteria: payload().criteria, assessments: [], disputeResponses: [], commandRepetitions: [], findings: [], resolutions: [] };
    expect(await f.call('execution_complete', review)).toMatchObject({ ok: false });
    expect(await f.call('execution_complete', { ...review, resolutions: [{ findingKey: 'F-1', verdict: 'unresolved', evidence: ['still present'] }] })).toMatchObject({ ok: false });
    expect(await f.call('execution_complete', { ...review, resolutions: [{ findingKey: 'F-1', verdict: 'resolved', evidence: ['observed'] }] })).toMatchObject({ ok: true }); await f.execution.close();
  });
  it('persists a correlated question, records an answer before send, and confirms only its receipt', async () => {
    const f = fixture(); const ready = await f.start();
    const response = await f.call('execution_question', { formatVersion: 1, decision: 'Escolha de escopo?', context: 'Contexto 😀', alternatives: ['A', 'B'] });
    const questionId = (response as { questionId: string }).questionId;
    expect(f.questions.get(questionId)?.binding).toEqual(f.request.binding);
    const operationId = randomUUID(); const promise = f.execution.answerQuestion(ready.handle, questionId, 'Opção B ç', operationId);
    expect(f.answers.get(operationId)?.state).toBe('recorded');
    expect(f.frames.at(-1)).toEqual({ type: 'answer', questionId, operationId, answer: 'Opção B ç' });
    await f.callbacks().frame({ type: 'answer-receipt', operationId });
    expect((await promise).state).toBe('delivered');
    const before = f.frames.length; await f.execution.answerQuestion(ready.handle, questionId, 'Opção B ç', operationId); expect(f.frames).toHaveLength(before);
    await f.execution.close();
  });
  it('closes answer waits on channel EOF and reports delivery_unknown without replay', async () => {
    const f = fixture(); const ready = await f.start();
    const response = await f.call('execution_question', { formatVersion: 1, decision: 'Escolha?', context: 'Contexto', alternatives: ['A', 'B'] });
    const operationId = randomUUID(); const promise = f.execution.answerQuestion(ready.handle, (response as { questionId: string }).questionId, 'A', operationId);
    f.callbacks().lost('CHANNEL_EOF'); expect((await promise).state).toBe('delivery_unknown');
    expect(f.store.getPassage(ready.handle).state).toBe('interrupted'); await f.execution.close();
  });
  it('keeps a timed out answer unknown, does not resend it and reconciles a late ACK', async () => {
    const f = fixture(); const ready = await f.start();
    const response = await f.call('execution_question', { formatVersion: 1, decision: 'Choose?', context: 'Context', alternatives: ['A', 'B'] });
    const questionId = (response as { questionId: string }).questionId; const operationId = randomUUID();
    vi.useFakeTimers();
    try {
      const waiting = f.execution.answerQuestion(ready.handle, questionId, 'A', operationId);
      await vi.advanceTimersByTimeAsync(executionLimits.requestMs + 1);
      expect((await waiting).state).toBe('delivery_unknown'); const frames = f.frames.length;
      expect((await f.execution.answerQuestion(ready.handle, questionId, 'A', operationId)).state).toBe('delivery_unknown');
      expect(f.frames).toHaveLength(frames);
      await f.callbacks().frame({ type: 'answer-receipt', operationId });
      expect(f.answers.get(operationId)?.state).toBe('delivered'); expect(f.runtime.recruit).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); await f.execution.close(); }
  });
  it('preserves an identifiable partial launch and never recruits again after lost response', async () => {
    const f = fixture(); f.runtime.recruit.mockRejectedValue(new Error('native secret detail'));
    const record = await f.execution.startPassage(f.request);
    expect(record).toMatchObject({ state: 'partial', diagnostic: 'LAUNCH_UNCERTAIN', terminalName: `factory-${f.request.binding.passageId}` });
    await f.execution.startPassage(f.request); expect(f.runtime.recruit).toHaveBeenCalledOnce();
    expect(JSON.stringify(record)).not.toContain('secret'); await f.execution.close();
  });
  it('tracks cancellation during pending creation and stops only that owned terminal when creation returns', async () => {
    const f = fixture(); let returned: () => void = () => {};
    f.runtime.recruit.mockImplementation(() => new Promise<void>(resolve => { returned = resolve; }));
    const promise = f.execution.startPassage(f.request); await f.waitLaunch();
    const receipts = await f.execution.cancelAttempt(f.request.binding.attemptId, randomUUID());
    expect(receipts[0]?.state).toBe('requested'); expect((await promise).state).toBe('cancelled');
    expect(f.runtime.stop).not.toHaveBeenCalled(); returned();
    await vi.waitFor(() => expect(f.runtime.stop).toHaveBeenCalledExactlyOnceWith(f.store.getAttemptSession({ passageId: f.request.binding.passageId }).terminalName, undefined, 1));
    expect(f.store.recordStop).toHaveBeenLastCalledWith({ passageId: f.request.binding.passageId }, { passageId: f.request.binding.passageId, state: 'uncertain' }); await f.execution.close();
  });
  it('shares one physical stop request across concurrent cancellations of a ready terminal', async () => {
    const f = fixture(); await f.start(); let release!: () => void;
    const stopped = new Promise<void>(r => { release = r; });
    f.runtime.stop.mockImplementation(async () => { await stopped; return 'uncertain'; });
    const one = f.execution.cancelAttempt(f.request.binding.attemptId, randomUUID());
    const two = f.execution.cancelAttempt(f.request.binding.attemptId, randomUUID());
    await vi.waitFor(() => expect(f.runtime.stop).toHaveBeenCalledExactlyOnceWith(f.store.getAttemptSession({ passageId: f.request.binding.passageId }).terminalName,
      { workspaceId: f.hello.workspaceId, terminalId: f.hello.terminalId }, 1));
    release(); expect((await one)[0]?.state).toBe('uncertain'); expect((await two)[0]?.state).toBe('uncertain');
    await f.execution.cancelAttempt(f.request.binding.attemptId, randomUUID()); expect(f.runtime.stop).toHaveBeenCalledTimes(1);
    expect(f.execution.interactionSurface({ passageId: f.request.binding.passageId }).available).toBe(false);
    await f.execution.close();
  });
  it('closes a lost channel and refuses further result authority without replacing its session', async () => {
    const f = fixture(); await f.start(); await f.call('execution_complete', payload()); const receipt = f.execution.getResult({ passageId: f.request.binding.passageId });
    f.callbacks().lost('TRACKING_LOST');
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.execution.getResult({ passageId: f.request.binding.passageId })).toEqual(receipt);
    await expect(f.call('execution_complete', payload())).rejects.toMatchObject({ code: 'FRAME_INVALID' });
    expect(f.runtime.recruit).toHaveBeenCalledTimes(1); await f.execution.close();
  });
  it('requests stop on startup signal abort even when recruit already returned before handshake', async () => {
    const f = fixture(); const signal = new AbortController();
    const pending = f.execution.startPassage(f.request, signal.signal); await f.waitLaunch();
    await Promise.resolve(); signal.abort();
    expect((await pending).state).toBe('cancelled');
    expect(f.runtime.stop).toHaveBeenCalledExactlyOnceWith(f.store.getAttemptSession({ passageId: f.request.binding.passageId }).terminalName, undefined, 1);
    expect(f.frames).toHaveLength(0); await f.execution.close();
  });
  it('finishes a missing handshake with a finite diagnostic and releases the channel', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); const pending = f.execution.startPassage(f.request);
      await f.waitLaunch(); await vi.advanceTimersByTimeAsync(executionLimits.handshakeMs);
      expect(await pending).toMatchObject({ state: 'partial', diagnostic: 'HANDSHAKE_TIMEOUT' });
      expect(f.close).toHaveBeenCalled(); expect(f.removed).toHaveBeenCalled();
      await f.execution.close();
    } finally { vi.useRealTimers(); }
  });
  it('rejects conflicting re-submission without another task and marks stored sessions interrupted after restart', async () => {
    const f = fixture(); const record = await f.start();
    await expect(f.execution.startPassage({ ...f.request, task: 'another task' })).rejects.toThrow('RESULT_CONFLICT');
    expect(f.runtime.recruit).toHaveBeenCalledOnce();
    const second = createMaestriOmp({ dataDirectory: 'C:\\Data', host, persistence: f.store }, loadRoleResources(), { native: f.runtime });
    await expect(second.startPassage(f.request)).rejects.toThrow('TRACKING_LOST');
    expect(second.interactionSurface(record.handle).available).toBe(false); await f.execution.close(); await second.close();
  });
  it('does not mask a failure to persist ready as a ready receipt', async () => {
    const f = fixture(); const promise = f.execution.startPassage(f.request); await f.waitLaunch(); await f.callbacks().hello(f.hello);
    const original = f.store.record; f.store.record = () => { throw new Error('storage failure'); };
    await expect(f.callbacks().frame({ type: 'task-submitted' })).rejects.toThrow('STORAGE_FAILED');
    f.callbacks().lost('STORAGE_FAILED'); await expect(promise).rejects.toThrow('STORAGE_FAILED');
    f.store.record = original; await expect(f.execution.close()).rejects.toThrow('STORAGE_FAILED');
  });
  it('uses canonical result hashes independent of property ordering', () => {
    expect(digest({ a: 1, b: 'ç' })).toBe(digest({ b: 'ç', a: 1 }));
  });
});
