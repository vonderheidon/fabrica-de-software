import { Type } from '@sinclair/typebox';
import { Value, ValueErrorType } from '@sinclair/typebox/value';
import { ExecutionQuestion, OperationId, PassageRequest, type PassageResult, type PassageRole } from '#contracts';
import type { AnswerRecord, Execution, ExecutionOptions, PassageHandle, PassageRecord, StopReceipt } from '../../index.js';
import { ExecutionError, type ExecutionCode } from '../../errors.js';
import { canonical, digest, resultSchemaFor, type RoleResource } from '../../roles.js';
import { createNative, launchCommand, runCli } from './native.js';
import type { ToolObservation } from '#contracts';
import { openChannel, type ChannelFactory, type Hello, type PassageChannel } from './channel.js';
import { writeBootstrap, type Bootstrap, type BootstrapWriter } from './bootstrap.js';
import { executionLimits } from './wire.js';
import { observeTerminalAvailability } from '../../terminal-observation.js';

const Call = Type.Object({
  type: Type.Literal('call'), id: OperationId,
  tool: Type.Union([Type.Literal('execution_complete'), Type.Literal('execution_question')]), payload: Type.Unknown(),
}, { additionalProperties: false });
const AnswerReceipt = Type.Object({ type: Type.Literal('answer-receipt'), operationId: OperationId }, { additionalProperties: false });
const Submitted = Type.Object({ type: Type.Literal('task-submitted') }, { additionalProperties: false });
const Lost = Type.Object({ type: Type.Literal('tracking-lost') }, { additionalProperties: false });
type Native = ReturnType<typeof createNative>;
const profileValue = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;
export interface AdapterDependencies { native?: Native; channel?: ChannelFactory; bootstrap?: BootstrapWriter; runCli?: typeof runCli }
interface ResultValidationIssue { path: string; rule: string }
class ResultValidationError extends ExecutionError {
  constructor(readonly issues: readonly ResultValidationIssue[]) { super('RESULT_INVALID'); }
}
interface LivePassage {
  handoff?: boolean;
  idle?: { resolve: () => void; reject: () => void } | undefined;
  continuation: { resolve: (record: PassageRecord) => void; reject: () => void } | undefined;
  request: PassageRequest; channel: PassageChannel | undefined; bootstrap: Bootstrap | undefined;
  native: Native; session: Hello | undefined; cancelled: boolean; revoked: boolean; stopped: boolean;
  terminalGeneration: number;
  launchPending: boolean; launchIssued: boolean; storageFailed: boolean;
  stopResult?: Promise<StopReceipt>;
  ready: () => void; failed: (code: ExecutionCode) => void;
  answers: Map<string, { resolve: (receipt: AnswerRecord) => void; reject: () => void }>;
}
const codeOf = (error: unknown, fallback: ExecutionCode): ExecutionCode => error instanceof ExecutionError ? error.code : fallback;

function validateResult(request: PassageRequest, payload: unknown): PassageResult {
  const schema = resultSchemaFor(request.binding.role);
  if (!Value.Check(schema, payload)) {
    const issues: ResultValidationIssue[] = [];
    for (const error of Value.Errors(schema, payload)) {
      if (issues.length === 8) break;
      issues.push({ path: error.path || '/', rule: ValueErrorType[error.type] ?? 'SchemaValidation' });
    }
    throw new ResultValidationError(issues.length ? issues : [{ path: '/', rule: 'SchemaValidation' }]);
  }
  const issues: ResultValidationIssue[] = [];
  const ids = payload.criteria.map(c => c.criterionId);
  if (new Set(ids).size !== ids.length) issues.push({ path: '/criteria', rule: 'criterion_ids_must_be_unique' });
  if (canonical([...ids].sort()) !== canonical([...request.criterionIds].sort())) issues.push({ path: '/criteria', rule: 'must_match_captured_criterion_ids' });
  if ('findings' in payload) {
    payload.findings.forEach((finding, index) => {
      if (finding.priority === undefined) issues.push({ path: `/findings/${index}/priority`, rule: 'required' });
    });
    const keys = payload.findings.map(f => f.key);
    const resolutions = payload.resolutions.map(f => f.findingKey);
    if (new Set(keys).size !== keys.length) issues.push({ path: '/findings', rule: 'finding_keys_must_be_unique' });
    if (new Set(resolutions).size !== resolutions.length) issues.push({ path: '/resolutions', rule: 'finding_keys_must_be_unique' });
    if (canonical([...resolutions].sort()) !== canonical([...request.previousFindingKeys].sort())) {
      issues.push({ path: '/resolutions', rule: 'must_match_prior_finding_keys' });
    }
    payload.findings.forEach((finding, index) => {
      if (finding.criterionIds.some(id => !request.criterionIds.includes(id))) {
        issues.push({ path: `/findings/${index}/criterionIds`, rule: 'must_use_captured_criterion_ids' });
      }
    });
    if (payload.verdict === 'approved') {
      payload.criteria.forEach((criterion, index) => {
        if (criterion.verdict !== 'passed') issues.push({ path: `/criteria/${index}/verdict`, rule: 'must_be_passed_for_approval' });
      });
      payload.findings.forEach((finding, index) => {
        if (finding.blocking) issues.push({ path: `/findings/${index}/blocking`, rule: 'must_not_be_blocking_for_approval' });
      });
      const blockingKeys = request.previousBlockingFindingKeys ?? request.previousFindingKeys;
      payload.resolutions.forEach((resolution, index) => {
        if (resolution.verdict !== 'resolved' && blockingKeys.includes(resolution.findingKey)) {
          issues.push({ path: `/resolutions/${index}/verdict`, rule: 'prior_blocking_findings_must_be_resolved' });
        }
      });
    }
  } else if (new Set(payload.checks.map(c => c.id)).size !== payload.checks.length) {
    issues.push({ path: '/checks', rule: 'check_ids_must_be_unique' });
  }
  if (issues.length) throw new ResultValidationError(issues.slice(0, 8));
  return payload;
}

export function createMaestriOmp(options: ExecutionOptions, roles: Map<PassageRole, RoleResource>, dependencies: AdapterDependencies = {}): Execution {
  const store = options.persistence;
  const live = new Map<string, LivePassage>();
  const starts = new Map<string, { hash: string; promise: Promise<PassageRecord> }>();
  let closed = false;
  let closing: Promise<void> | undefined;
  let resolvingHost: Promise<void> | undefined;
  const ensureHost = async () => {
    if (options.host || !options.resolveHost || closed) return;
    resolvingHost ??= options.resolveHost().then(host => { if (!closed && host) options.host = host; }).finally(() => { resolvingHost = undefined; });
    await resolvingHost;
  };
  const native = async () => {
    await ensureHost();
    if (dependencies.native) return dependencies.native;
    if (!options.host) throw new ExecutionError('CONTEXT_MISSING');
    return createNative(options.host, options.dataDirectory, dependencies.runCli);
  };
  const handleOf = (passageId: string): PassageHandle => ({ passageId });
  const persistState = (entry: LivePassage, state: PassageRecord['state'], code: ExecutionCode | null, event: Parameters<typeof store.record>[3]) => {
    try { store.record(handleOf(entry.request.binding.passageId), state, code, event); }
    catch { throw new ExecutionError('STORAGE_FAILED'); }
  };
  const interrupt = (entry: LivePassage, code: ExecutionCode) => {
    if (entry.handoff) return;
    entry.revoked = true;
    entry.idle?.reject(); entry.idle = undefined;
    entry.continuation?.reject(); entry.continuation = undefined;
    entry.failed(code);
    for (const pending of entry.answers.values()) pending.reject();
    entry.answers.clear();
    if (!closed) {
      void entry.channel?.close().catch(() => { entry.storageFailed = true; });
      void stop(entry).catch(() => { entry.storageFailed = true; });
    }
  };
  const stop = async (entry: LivePassage): Promise<StopReceipt> => {
    const passageId = entry.request.binding.passageId;
    if (entry.launchPending) {
      const receipt: StopReceipt = { passageId, state: 'requested' };
      store.recordStop(handleOf(passageId), receipt);
      return receipt;
    }
    if (entry.stopResult) return entry.stopResult;
    entry.stopped = true;
    entry.stopResult = (async () => {
      let state: StopReceipt['state'] = entry.launchIssued ? 'uncertain' : 'confirmed';
      if (entry.launchIssued) {
        try {
          const session = store.getAttemptSession(handleOf(passageId));
          state = await entry.native.stop(session.terminalName, session.terminalId && session.workspaceId
            ? { terminalId: session.terminalId, workspaceId: session.workspaceId } : undefined, entry.terminalGeneration);
        }
        catch { state = 'uncertain'; }
      }
      const receipt = { passageId, state };
      store.recordStop(handleOf(passageId), receipt);
      return receipt;
    })();
    return entry.stopResult;
  };

  const start = async (request: PassageRequest, signal?: AbortSignal, resumedSessionId?: string): Promise<PassageRecord> => {
    await ensureHost();
    const host = options.host;
    if (!host) throw new ExecutionError('CONTEXT_MISSING');
    const runtime = await native();
    const validation = await runtime.validate();
    const role = roles.get(request.binding.role);
    if (!role || canonical(role.reference) !== canonical(request.roleResource)) throw new ExecutionError('RESOURCE_INVALID');
    const terminalName = `factory-${request.binding.passageId}`;
    const initial: PassageRecord = { handle: handleOf(request.binding.passageId), binding: request.binding,
      requestHash: digest(request), state: 'starting', roleResource: role.reference, terminalName, diagnostic: null,
      effectiveProfile: null, executorVersion: null };
    const sessionCandidate = store.getAttemptSession(initial.handle, request.binding);
    if (sessionCandidate.ompSessionId && sessionCandidate.ompSessionId !== resumedSessionId) throw new ExecutionError('TRACKING_LOST');
    let terminalAvailabilityConfirmed = false;
    if (sessionCandidate.terminalState === 'available') {
      if (sessionCandidate.terminalId && sessionCandidate.workspaceId && host.confirmStoppedTerminal) {
        try {
          terminalAvailabilityConfirmed = await host.confirmStoppedTerminal({ workspaceId: sessionCandidate.workspaceId,
            terminalId: sessionCandidate.terminalId, terminalName: sessionCandidate.terminalName, generation: sessionCandidate.generation });
        } catch { terminalAvailabilityConfirmed = false; }
      }
      if (!terminalAvailabilityConfirmed) {
        throw new ExecutionError('TRACKING_LOST');
      }
    }
    const claim = store.reserve(initial, terminalAvailabilityConfirmed);
    if (!claim.created) {
      if (claim.record.state === 'ready' || claim.record.state === 'starting') store.record(initial.handle, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
      return store.getPassage(initial.handle);
    }
    let settled = false;
    let finish: () => void = () => { throw new ExecutionError('HANDSHAKE_TIMEOUT'); };
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const entry: LivePassage = {
      request, native: runtime, channel: undefined, bootstrap: undefined, session: undefined, continuation: undefined,
      cancelled: false, revoked: false, stopped: false, launchPending: false, launchIssued: false, storageFailed: false, answers: new Map(),
      terminalGeneration: sessionCandidate.generation,
      ready: () => {
        if (settled) return;
        try { store.confirmReady(initial.handle, request.profile, validation.ompVersion); }
        catch (error) { throw new ExecutionError(codeOf(error, 'STORAGE_FAILED')); }
        settled = true; clearTimeout(timer); finish();
      },
      failed: (code) => {
        try {
          const current = store.getPassage(handleOf(entry.request.binding.passageId));
          if (!['cancelled', 'interrupted', 'partial'].includes(current.state)) persistState(entry, code === 'CANCELLED' ? 'cancelled' : settled ? 'interrupted' : 'partial', code, 'tracking-lost');
        } catch { entry.storageFailed = true; }
        finally { settled = true; clearTimeout(timer); finish(); }
      },
    };
    live.set(request.binding.passageId, entry);
    const abort = () => {
      entry.cancelled = true; interrupt(entry, 'CANCELLED');
      void entry.channel?.close().catch(() => { entry.storageFailed = true; });
      if (entry.launchIssued && !entry.launchPending) void stop(entry).catch(() => { entry.storageFailed = true; });
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted || closed) { abort(); return store.getPassage(initial.handle); }
      const channel = await (dependencies.channel ?? openChannel)({
        hello: async (hello) => {
          if (entry.cancelled || settled) throw new ExecutionError('TRACKING_LOST');
          if (hello.provider !== request.profile.provider || hello.model !== request.profile.model || hello.effort !== request.profile.effort) throw new ExecutionError('PROFILE_MISMATCH');
          if (hello.cwd !== request.cwd || hello.roleDigest !== role.reference.sha256 || hello.workspaceId.toLowerCase() !== validation.anchor.workspaceId ||
            hello.terminalId.toLowerCase() === validation.anchor.terminalId || !Value.Check(OperationId, hello.terminalId.toLowerCase()) || !Value.Check(OperationId, hello.sessionId.toLowerCase())) throw new ExecutionError('TRACKING_LOST');
          if (resumedSessionId && hello.sessionId.toLowerCase() !== resumedSessionId.toLowerCase()) throw new ExecutionError('TRACKING_LOST');
          if ((sessionCandidate.terminalId && hello.terminalId.toLowerCase() !== sessionCandidate.terminalId.toLowerCase()) ||
            (sessionCandidate.workspaceId && hello.workspaceId.toLowerCase() !== sessionCandidate.workspaceId.toLowerCase())) throw new ExecutionError('TRACKING_LOST');
          if ([...live.values()].some(other => {
            if (other === entry || !other.session) return false;
            if (other.session.sessionId.toLowerCase() === hello.sessionId.toLowerCase()) return true;
            if (other.session.terminalId.toLowerCase() !== hello.terminalId.toLowerCase()) return false;
            return !(terminalAvailabilityConfirmed && other.request.binding.attemptId !== request.binding.attemptId && other.terminalGeneration < sessionCandidate.generation);
          })) throw new ExecutionError('TRACKING_LOST');
          store.confirmTerminal(initial.handle, { workspaceId: hello.workspaceId.toLowerCase(), terminalId: hello.terminalId.toLowerCase(), ompSessionId: hello.sessionId.toLowerCase() });
          host.bindTerminalProcess?.({ workspaceId: hello.workspaceId, terminalName: sessionCandidate.terminalName, terminalId: hello.terminalId, generation: sessionCandidate.generation });
          entry.session = hello;
          // The extension read the private bootstrap; revoke that file before authorizing the task.
          await entry.bootstrap?.removeSecret();
          if (entry.cancelled || closed) throw new ExecutionError('CANCELLED');
          await entry.channel?.send({ type: 'run' });
        },
        frame: async (frame) => {
          if (entry.cancelled || closed) throw new ExecutionError('CANCELLED');
          if (Value.Check(Lost, frame)) throw new ExecutionError('TRACKING_LOST');
          if (frame && typeof frame === 'object' && 'type' in frame && frame.type === 'continuation-idle' &&
              'passageId' in frame && frame.passageId === entry.request.binding.passageId && entry.idle) {
            entry.idle.resolve(); entry.idle = undefined; return;
          }
          if (Value.Check(Submitted, frame)) {
            if (!entry.session || settled) throw new ExecutionError('FRAME_INVALID');
            entry.ready();
            // The extension must not invoke the model before readiness is durably accepted.
            await entry.channel?.send({ type: 'task-authorized' });
            return;
          }
          if (frame && typeof frame === 'object' && 'type' in frame && frame.type === 'continuation-receipt' && 'passageId' in frame && frame.passageId === entry.request.binding.passageId && entry.continuation) {
            const h = handleOf(entry.request.binding.passageId);
            store.confirmReady(h, entry.request.profile, validation.ompVersion);
            entry.continuation.resolve(store.getPassage(h)); entry.continuation = undefined; return;
          }
          if (Value.Check(AnswerReceipt, frame)) {
            const pending = entry.answers.get(frame.operationId);
            // A late ACK reconciles an unknown delivery; it never triggers another send.
            try {
              const receipt = store.confirmAnswer(handleOf(entry.request.binding.passageId), frame.operationId, 'delivered');
              pending?.resolve(receipt);
            } catch (error) {
              if (!(error instanceof ExecutionError) || error.code !== 'ANSWER_CONFLICT') throw error;
              // An expired/cancelled question cannot be revived by a late ACK.
              pending?.reject();
            }
            entry.answers.delete(frame.operationId); return;
          }
          const currentHandle = handleOf(entry.request.binding.passageId);
          if (!Value.Check(Call, frame) || store.getPassage(currentHandle).state !== 'ready') throw new ExecutionError('FRAME_INVALID');
          let reply: unknown;
          try {
            if (frame.tool === 'execution_complete') {
              const result = validateResult(entry.request, frame.payload);
              if (!store.getResult(currentHandle)) await options.validatePassageScope?.(entry.request.binding);
              if (entry.request.binding.role === 'reviewer' && !store.getResult(currentHandle)) {
                if (!options.validateReviewerResult) throw new ExecutionError('RESOURCE_INVALID');
                await options.validateReviewerResult(entry.request.binding);
              }
              const record = store.acceptResult({ binding: entry.request.binding, result, sha256: digest(result) });
              reply = { type: 'reply', id: frame.id, ok: true, receiptId: record.receiptId };
            } else {
              if (!Value.Check(ExecutionQuestion, frame.payload)) throw new ExecutionError('RESULT_INVALID');
              const question = store.raiseQuestion({ binding: entry.request.binding, question: frame.payload, sha256: digest(frame.payload) });
              reply = { type: 'reply', id: frame.id, ok: true, questionId: question.questionId };
            }
          } catch (error) {
            const validationIssues = error instanceof ResultValidationError ? error.issues :
              frame.tool === 'execution_complete' && error instanceof ExecutionError && error.code === 'RESULT_INVALID'
                ? [{ path: '/', rule: 'contextual_result_validation' }] : undefined;
            reply = { type: 'reply', id: frame.id, ok: false, code: codeOf(error, 'STORAGE_FAILED'),
              ...(validationIssues ? { validationIssues } : {}) };
          }
          await entry.channel?.send(reply);
        },
        lost: (code) => { interrupt(entry, code); },
      });
      entry.channel = channel;
      entry.bootstrap = await (dependencies.bootstrap ?? writeBootstrap)(options.dataDirectory, request, host, role, channel, validation.ompVersion,
        options.projectStorageRootForAttempt, sessionCandidate.sessionDirectoryRelative);
      if (entry.cancelled || entry.revoked || closed) return store.getPassage(initial.handle);
      if (terminalAvailabilityConfirmed) {
        const stillStopped = await host.confirmStoppedTerminal!({ workspaceId: sessionCandidate.workspaceId!, terminalId: sessionCandidate.terminalId!,
          terminalName: sessionCandidate.terminalName, generation: sessionCandidate.generation });
        if (!stillStopped) {
          store.releaseOccupancy(initial.handle, 'uncertain', 'TERMINAL_AVAILABILITY_CHANGED');
          throw new ExecutionError('TRACKING_LOST');
        }
      }
      timer = setTimeout(() => interrupt(entry, 'HANDSHAKE_TIMEOUT'), executionLimits.handshakeMs);
      // One launch only. Timeout/lost response retains the same identity, never recruits again.
      const command = launchCommand(host.powershellExecutable, entry.bootstrap.path);
      const preparedCommand = host.prepareTerminalLaunch ? await host.prepareTerminalLaunch({ workspaceId: validation.anchor.workspaceId, terminalName: sessionCandidate.terminalName, generation: sessionCandidate.generation }, command) : command;
      if (entry.cancelled || entry.revoked || closed) {
        await host.stopPendingTerminal?.({ workspaceId: validation.anchor.workspaceId, terminalName: sessionCandidate.terminalName, generation: sessionCandidate.generation });
        return store.getPassage(initial.handle);
      }
      entry.launchPending = true;
      entry.launchIssued = true;
      const launching = runtime.recruit(sessionCandidate.terminalName, request.cwd, preparedCommand, terminalAvailabilityConfirmed);
      void launching.then(async () => {
        entry.launchPending = false;
        if (entry.cancelled || entry.revoked || closed) await stop(entry);
      }).catch(async () => {
        entry.launchPending = false;
        interrupt(entry, 'LAUNCH_UNCERTAIN');
        if (entry.cancelled || entry.revoked || closed) await stop(entry);
      }).catch(() => { entry.storageFailed = true; });
      await waiting;
      if (entry.storageFailed) throw new ExecutionError('STORAGE_FAILED');
      return store.getPassage(initial.handle);
    } catch (error) {
      interrupt(entry, codeOf(error, 'CLI_UNAVAILABLE'));
      if (entry.storageFailed) throw new ExecutionError('STORAGE_FAILED');
      return store.getPassage(initial.handle);
    } finally {
      signal?.removeEventListener('abort', abort);
      if (store.getPassage(initial.handle).state !== 'ready') {
        clearTimeout(timer);
        await entry.channel?.close();
        await entry.bootstrap?.removeSecret();
      }
    }
  };

  return {
    observeManagedTerminal: async reference => options.host && !closed ? observeTerminalAvailability(options.host, reference) : 'uncertain',
    reconcilePassageStop: async handle => {
      if (closed || !options.host?.confirmStoppedTerminal) return false;
      try {
        const session = store.getAttemptSession(handle);
        if (!session.workspaceId || !session.terminalId) return false;
        const reference = { workspaceId: session.workspaceId, terminalId: session.terminalId,
          terminalName: session.terminalName, generation: session.generation };
        if (!await options.host.confirmStoppedTerminal(reference) || closed) return false;
        const current = store.getAttemptSession(handle);
        if (current.id !== session.id || current.generation !== session.generation ||
            current.terminalId !== session.terminalId || current.workspaceId !== session.workspaceId) return false;
        store.recordStop(handle, { passageId: handle.passageId, state: 'confirmed' });
        return true;
      } catch { return false; }
    },
    preparePassageHandoff: async source => {
      const entry = live.get(source.passageId); const prior = store.getPassage(source);
      if (entry?.handoff && entry.stopped && (await entry.stopResult)?.state === 'confirmed' && prior.state === 'ready') return;
      if (closed || !entry?.session || !entry.channel || entry.cancelled || entry.idle || entry.handoff ||
          prior.state !== 'ready' || !store.getResult(source)) throw new ExecutionError('TRACKING_LOST');
      const session = store.getAttemptSession(source, prior.binding);
      if (session.state !== 'completed' || session.terminalState !== 'available' || session.ompSessionId !== entry.session.sessionId) throw new ExecutionError('TRACKING_LOST');
      try {
        await new Promise<void>((resolve, reject) => {
          // Finalization is agent activity, not an RPC deadline. Loss/cancellation rejects this wait.
          entry.idle = { resolve, reject: () => reject(new ExecutionError('TRACKING_LOST')) };
          void entry.channel?.send({ type: 'continuation-check', passageId: source.passageId }).catch(() => entry.idle?.reject());
        });
        if (closed || entry.cancelled || store.getPassage(source).state !== 'ready') throw new ExecutionError('TRACKING_LOST');
        entry.handoff = true;
        const receipt = await stop(entry);
        if (receipt.state !== 'confirmed') throw new ExecutionError('TRACKING_LOST');
        await entry.channel.close();
        if (closed || entry.cancelled || store.getPassage(source).state !== 'ready') throw new ExecutionError('TRACKING_LOST');
      } catch (error) {
        entry.handoff = false; entry.idle = undefined; interrupt(entry, 'TRACKING_LOST'); throw error;
      }
    },
    getCatalog: async () => {
      try { return await (await native()).getCatalog(); }
      catch (error) {
        const code = codeOf(error, 'CLI_UNAVAILABLE');
        return { state: 'unavailable' as const, observed_at_ms: Date.now(), diagnostics: [{ code,
          message: 'O catálogo local do OMP não pôde ser consultado.', recovery: 'Confira o executável e a configuração local do OMP; consulte novamente.' }] };
      }
    },
    continuePassage: async (source, input) => {
      const entry = live.get(source.passageId); const old = store.getPassage(source);
      const request = { ...input, cwd: input.cwd ?? entry?.request.cwd ?? '' };
      if (closed || !Value.Check(PassageRequest, request)) throw new ExecutionError('INPUT_INVALID');
      if (!entry?.session || entry.cancelled || entry.continuation || !entry.channel || old.state !== 'ready' || !store.getResult(source) ||
        request.binding.role !== old.binding.role || request.binding.attemptId !== old.binding.attemptId || request.binding.round !== old.binding.round + 1 ||
        canonical(request.profile) !== canonical(entry.request.profile) || canonical(request.roleResource) !== canonical(entry.request.roleResource)) throw new ExecutionError('TRACKING_LOST');
      const previousSession = store.getAttemptSession(source, old.binding);
      const nextSession = store.getAttemptSession(handleOf(request.binding.passageId), request.binding);
      if (previousSession.id !== nextSession.id || previousSession.role !== request.binding.role || previousSession.attemptId !== request.binding.attemptId ||
          nextSession.state !== 'completed' || nextSession.ompSessionId !== entry.session.sessionId || nextSession.generation !== previousSession.generation) throw new ExecutionError('TRACKING_LOST');
      if (request.binding.role === 'reviewer' || entry.handoff) {
        if (!entry.handoff || !entry.stopped || request.cwd !== entry.request.cwd) throw new ExecutionError('TRACKING_LOST');
        live.delete(source.passageId);
        try {
          const resumed = await start(request, undefined, entry.session.sessionId);
          if (resumed.state !== 'ready') throw new ExecutionError('TRACKING_LOST');
          return resumed;
        }
        catch (error) { persistState(entry, 'interrupted', 'TRACKING_LOST', 'tracking-lost'); throw error; }
      }
      if (request.cwd !== entry.request.cwd || entry.handoff) throw new ExecutionError('TRACKING_LOST');
      const handle = handleOf(request.binding.passageId);
      const reserved = store.reserve({ handle, binding: request.binding, requestHash: digest(request), terminalName: `factory-${request.binding.passageId}`,
        state: 'starting', roleResource: request.roleResource, diagnostic: null, effectiveProfile: null, executorVersion: null }, true);
      if (!reserved.created) throw new ExecutionError('TRACKING_LOST'); // No blind replay after an uncertain send.
      live.delete(source.passageId); entry.request = structuredClone(request); live.set(handle.passageId, entry);
      try {
        return await new Promise<PassageRecord>((resolve, reject) => {
          const timer = setTimeout(() => entry.continuation?.reject(), executionLimits.requestMs);
          entry.continuation = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: () => { clearTimeout(timer); reject(new ExecutionError('TRACKING_LOST')); } };
          void entry.channel?.send({ type: 'continuation', passageId: handle.passageId, task: request.task }).catch(() => entry.continuation?.reject());
        });
      } catch (error) {
        entry.continuation = undefined; persistState(entry, 'interrupted', 'TRACKING_LOST', 'tracking-lost'); throw error;
      }
    },
    observeVersions: async () => {
      const observedAtMs = Date.now();
      const observation = (tool: 'omp' | 'maestri', version: string | null, cause: string | null): ToolObservation => ({
        tool, observedAtMs, state: version ? 'observed' : 'unavailable', version, cause,
        affectedRequirements: version ? [] : ['RF-22', 'INT-01'],
      });
      let omp: string | null = null; let cause = 'CONTEXT_MISSING';
      try { omp = (await (await native()).validate()).ompVersion; } catch (error) { cause = codeOf(error, 'CLI_UNAVAILABLE'); }
      const tools = [observation('omp', omp, omp ? null : cause)];
      let maestri: string | null = null;
      let maestriCause = omp ? 'MAESTRI_VERSION_UNOBSERVABLE' : cause;
      if (omp && options.host) {
        try {
          const reply = await (dependencies.runCli ?? runCli)(options.host.maestriExecutable, ['--version'], options.dataDirectory, options.host.inheritedEnvironment);
          if (reply.exitCode === 0) maestri = /^(?:maestri[ /])?(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?|[a-f0-9]{8,40})\s*$/i.exec(reply.stdout.trim())?.[1] ?? null;
        } catch { maestriCause = 'MAESTRI_VERSION_QUERY_FAILED'; }
      }
      tools.push(observation('maestri', maestri, maestri ? null : maestriCause));
      return tools;
    },
    roleResources: () => [...roles.values()].map(r => structuredClone(r.reference)),
    preflight: async () => {
      try { const info = await (await native()).validate(); return { ready: true, code: null, ompVersion: info.ompVersion }; }
      catch (error) { return { ready: false, code: codeOf(error, 'CLI_UNAVAILABLE'), ompVersion: null }; }
    },
    startPassage: (input, signal) => {
      if (closed || !Value.Check(PassageRequest, input)) return Promise.reject(new ExecutionError('INPUT_INVALID'));
      if (input.previousBlockingFindingKeys?.some(id => !input.previousFindingKeys.includes(id))) return Promise.reject(new ExecutionError('INPUT_INVALID'));
      if (!profileValue.test(input.profile.provider) || !profileValue.test(input.profile.model) ||
        (input.profile.effort !== null && !profileValue.test(input.profile.effort))) return Promise.reject(new ExecutionError('INPUT_INVALID'));
      if (starts.size >= executionLimits.passages && !starts.has(input.binding.passageId)) return Promise.reject(new ExecutionError('INPUT_INVALID'));
      const request = structuredClone(input);
      const hash = digest(request);
      const prior = starts.get(request.binding.passageId);
      if (prior) return prior.hash === hash ? prior.promise.then(() => store.getPassage(handleOf(request.binding.passageId))) : Promise.reject(new ExecutionError('RESULT_CONFLICT'));
      const promise = start(request, signal);
      starts.set(request.binding.passageId, { hash, promise });
      return promise;
    },
    observe: (handle, cursor = 0) => {
      if (!Value.Check(OperationId, handle.passageId) || !Number.isSafeInteger(cursor) || cursor < 0) throw new ExecutionError('INPUT_INVALID');
      return store.observe(handle, cursor, 100);
    },
    getResult: (handle) => store.getResult(handle),
    answerQuestion: async (handle, questionId, answer, operationId) => {
      if (![handle.passageId, questionId, operationId].every(id => Value.Check(OperationId, id)) || !answer.trim() || answer.length > 8192) throw new ExecutionError('INPUT_INVALID');
      const entry = live.get(handle.passageId);
      if (!entry?.session || entry.cancelled || closed || store.getPassage(handle).state !== 'ready') throw new ExecutionError('TRACKING_LOST');
      const recorded = store.recordAnswer(handle, questionId, answer, operationId);
      if (recorded.state !== 'recorded') return recorded;
      if (entry.answers.has(operationId)) return recorded;
      if (entry.answers.size >= executionLimits.pendingCalls) throw new ExecutionError('CHANNEL_TIMEOUT');
      if (!store.claimAnswer(handle, operationId)) return { ...recorded, state: 'delivery_unknown' };
      try {
        return await new Promise<AnswerRecord>((resolve, reject) => {
          const timer = setTimeout(() => { entry.answers.delete(operationId); reject(new ExecutionError('CHANNEL_TIMEOUT')); }, executionLimits.requestMs);
          entry.answers.set(operationId, { resolve: (receipt) => { clearTimeout(timer); resolve(receipt); }, reject: () => { clearTimeout(timer); reject(new ExecutionError('CHANNEL_EOF')); } });
          void entry.channel?.send({ type: 'answer', questionId, operationId, answer, ...(recorded.scopeDigest ? { scopeDigest: recorded.scopeDigest } : {}) }).catch(() => entry.answers.get(operationId)?.reject());
        });
      } catch {
        entry.answers.delete(operationId);
        return store.confirmAnswer(handle, operationId, 'delivery_unknown');
      }
    },
    cancelAttempt: async (attemptId, operationId) => {
      if (![attemptId, operationId].every(id => Value.Check(OperationId, id))) throw new ExecutionError('INPUT_INVALID');
      const handles = store.recordCancellation(attemptId, operationId);
      return Promise.all(handles.map(async handle => {
        const entry = live.get(handle.passageId);
        if (!entry) {
          const record = store.getPassage(handle);
          let state: StopReceipt['state'] = record.requestHash ? 'uncertain' : 'confirmed';
          if (record.requestHash) {
            try {
              const session = store.getAttemptSession(handle);
              const identity = session.workspaceId && session.terminalId
                ? { workspaceId: session.workspaceId, terminalId: session.terminalId } : undefined;
              const confirmed = identity && await options.host?.confirmStoppedTerminal?.({ ...identity,
                terminalName: session.terminalName, generation: session.generation });
              state = confirmed ? 'confirmed' : await (await native()).stop(session.terminalName, identity, session.generation);
            } catch { state = 'uncertain'; }
          }
          const receipt: StopReceipt = { passageId: handle.passageId, state };
          store.recordStop(handle, receipt);
          return receipt;
        }
        entry.cancelled = true; interrupt(entry, 'CANCELLED');
        await entry.channel?.close();
        return stop(entry);
      }));
    },
    interactionSurface: (handle) => {
      const record = store.getPassage(handle);
      const entry = live.get(handle.passageId);
      const open = options.host?.openExistingTerminal;
      const session = entry?.session;
      const available = Boolean(open && session && record.state === 'ready' && !entry?.cancelled && !closed);
      return { kind: 'terminal', reference: record.managedTerminalName ?? record.terminalName, available,
        reason: available ? null : 'Abra a sessão existente no Maestri do host executor; abertura programática indisponível neste contexto.',
        open: available && open && session ? async () => {
          if (closed || entry?.cancelled || store.getPassage(handle).state !== 'ready') throw new ExecutionError('INTERACTION_UNAVAILABLE');
          await open({ terminalId: session.terminalId, workspaceId: session.workspaceId });
        } : null };
    },
    close: () => {
      if (closing) return closing;
      closed = true;
      closing = (async () => {
        const outcomes = await Promise.allSettled([...live.values()].map(async entry => {
          try { interrupt(entry, 'TRACKING_LOST'); }
          finally {
            try {
              // Keep the native job owner alive until the physical stop receipt is durable.
              await stop(entry);
              await entry.channel?.close();
            }
            finally { await entry.bootstrap?.removeSecret(); }
          }
          if (entry.storageFailed) throw new ExecutionError('STORAGE_FAILED');
        }));
        const failure = outcomes.find(outcome => outcome.status === 'rejected');
        await options.host?.closeTerminalProcesses?.();
        if (failure?.status === 'rejected') throw new ExecutionError(codeOf(failure.reason, 'TRACKING_LOST'));
      })();
      return closing;
    },
  };
}
