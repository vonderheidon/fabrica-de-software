import type Database from 'better-sqlite3';

/** Disposable migration fixtures only; this never downgrades an installation. */
export function removeSessionContinuitySchema(db: Database.Database): void {
  if (db.pragma('user_version', { simple: true }) === 34) {
    db.exec(`DROP TRIGGER managed_terminal_live_conversation;
      DROP TRIGGER attempt_session_continuity_lost;
      DROP TRIGGER passage_source_binding;
      CREATE TRIGGER passage_source_binding BEFORE INSERT ON passages WHEN NEW.session_source_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM passages p WHERE p.id=NEW.session_source_id AND p.attempt_id=NEW.attempt_id
          AND p.role='implementer' AND NEW.role='implementer' AND p.round_number=NEW.round_number-1
      ) BEGIN SELECT RAISE(ABORT,'CONTINUATION_BINDING_INVALID'); END;
      DELETE FROM schema_migrations WHERE version=34; PRAGMA user_version=33;`);
  }
}
export function removeManagedTerminalSchema(db: Database.Database): void {
  removeSessionContinuitySchema(db);
  if (db.pragma('user_version', { simple: true }) !== 33) return;
  db.exec(`DROP TRIGGER terminal_occupancies_delete_guard;
    DROP TRIGGER attempt_sessions_delete_guard;
    DROP TRIGGER managed_terminals_delete_immutable;
    DROP TRIGGER terminal_occupancy_state_monotonic;
    DROP TRIGGER attempt_session_omp_identity_immutable;
    DROP TRIGGER managed_terminal_physical_identity_immutable;
    DROP TRIGGER terminal_occupancy_terminal_binding;
    DROP TRIGGER terminal_occupancy_identity_immutable;
    DROP TRIGGER attempt_session_identity_immutable;
    DROP TRIGGER attempt_session_terminal_generation;
    DROP TRIGGER attempt_session_terminal_reassignment;
    DROP TRIGGER passage_attempt_session_immutable;
    DROP TRIGGER passage_attempt_session_binding;
    DROP INDEX terminal_occupancies_attempt;
    DROP INDEX terminal_occupancies_session_active;
    DROP INDEX terminal_occupancies_terminal_active;
    DROP INDEX passages_attempt_session;
    DROP INDEX attempt_sessions_omp_identity;
    DROP INDEX attempt_sessions_terminal;
    DROP INDEX managed_terminals_physical_identity;
    DROP INDEX managed_terminals_role_state;
    UPDATE passages SET attempt_session_id=NULL;
    DELETE FROM terminal_occupancies;
    DELETE FROM attempt_sessions;
    DELETE FROM managed_terminals;
    DROP TABLE terminal_occupancies;
    DROP TABLE attempt_sessions;
    ALTER TABLE passages DROP COLUMN attempt_session_id;
    DROP TABLE managed_terminals;
    DELETE FROM schema_migrations WHERE version=33;
    PRAGMA user_version=32;`);
}
