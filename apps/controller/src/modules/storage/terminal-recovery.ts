import { hostname } from 'node:os';
import type Database from 'better-sqlite3';
import { OperationError } from './operations.js';

export interface TerminalRecoveryCandidate {
  id: string; workspaceId: string | null; terminalId: string | null; terminalName: string;
  generation: number; state: string; updatedAtMs: number;
}

export function terminalRecoveryCandidates(db: Database.Database): TerminalRecoveryCandidate[] {
  return db.prepare<[string], TerminalRecoveryCandidate>(`SELECT t.id,t.workspace_id AS workspaceId,t.terminal_id AS terminalId,
    t.terminal_name AS terminalName,t.generation,t.state,t.updated_at_ms AS updatedAtMs
    FROM managed_terminals t JOIN factory_settings f ON f.installation_id=t.installation_id
    WHERE t.host_name=? AND t.owner='factory' AND (t.state IN ('available','uncertain','occupied') OR
      (t.state='planned' AND EXISTS (SELECT 1 FROM terminal_occupancies o WHERE o.managed_terminal_id=t.id AND o.state IN ('occupied','uncertain'))))
      AND NOT EXISTS (SELECT 1 FROM attempt_sessions s JOIN attempts a ON a.id=s.attempt_id
        WHERE s.managed_terminal_id=t.id AND a.result IS NULL)
    ORDER BY t.updated_at_ms DESC,t.id`).all(hostname());
}

export function reconcileTerminalAvailability(db: Database.Database, candidate: TerminalRecoveryCandidate, observation: 'stopped' | 'missing'): void {
  db.transaction(() => {
    const current = terminalRecoveryCandidates(db).find(item => item.id === candidate.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(candidate)) {
      throw new OperationError(409, 'TERMINAL_AVAILABILITY_UNCONFIRMED', 'O terminal mudou durante a conferência. Consulte novamente antes de iniciar.');
    }
    // Availability permits a new session; it grants no cleanup authority over previous writers.
    db.prepare("UPDATE terminal_occupancies SET state='released',released_at_ms=?,reason=? WHERE managed_terminal_id=? AND generation=? AND state IN ('occupied','uncertain')")
      .run(Date.now(), observation === 'missing' ? 'TERMINAL_ABSENCE_CONFIRMED' : 'AVAILABILITY_CONFIRMED', candidate.id, candidate.generation);
    db.prepare("UPDATE attempt_sessions SET state='interrupted',updated_at_ms=? WHERE managed_terminal_id=? AND state IN ('active','reserved','uncertain')")
      .run(Date.now(), candidate.id);
    db.prepare('UPDATE managed_terminals SET state=?,observed_at_ms=?,updated_at_ms=? WHERE id=?')
      .run(observation === 'missing' ? 'retired' : 'available', Date.now(), Date.now(), candidate.id);
  }).immediate();
}
