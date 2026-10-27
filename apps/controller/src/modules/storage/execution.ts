import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { ExecutionQuestion, ImplementerResult, OperationId, PassageBinding, ReviewerResult, ScopeChange, type ExecutionProfileValue, type PassageResult } from '#contracts';
import { ExecutionError, type AnswerRecord, type AttemptSessionIdentity, type ExecutionCode, type ExecutionEvent, type ExecutionPersistence, type PassageHandle, type PassageRecord, type QuestionRecord, type ResultRecord } from '../execution/index.js';
import { attemptEvent, readAttempt, readCapture } from './attempts.js';
import { digest } from './configuration-reads.js';
import { createPendingDelivery } from './deliveries.js';
import { acceptReview, openFindings } from './reviews.js';
import { recordDisputes } from './disputes.js';
import { beginMeasurement, checkpoint, expireLimits } from './measurements.js';
import { claimAnswer, questionETag, questionRow as readQuestionRow, recordAnswer, stopQuestions } from './questions.js';

interface PassageRow {
  id: string; attempt_id: string; round_number: number; delivery_version: string; role: 'implementer' | 'reviewer';
  role_resource_json: string; request_hash: string | null; terminal_name: string; state: PassageRecord['state'];
  diagnostic: ExecutionCode | null; effective_profile_json: string | null; executor_version: string | null;
  attempt_session_id: string | null; session_directory_relative: string | null; terminal_generation: number | null;
  managed_terminal_id: string | null; managed_terminal_name: string | null; terminal_id: string | null; workspace_id: string | null;
}
export function createExecutionPersistence(db: Database.Database, onResultAccepted?: (binding: PassageBinding) => void): ExecutionPersistence {
  const atomic = <T>(fn: () => T, write = true): T => {
    try { const transaction = db.transaction(fn); return write ? transaction.immediate() : transaction(); }
    catch (error) { if (error instanceof ExecutionError) throw error; throw new ExecutionError('STORAGE_FAILED'); }
  };
  function row(handle: PassageHandle): PassageRow {
    if (!Value.Check(OperationId, handle.passageId)) throw new ExecutionError('INPUT_INVALID');
    const found = db.prepare<[string], PassageRow>(`SELECT p.*,s.id AS attempt_session_id,s.session_directory_relative,s.terminal_generation,
      t.id AS managed_terminal_id,t.terminal_name AS managed_terminal_name,t.terminal_id,t.workspace_id
      FROM passages p LEFT JOIN attempt_sessions s ON s.id=p.attempt_session_id
      LEFT JOIN managed_terminals t ON t.id=s.managed_terminal_id WHERE p.id=?`).get(handle.passageId);
    if (!found) throw new ExecutionError('TRACKING_LOST');
    if (found.attempt_session_id && !db.prepare(`SELECT id FROM attempt_sessions WHERE id=? AND attempt_id=? AND role=?`)
      .get(found.attempt_session_id, found.attempt_id, found.role)) throw new ExecutionError('TRACKING_LOST');
    return found;
  }
  function getPassage(handle: PassageHandle): PassageRecord {
    const p = row(handle);
    return { handle, binding: { attemptId: p.attempt_id, passageId: p.id, role: p.role, round: p.round_number, deliveryVersion: p.delivery_version },
      requestHash: p.request_hash ?? '', state: p.state, roleResource: JSON.parse(p.role_resource_json) as PassageRecord['roleResource'],
      terminalName: p.terminal_name, terminalResourceName: p.terminal_name, diagnostic: p.diagnostic,
      ...(p.managed_terminal_name ? { managedTerminalName: p.managed_terminal_name } : {}),
      ...(p.terminal_id ? { terminalId: p.terminal_id } : { terminalId: null }),
      ...(p.workspace_id ? { workspaceId: p.workspace_id } : { workspaceId: null }),
      ...(p.attempt_session_id ? { attemptSessionId: p.attempt_session_id } : {}),
      ...(p.session_directory_relative ? { sessionDirectoryRelative: p.session_directory_relative } : {}),
      ...(p.terminal_generation !== null ? { terminalGeneration: p.terminal_generation } : {}),
      effectiveProfile: p.effective_profile_json ? JSON.parse(p.effective_profile_json) as ExecutionProfileValue : null, executorVersion: p.executor_version };
  }
  function assertBinding(binding: PassageBinding): PassageRow {
    if (!Value.Check(PassageBinding, binding)) throw new ExecutionError('RESULT_INVALID');
    const p = row({ passageId: binding.passageId });
    if (p.attempt_id !== binding.attemptId || p.round_number !== binding.round || p.role !== binding.role || p.delivery_version !== binding.deliveryVersion) throw new ExecutionError('RESULT_INVALID');
    return p;
  }
  function event(p: PassageRow, type: ExecutionEvent['type'], code: ExecutionCode | null): void {
    db.prepare('INSERT INTO passage_events(passage_id,event_type,code,created_at_ms) VALUES (?,?,?,?)').run(p.id, type, code, Date.now());
    db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(), p.attempt_id);
    attemptEvent(db, p.attempt_id, type, { round: p.round_number, role: p.role });
  }
  function active(p: PassageRow): void {
    const a = readAttempt(db, p.attempt_id);
    if (a.result || a.suspension || a.round !== p.round_number || !['preparing', 'implementing', 'reviewing'].includes(a.phase) || !['starting', 'ready'].includes(p.state)) throw new ExecutionError('TRACKING_LOST');
  }
  function capturedInput(p: PassageRow): void {
    if (p.role === 'reviewer' && !db.prepare("SELECT id FROM deliveries WHERE id=? AND attempt_id=? AND capture_state='captured'").get(p.delivery_version, p.attempt_id)) throw new ExecutionError('RESOURCE_INVALID');
    if (p.role === 'reviewer' && !db.prepare("SELECT id FROM reviews WHERE passage_id=? AND workspace_state='ready' AND state='pending'").get(p.id)) throw new ExecutionError('RESOURCE_INVALID');
  }
  function getResult(handle: PassageHandle): ResultRecord | null {
    const p = getPassage(handle);
    const accepted = db.prepare<[string], { result_hash: string; receipt_id: string; summary_json: string }>('SELECT result_hash,receipt_id,summary_json FROM passage_results WHERE passage_id=?').get(handle.passageId);
    if (!accepted) return null;
    const criteria = db.prepare<[string], { criterionId: string; verdict: 'passed' | 'failed' | 'not_verified'; evidence_json: string }>(
      'SELECT criterion_id AS criterionId,verdict,evidence_json FROM criterion_results WHERE passage_id=? ORDER BY rowid',
    ).all(handle.passageId).map(c => ({ criterionId: c.criterionId, verdict: c.verdict, evidence: JSON.parse(c.evidence_json) as string[] }));
    const result = { ...JSON.parse(accepted.summary_json) as object, criteria } as PassageResult;
    if (!Value.Check(p.binding.role === 'implementer' ? ImplementerResult : ReviewerResult, result) || digest(result) !== accepted.result_hash) throw new ExecutionError('STORAGE_FAILED');
    return { binding: p.binding, result, sha256: accepted.result_hash, receiptId: accepted.receipt_id };
  }
  return {
    getPassage: (h) => atomic(() => getPassage(h), false),
    getAttemptSession: (handle, binding) => atomic(() => {
      if (binding) {
        if (binding.passageId !== handle.passageId) throw new ExecutionError('TRACKING_LOST');
        assertBinding(binding);
      }
      const p = row(handle);
      if (!p.attempt_session_id || !p.managed_terminal_id || !p.managed_terminal_name || !p.session_directory_relative || p.terminal_generation === null) throw new ExecutionError('STORAGE_FAILED');
      const session = db.prepare<[string], { state: AttemptSessionIdentity['state']; omp_session_id: string | null; terminal_state: AttemptSessionIdentity['terminalState'] }>(
        `SELECT s.state,s.omp_session_id,t.state AS terminal_state FROM attempt_sessions s JOIN managed_terminals t ON t.id=s.managed_terminal_id
          WHERE s.id=? AND (s.terminal_generation=t.generation OR
            (s.state='reserved' AND s.omp_session_id IS NULL AND t.state='available' AND s.terminal_generation=t.generation+1))`,
      ).get(p.attempt_session_id);
      if (!session) throw new ExecutionError('STORAGE_FAILED');
      return { id: p.attempt_session_id, attemptId: p.attempt_id, role: p.role, managedTerminalId: p.managed_terminal_id,
        terminalName: p.managed_terminal_name, terminalId: p.terminal_id, workspaceId: p.workspace_id, generation: p.terminal_generation, terminalState: session.terminal_state,
        state: session.state, ompSessionId: session.omp_session_id, sessionDirectoryRelative: p.session_directory_relative };
    }, false),
    allocateTerminal: (handle) => atomic(() => {
      const p = row(handle);
      if (!p.attempt_session_id || !p.managed_terminal_id || p.terminal_generation === null || p.terminal_id === null || p.workspace_id === null) throw new ExecutionError('TRACKING_LOST');
      const session = db.prepare<[string], { state: string; omp_session_id: string | null }>(
        'SELECT state,omp_session_id FROM attempt_sessions WHERE id=?',
      ).get(p.attempt_session_id);
      const oldTerminal = db.prepare<[string], { installation_id: string; host_name: string; role: 'implementer' | 'reviewer'; generation: number; state: string }>(
        'SELECT installation_id,host_name,role,generation,state FROM managed_terminals WHERE id=?',
      ).get(p.managed_terminal_id);
      if (!session || session.state !== 'reserved' || session.omp_session_id !== null || !oldTerminal ||
        oldTerminal.state !== 'available' || oldTerminal.generation + 1 !== p.terminal_generation) throw new ExecutionError('TRACKING_LOST');
      db.prepare("UPDATE managed_terminals SET state='uncertain',updated_at_ms=? WHERE id=? AND generation=? AND state='available'")
        .run(Date.now(), p.managed_terminal_id, oldTerminal.generation);
      const id = randomUUID(); const terminalName = `factory-${id}`; const now = Date.now();
      db.prepare(`INSERT INTO managed_terminals(id,installation_id,host_name,role,owner,generation,terminal_name,state,created_at_ms,updated_at_ms)
        VALUES (?,?,?,?,'factory',1,?,'planned',?,?)`).run(id, oldTerminal.installation_id, oldTerminal.host_name, oldTerminal.role, terminalName, now, now);
      const updated = db.prepare("UPDATE attempt_sessions SET managed_terminal_id=?,terminal_generation=?,updated_at_ms=? WHERE id=? AND state='reserved' AND omp_session_id IS NULL")
        .run(id, 1, now, p.attempt_session_id);
      if (updated.changes !== 1) throw new ExecutionError('TRACKING_LOST');
      return { id: p.attempt_session_id, attemptId: p.attempt_id, role: p.role, managedTerminalId: id,
        terminalName, terminalId: null, workspaceId: null, generation: 1, terminalState: 'planned',
        state: 'reserved', ompSessionId: null, sessionDirectoryRelative: p.session_directory_relative! };
    }),
    reserve: (input, terminalAvailabilityConfirmed = false) => atomic(() => {
      const p = assertBinding(input.binding); active(p);
      capturedInput(p);
      if (input.handle.passageId !== p.id || input.terminalName !== p.terminal_name ||
        digest(input.roleResource) !== digest(JSON.parse(p.role_resource_json)) || !/^[a-f0-9]{64}$/.test(input.requestHash)) throw new ExecutionError('RESOURCE_INVALID');
      if (p.request_hash) {
        if (p.request_hash !== input.requestHash) throw new ExecutionError('RESULT_CONFLICT');
        return { created: false, record: getPassage(input.handle) };
      }
      if (!p.attempt_session_id || !p.managed_terminal_id || p.terminal_generation === null) throw new ExecutionError('STORAGE_FAILED');
      const terminal = db.prepare<[string], { state: string; generation: number; terminal_id: string | null }>(
        'SELECT state,generation,terminal_id FROM managed_terminals WHERE id=?',
      ).get(p.managed_terminal_id);
      const session = p.attempt_session_id ? db.prepare<[string], { omp_session_id: string | null; state: string }>(
        'SELECT omp_session_id,state FROM attempt_sessions WHERE id=?',
      ).get(p.attempt_session_id) : undefined;
      if (!session || !['reserved','completed'].includes(session.state)) throw new ExecutionError('TRACKING_LOST');
      const source = db.prepare<[string], { session_source_id: string | null }>('SELECT session_source_id FROM passages WHERE id=?').get(p.id)?.session_source_id;
      if (session.omp_session_id && (!source || !db.prepare(`SELECT id FROM passages WHERE id=? AND attempt_id=? AND role=?
        AND attempt_session_id=? AND round_number=? AND state='ready' AND tracking_state='tracked'
        AND EXISTS (SELECT 1 FROM passage_results WHERE passage_id=passages.id)`)
        .get(source, p.attempt_id, p.role, p.attempt_session_id, p.round_number - 1))) throw new ExecutionError('TRACKING_LOST');
      const newTerminal = terminal?.state === 'planned' && terminal.generation === p.terminal_generation && terminal.terminal_id === null;
      const reusableTerminal = terminal?.state === 'available' && Boolean(terminal.terminal_id) && terminalAvailabilityConfirmed &&
        (terminal.generation + 1 === p.terminal_generation || (terminal.generation === p.terminal_generation && Boolean(session?.omp_session_id)));
      if (!terminal || (!newTerminal && !reusableTerminal)) throw new ExecutionError('TRACKING_LOST');
      const workspace = db.prepare("SELECT id FROM resources WHERE attempt_id=? AND kind='implementation' AND launch_state='ready' AND owned=1").get(p.attempt_id);
      if (!workspace) throw new ExecutionError('RESOURCE_INVALID');
      db.prepare('UPDATE passages SET request_hash=? WHERE id=? AND request_hash IS NULL').run(input.requestHash, p.id);
      db.prepare("UPDATE resources SET launch_state='starting',owned=1 WHERE passage_id=? AND kind='terminal' AND launch_state='planned'").run(p.id);
      db.prepare("UPDATE managed_terminals SET generation=?,state=CASE WHEN terminal_id IS NULL THEN 'planned' ELSE 'occupied' END,updated_at_ms=? WHERE id=? AND state IN ('planned','available')")
        .run(p.terminal_generation, Date.now(), p.managed_terminal_id);
      db.prepare(`INSERT INTO terminal_occupancies(id,managed_terminal_id,attempt_session_id,attempt_id,passage_id,generation,state,claimed_at_ms)
        VALUES (?,?,?,?,?,?,'occupied',?)`).run(randomUUID(), p.managed_terminal_id, p.attempt_session_id, p.attempt_id, p.id, p.terminal_generation, Date.now());
      db.prepare("UPDATE attempt_sessions SET state='active',updated_at_ms=? WHERE id=? AND state IN ('reserved','completed')")
        .run(Date.now(), p.attempt_session_id);
      event(p, 'cleanup-updated', null);
      return { created: true, record: getPassage(input.handle) };
    }),
    confirmTerminal: (handle, observation) => atomic(() => {
      const p = row(handle);
      if (!p.attempt_session_id || !p.managed_terminal_id || p.terminal_generation === null ||
        !Value.Check(OperationId, observation.workspaceId) || !Value.Check(OperationId, observation.terminalId) || !Value.Check(OperationId, observation.ompSessionId)) throw new ExecutionError('RESOURCE_INVALID');
      const terminal = db.prepare<[string], { generation: number; workspace_id: string | null; terminal_id: string | null; state: string }>(
        'SELECT generation,workspace_id,terminal_id,state FROM managed_terminals WHERE id=?',
      ).get(p.managed_terminal_id);
      if (!terminal || terminal.generation !== p.terminal_generation || !['planned','occupied'].includes(terminal.state) ||
        (terminal.terminal_id !== null && terminal.terminal_id !== observation.terminalId) ||
        (terminal.workspace_id !== null && terminal.workspace_id !== observation.workspaceId)) throw new ExecutionError('TRACKING_LOST');
      const occupancy = db.prepare<[string], { state: string }>("SELECT state FROM terminal_occupancies WHERE passage_id=? ORDER BY generation DESC LIMIT 1").get(p.id);
      if (!occupancy || occupancy.state !== 'occupied') throw new ExecutionError('TRACKING_LOST');
      db.prepare("UPDATE managed_terminals SET terminal_id=?,workspace_id=?,state='occupied',observed_at_ms=?,updated_at_ms=? WHERE id=? AND generation=?")
        .run(observation.terminalId, observation.workspaceId, Date.now(), Date.now(), p.managed_terminal_id, p.terminal_generation);
      const updated = db.prepare("UPDATE attempt_sessions SET omp_session_id=?,state='active',updated_at_ms=? WHERE id=? AND (omp_session_id IS NULL OR omp_session_id=?)")
        .run(observation.ompSessionId, Date.now(), p.attempt_session_id, observation.ompSessionId);
      if (updated.changes !== 1) throw new ExecutionError('TRACKING_LOST');
    }),
    claimContinuation: (handle) => atomic(() => {
      const p = row(handle);
      if (!p.attempt_session_id || !p.managed_terminal_id || p.terminal_generation === null || !p.workspace_id || !p.terminal_id) throw new ExecutionError('TRACKING_LOST');
      const terminal = db.prepare<[string], { state: string; generation: number }>('SELECT state,generation FROM managed_terminals WHERE id=?').get(p.managed_terminal_id);
      if (!terminal || terminal.state !== 'available' || terminal.generation !== p.terminal_generation) throw new ExecutionError('TRACKING_LOST');
      db.prepare(`INSERT INTO terminal_occupancies(id,managed_terminal_id,attempt_session_id,attempt_id,passage_id,generation,state,claimed_at_ms)
        VALUES (?,?,?,?,?,?,'occupied',?)`).run(randomUUID(), p.managed_terminal_id, p.attempt_session_id, p.attempt_id, p.id, p.terminal_generation, Date.now());
      db.prepare("UPDATE managed_terminals SET state='occupied',updated_at_ms=? WHERE id=? AND state='available'").run(Date.now(), p.managed_terminal_id);
      db.prepare("UPDATE attempt_sessions SET state='active',updated_at_ms=? WHERE id=?").run(Date.now(), p.attempt_session_id);
    }),
    releaseOccupancy: (handle, state, reason) => atomic(() => {
      const p = row(handle);
      const occupancy = db.prepare<[string], { id: string; managed_terminal_id: string; attempt_session_id: string; generation: number; state: string }>(
        'SELECT id,managed_terminal_id,attempt_session_id,generation,state FROM terminal_occupancies WHERE passage_id=? ORDER BY generation DESC LIMIT 1',
      ).get(p.id);
      if (!occupancy || occupancy.state !== 'occupied') return;
      if (state === 'released') {
        db.prepare("UPDATE terminal_occupancies SET state='released',released_at_ms=?,reason=? WHERE id=? AND state='occupied'").run(Date.now(), reason, occupancy.id);
        db.prepare("UPDATE managed_terminals SET state='available',updated_at_ms=? WHERE id=? AND generation=? AND state='occupied'").run(Date.now(), occupancy.managed_terminal_id, occupancy.generation);
        db.prepare("UPDATE attempt_sessions SET state='completed',updated_at_ms=? WHERE id=?").run(Date.now(), occupancy.attempt_session_id);
      } else {
        db.prepare("UPDATE terminal_occupancies SET state='uncertain',reason=? WHERE id=? AND state='occupied'").run(reason ?? 'TERMINAL_AVAILABILITY_UNCERTAIN', occupancy.id);
        db.prepare("UPDATE managed_terminals SET state='uncertain',updated_at_ms=? WHERE id=? AND generation=?").run(Date.now(), occupancy.managed_terminal_id, occupancy.generation);
        db.prepare("UPDATE attempt_sessions SET state='uncertain',updated_at_ms=? WHERE id=?").run(Date.now(), occupancy.attempt_session_id);
      }
    }),
    record: (handle, state, code, type) => atomic(() => {
      const p = row(handle);
      if (state !== 'ready') checkpoint(db, p.id, 'stopped');
      if (state === 'ready' && p.state !== 'ready') throw new ExecutionError('TRACKING_LOST');
      db.prepare('UPDATE passages SET state=?,tracking_state=?,diagnostic=? WHERE id=?').run(state, state === 'ready' ? 'tracked' : 'lost', code, p.id);
      // The latest passage of either role owns that conversation's continuity, even between rounds.
      if (state !== 'ready') db.prepare(`UPDATE attempts SET suspension=?,diagnostic=? WHERE id=? AND result IS NULL
        AND NOT EXISTS (SELECT 1 FROM passages WHERE attempt_id=? AND role=? AND round_number>?)`)
        .run('TRACKING_LOST', code, p.attempt_id, p.attempt_id, p.role, p.round_number);
      if (state !== 'ready' && state !== 'cancelled') {
        const revoked = db.prepare("UPDATE attempts SET phase='finished',result='interrupted',suspension=NULL WHERE id=? AND result IS NULL AND suspension='TRACKING_LOST'").run(p.attempt_id);
        if (revoked.changes) {
          stopQuestions(db, p.attempt_id);
          db.prepare("UPDATE passages SET state='interrupted',tracking_state='lost' WHERE attempt_id=? AND state IN ('starting','ready')").run(p.attempt_id);
          db.prepare("UPDATE passage_measurements SET mode='stopped' WHERE passage_id IN (SELECT id FROM passages WHERE attempt_id=?)").run(p.attempt_id);
        }
      }
      db.prepare("UPDATE resources SET launch_state=?,diagnostic=? WHERE passage_id=? AND kind='terminal'").run(state === 'ready' ? 'ready' : 'partial', code, p.id);
      if (state !== 'ready') {
        db.prepare(`UPDATE attempt_sessions SET state='uncertain',updated_at_ms=? WHERE id=?
          AND NOT EXISTS (SELECT 1 FROM passages WHERE attempt_session_id=? AND round_number>?)`)
          .run(Date.now(), p.attempt_session_id, p.attempt_session_id, p.round_number);
        const occupancy = db.prepare<[string], { id: string; managed_terminal_id: string; attempt_session_id: string; generation: number }>(
          "SELECT id,managed_terminal_id,attempt_session_id,generation FROM terminal_occupancies WHERE passage_id=? AND state='occupied' ORDER BY generation DESC LIMIT 1",
        ).get(p.id);
        if (occupancy) {
          db.prepare("UPDATE terminal_occupancies SET state='uncertain',reason=? WHERE id=?").run(code ?? 'TRACKING_LOST', occupancy.id);
          db.prepare("UPDATE managed_terminals SET state='uncertain',updated_at_ms=? WHERE id=? AND generation=?").run(Date.now(), occupancy.managed_terminal_id, occupancy.generation);
          db.prepare("UPDATE attempt_sessions SET state='uncertain',updated_at_ms=? WHERE id=?").run(Date.now(), occupancy.attempt_session_id);
        }
      }
      event(p, type, code);
    }),
    confirmReady: (handle, profile, executorVersion) => atomic(() => {
      capturedInput(row(handle));
      const p = row(handle); active(p);
      if (!p.request_hash || p.state !== 'starting') throw new ExecutionError('TRACKING_LOST');
      const capture = readCapture(db, p.attempt_id); const expected = p.role === 'implementer' ? capture.configuration.implementer_profile : capture.configuration.reviewer_profile;
      if (!expected || ['name', 'executor', 'provider', 'model', 'effort', 'guidance'].some(key => profile[key as keyof ExecutionProfileValue] !== expected[key as keyof ExecutionProfileValue]) ||
        capture.tools.find(t => t.tool === 'omp')?.version?.replace(/^omp\//i, '') !== executorVersion.replace(/^omp\//i, '')) throw new ExecutionError('PROFILE_MISMATCH');
      db.prepare("UPDATE passages SET effective_profile_json=?,executor_version=?,state='ready',tracking_state='tracked',diagnostic=NULL WHERE id=?")
        .run(JSON.stringify(profile), executorVersion, p.id);
      db.prepare("UPDATE resources SET launch_state='ready' WHERE passage_id=? AND kind='terminal'").run(p.id);
      db.prepare('UPDATE attempts SET phase=?,diagnostic=NULL WHERE id=?').run(p.role === 'implementer' ? 'implementing' : 'reviewing', p.attempt_id);
      beginMeasurement(db, p.id);
      event(p, 'passage-ready', null);
    }),
    observe: (handle, after, limit) => atomic(() => {
      row(handle);
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ExecutionError('INPUT_INVALID');
      return db.prepare<[string, number, number], ExecutionEvent>('SELECT seq AS sequence,event_type AS type,code FROM passage_events WHERE passage_id=? AND seq>? ORDER BY seq LIMIT ?').all(handle.passageId, after, limit);
    }, false),
    getResult: (h) => atomic(() => getResult(h), false),
    acceptResult: (input) => {
      atomic(() => expireLimits(db));
      const accepted = atomic(() => {
      const p = assertBinding(input.binding); const result = input.result;
      if (!Value.Check(p.role === 'implementer' ? ImplementerResult : ReviewerResult, result) || digest(result) !== input.sha256) throw new ExecutionError('RESULT_INVALID');
      const ids = result.criteria.map(c => c.criterionId);
      const required = db.prepare<[string], { id: string }>('SELECT criterion_id AS id FROM attempt_criteria WHERE attempt_id=? ORDER BY criterion_id').all(p.attempt_id).map(c => c.id);
      if (new Set(ids).size !== ids.length || digest([...ids].sort()) !== digest(required)) throw new ExecutionError('RESULT_INVALID');
      if ('checks' in result && new Set(result.checks.map(c => c.id)).size !== result.checks.length) throw new ExecutionError('RESULT_INVALID');
      if ('checks' in result && p.round_number > 1) {
        const requiredFindings = openFindings(db, p.attempt_id, p.round_number).map(f => f.id).sort();
        const responses = (result.findingResponses ?? []).map(f => f.findingId).sort();
        if (new Set(responses).size !== responses.length || digest(requiredFindings) !== digest(responses)) throw new ExecutionError('RESULT_INVALID');
      }
      if ('findings' in result) {
        const blockingKeys = new Set(openFindings(db, p.attempt_id, p.round_number).filter(f => f.blocking).map(f => f.id));
        if (new Set(result.findings.map(f => f.key)).size !== result.findings.length || new Set(result.resolutions.map(r => r.findingKey)).size !== result.resolutions.length ||
          (p.round_number === 1 && result.resolutions.length !== 0) ||
          result.findings.some(f => f.criterionIds.some(id => !required.includes(id))) ||
          (result.verdict === 'approved' && (result.criteria.some(c => c.verdict !== 'passed') || result.findings.some(f => f.blocking) || result.resolutions.some(r => r.verdict !== 'resolved' && blockingKeys.has(r.findingKey))))) throw new ExecutionError('RESULT_INVALID');
      }
      const previous = getResult({ passageId: p.id });
      if (previous) { if (previous.sha256 !== input.sha256) throw new ExecutionError('RESULT_CONFLICT'); return previous; }
      if ('checks' in result && p.round_number > 1 && result.additionalChangesJustification === undefined) throw new ExecutionError('RESULT_INVALID');
      if ('findings' in result && result.findings.some(f => f.priority === undefined)) throw new ExecutionError('RESULT_INVALID');
      if (p.state === 'ready' && db.prepare("SELECT id FROM execution_questions WHERE passage_id=? AND state<>'delivered'").get(p.id)) throw new ExecutionError('RESULT_INVALID');
      active(p);
      if (p.state !== 'ready') throw new ExecutionError('RESULT_INVALID');
      const receiptId = randomUUID(); const { criteria: _criteria, ...summary } = result;
      checkpoint(db, p.id, 'stopped');
      db.prepare('INSERT INTO passage_results(passage_id,attempt_id,result_hash,receipt_id,summary_json,accepted_at_ms) VALUES (?,?,?,?,?,?)')
        .run(p.id, p.attempt_id, input.sha256, receiptId, JSON.stringify(summary), Date.now());
      for (const c of result.criteria) db.prepare('INSERT INTO criterion_results(passage_id,attempt_id,criterion_id,verdict,evidence_json) VALUES (?,?,?,?,?)')
        .run(p.id, p.attempt_id, c.criterionId, c.verdict, JSON.stringify(c.evidence));
      if (p.role === 'implementer') {
        recordDisputes(db, input.binding, result as ImplementerResult, openFindings(db, p.attempt_id, p.round_number));
        createPendingDelivery(db, input.binding);
      }
      else acceptReview(db, input.binding, result as import('#contracts').ReviewerResult);
      const occupancy = db.prepare<[string], { id: string; managed_terminal_id: string; attempt_session_id: string; generation: number }>(
        "SELECT id,managed_terminal_id,attempt_session_id,generation FROM terminal_occupancies WHERE passage_id=? AND state='occupied' ORDER BY generation DESC LIMIT 1",
      ).get(p.id);
      if (occupancy) {
        db.prepare("UPDATE terminal_occupancies SET state='released',released_at_ms=?,reason='RESULT_ACCEPTED' WHERE id=? AND state='occupied'").run(Date.now(), occupancy.id);
        db.prepare("UPDATE managed_terminals SET state='available',updated_at_ms=? WHERE id=? AND generation=? AND state='occupied'").run(Date.now(), occupancy.managed_terminal_id, occupancy.generation);
        db.prepare("UPDATE attempt_sessions SET state='completed',updated_at_ms=? WHERE id=?").run(Date.now(), occupancy.attempt_session_id);
      }
      // Agent reports are not a delivery, successful checks or final approval.
      if (p.role === 'implementer') db.prepare("UPDATE attempts SET phase='verifying' WHERE id=?").run(p.attempt_id);
      event(p, 'result-accepted', null);
      return { binding: input.binding, result, sha256: input.sha256, receiptId };
      });
      // The listener only schedules IO. The SQLite commit has already completed.
      onResultAccepted?.(accepted.binding);
      return accepted;
    },
    raiseQuestion: (input) => atomic(() => {
      const p = assertBinding(input.binding);
      if (p.state !== 'ready' || !Value.Check(ExecutionQuestion, input.question) || (input.scopeChange && !Value.Check(ScopeChange, input.scopeChange)) || digest(input.question) !== input.sha256 || getResult({ passageId: p.id })) throw new ExecutionError('RESULT_INVALID');
      const old = db.prepare<[string, string], { id: string }>('SELECT id FROM execution_questions WHERE passage_id=? AND question_hash=?').get(p.id, input.sha256);
      if (old) return { ...input, questionId: old.id };
      active(p);
      const id = randomUUID();
      const ttl = readCapture(db, p.attempt_id).configuration.time_defaults.question_ttl;
      if (ttl.state === 'configured' && (ttl.unit !== 'ms' || !Number.isSafeInteger(ttl.value))) throw new ExecutionError('INPUT_INVALID');
      db.prepare("INSERT INTO execution_questions(id,passage_id,attempt_id,question_hash,question_json,state,created_at_ms,ttl_ms,scope_json) VALUES (?,?,?,?,?,'pending',?,?,?)")
        .run(id, p.id, p.attempt_id, input.sha256, JSON.stringify(input.question), Date.now(), ttl.state === 'configured' ? ttl.value : null, input.scopeChange ? serializeScopeChange(input.scopeChange) : null);
      checkpoint(db, p.id, 'human');
      db.prepare("UPDATE attempts SET suspension='HUMAN_DECISION' WHERE id=?").run(p.attempt_id);
      event(p, 'question-raised', null);
      return { ...input, questionId: id } satisfies QuestionRecord;
    }),
    recordAnswer: (handle, questionId, answer, operationId) => atomic(() => {
      const p = row(handle); const q = readQuestionRow(db, p.attempt_id, questionId);
      if (!Value.Check(OperationId, operationId) || !answer.trim() || answer.length > 8192 || p.state !== 'ready') throw new ExecutionError('INPUT_INVALID');
      if (q.passage_id !== p.id) throw new ExecutionError('ANSWER_CONFLICT');
      if (q.answer_operation_id && (q.answer_operation_id !== operationId || q.answer !== answer)) throw new ExecutionError('ANSWER_CONFLICT');
      if (['expired','cancelled'].includes(q.state)) throw new ExecutionError('ANSWER_CONFLICT');
      if (!q.answer_operation_id) recordAnswer(db, { attemptId: p.attempt_id, questionId, operationId, expectedRevision: questionETag(q), body: { answer } });
      return { operationId, questionId, answer, state: q.state === 'delivered' ? 'delivered' : ['delivery_unknown','sending'].includes(q.state) ? 'delivery_unknown' : 'recorded',
        ...(q.scope_json ? { scopeDigest: (JSON.parse(q.scope_json) as ScopeChange).capturedDigest } : {}) };
    }),
    claimAnswer: (handle, operationId) => claimAnswer(db, handle.passageId, operationId),
    confirmAnswer: (handle, operationId, state) => atomic(() => {
      const p = row(handle);
      expireLimits(db);
      const q = db.prepare<[string, string], { id: string; answer: string; state: AnswerRecord['state'] }>('SELECT id,answer,state FROM execution_questions WHERE passage_id=? AND answer_operation_id=?').get(p.id, operationId);
      if (!q || p.state !== 'ready' || readAttempt(db, p.attempt_id).result || !['recorded','sending','delivery_unknown','delivered'].includes(q.state)) throw new ExecutionError('ANSWER_CONFLICT');
      if (q.state === 'delivered') return { operationId, questionId: q.id, answer: q.answer, state: 'delivered' };
      if (q.state === 'delivery_unknown' && state === 'delivery_unknown') return { operationId, questionId: q.id, answer: q.answer, state };
      if (state === 'recorded') throw new ExecutionError('ANSWER_CONFLICT');
      if (state === 'delivered' && q.state === 'recorded') throw new ExecutionError('ANSWER_CONFLICT');
      const receipt = state === 'delivered' ? JSON.stringify({ operationId, questionId: q.id, passageId: p.id, receivedAtMs: Date.now() }) : null;
      db.prepare('UPDATE execution_questions SET state=?,receipt_json=?,revision=revision+1 WHERE id=?').run(state, receipt, q.id);
      if (state === 'delivered' && !db.prepare("SELECT id FROM execution_questions WHERE attempt_id=? AND state NOT IN ('delivered','cancelled')").get(p.attempt_id)) {
        const cleared = db.prepare("UPDATE attempts SET suspension=NULL WHERE id=? AND suspension='HUMAN_DECISION'").run(p.attempt_id);
        checkpoint(db, p.id, cleared.changes === 1 ? 'active' : 'stopped');
      }
      event(p, 'question-answer-receipt', null);
      return { operationId, questionId: q.id, answer: q.answer, state };
    }),
    recordCancellation: (attemptId, operationId) => atomic(() => {
      if (!Value.Check(OperationId, operationId)) throw new ExecutionError('INPUT_INVALID');
      const attempt = readAttempt(db, attemptId);
      if (!attempt.result) {
        stopQuestions(db, attemptId);
        for (const p of db.prepare<[string], { id: string }>('SELECT id FROM passages WHERE attempt_id=?').all(attemptId)) checkpoint(db, p.id, 'stopped');
        db.prepare("UPDATE attempts SET phase='finished',result='cancelled',suspension=NULL,revision=revision+1,updated_at_ms=? WHERE id=?").run(Date.now(), attemptId);
        db.prepare("UPDATE passages SET state='cancelled',tracking_state='lost',diagnostic='CANCELLED' WHERE attempt_id=?").run(attemptId);
        attemptEvent(db, attemptId, 'attempt.cancelled');
      }
      // One handle for each physical factory terminal, including known pending launches.
      return db.prepare<[string], PassageHandle>("SELECT passage_id AS passageId FROM resources WHERE attempt_id=? AND kind='terminal' AND stop_state<>'confirmed' AND (owned=1 OR launch_state<>'planned')").all(attemptId);
    }),
    recordStop: (handle, receipt) => atomic(() => {
      const p = row(handle);
      if (receipt.passageId !== p.id) throw new ExecutionError('INPUT_INVALID');
      if (p.managed_terminal_id) {
        db.prepare(`UPDATE resources SET stop_state=?,diagnostic=?,launch_state=CASE WHEN ?='requested' THEN launch_state ELSE 'partial' END
          WHERE kind='terminal' AND stop_state<>'confirmed' AND passage_id IN (
            SELECT managed_passage.id FROM passages managed_passage JOIN attempt_sessions managed_session ON managed_session.id=managed_passage.attempt_session_id
            WHERE managed_session.managed_terminal_id=? AND managed_session.id=? AND managed_passage.round_number<=?
          )`).run(receipt.state, receipt.state === 'uncertain' ? 'STOP_UNCONFIRMED' : receipt.state === 'requested' ? 'STOP_REQUESTED' : null,
            receipt.state, p.managed_terminal_id, p.attempt_session_id, p.round_number);
      } else {
        db.prepare("UPDATE resources SET stop_state=?,diagnostic=?,launch_state=CASE WHEN ?='requested' THEN launch_state ELSE 'partial' END WHERE attempt_id=? AND reference=? AND kind='terminal' AND stop_state<>'confirmed'")
          .run(receipt.state, receipt.state === 'uncertain' ? 'STOP_UNCONFIRMED' : receipt.state === 'requested' ? 'STOP_REQUESTED' : null, receipt.state, p.attempt_id, p.terminal_name);
      }
      const occupancy = db.prepare<[string], { id: string; managed_terminal_id: string; attempt_session_id: string; generation: number; state: string }>(
        "SELECT id,managed_terminal_id,attempt_session_id,generation,state FROM terminal_occupancies WHERE passage_id=? AND state IN ('occupied','uncertain') ORDER BY generation DESC LIMIT 1",
      ).get(p.id);
      if (occupancy && receipt.state !== 'requested') {
        if (receipt.state === 'confirmed') {
          db.prepare("UPDATE terminal_occupancies SET state='released',released_at_ms=?,reason='STOP_CONFIRMED' WHERE id=?").run(Date.now(), occupancy.id);
          db.prepare("UPDATE managed_terminals SET state='available',updated_at_ms=? WHERE id=? AND generation=?").run(Date.now(), occupancy.managed_terminal_id, occupancy.generation);
        } else {
          db.prepare("UPDATE terminal_occupancies SET state='uncertain',reason='STOP_UNCONFIRMED' WHERE id=?").run(occupancy.id);
          db.prepare("UPDATE managed_terminals SET state='uncertain',updated_at_ms=? WHERE id=? AND generation=?").run(Date.now(), occupancy.managed_terminal_id, occupancy.generation);
        }
        db.prepare("UPDATE attempt_sessions SET state=CASE WHEN state IN ('uncertain','interrupted') THEN state ELSE ? END,updated_at_ms=? WHERE id=?")
          .run(receipt.state === 'confirmed' ? 'completed' : 'uncertain', Date.now(), occupancy.attempt_session_id);
      }
      event(p, 'cleanup-updated', null);
    }),
  };
}
import { serializeScopeChange } from './configuration-json.js';
