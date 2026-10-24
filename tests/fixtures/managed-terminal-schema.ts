import type Database from 'better-sqlite3';

/** Disposable migration fixtures only; this never downgrades an installation. */
export function removeAttemptDecisionSchema(db: Database.Database): void {
  if (db.pragma('user_version', { simple: true }) === 42) {
    db.exec(`DROP TRIGGER effect_transition;
      CREATE TRIGGER effect_transition BEFORE UPDATE OF state ON effects WHEN NOT (
        (OLD.state='not_started' AND NEW.state IN ('running','failed_known','not_applicable')) OR
        (OLD.state='running' AND NEW.state IN ('confirmed','failed_known','unknown','not_applicable')) OR
        (OLD.state='unknown' AND NEW.state IN ('confirmed','not_applicable')) OR
        (OLD.state='failed_known' AND NEW.state IN ('running','not_applicable'))
      ) BEGIN SELECT RAISE(ABORT,'EFFECT_TRANSITION_INVALID'); END;
      DELETE FROM schema_migrations WHERE version=42; PRAGMA user_version=41;`);
  }
  if (db.pragma('user_version', { simple: true }) === 41) {
    db.exec(`DROP TABLE delivery_targets; DELETE FROM schema_migrations WHERE version=41; PRAGMA user_version=40;`);
  }
  if (db.pragma('user_version', { simple: true }) === 40) {
    db.exec(`DROP TABLE publication_target_selections; DELETE FROM schema_migrations WHERE version=40; PRAGMA user_version=39;`);
  }
  if (db.pragma('user_version', { simple: true }) === 39) {
    db.exec(`DROP TRIGGER attempt_decision_binding; DROP TRIGGER attempt_decision_immutable; DROP TRIGGER attempt_decision_delete;
      DROP INDEX attempt_decisions_attempt; DROP INDEX attempt_decisions_delivery; DROP TABLE attempt_decisions;
      DELETE FROM schema_migrations WHERE version=39; PRAGMA user_version=38;`);
  }
}
export function removeFindingDisputesSchema(db: Database.Database): void {
  removeAttemptDecisionSchema(db);
  if (db.pragma('user_version', { simple: true }) === 38) {
    db.exec(`DROP TRIGGER review_disputes_complete; DROP TABLE finding_disputes; DROP INDEX deliveries_dispute_binding;
      DELETE FROM schema_migrations WHERE version=38; PRAGMA user_version=37;`);
  }
}
export function removeSessionContinuitySchema(db: Database.Database): void {
  removeFindingDisputesSchema(db);
  if (db.pragma('user_version', { simple: true }) === 37) {
    db.exec(`DROP TABLE finding_assessments; DROP TABLE attempt_blocks; DELETE FROM schema_migrations WHERE version=37; PRAGMA user_version=36;`);
  }
  if (db.pragma('user_version', { simple: true }) === 36) {
    db.exec(`DROP TRIGGER review_complete_approval_guard;
      DROP TRIGGER check_repeat_reason_required;
      DROP TRIGGER check_repeat_reason_immutable;
      ALTER TABLE checks DROP COLUMN repeat_reason;
      DELETE FROM schema_migrations WHERE version=36; PRAGMA user_version=35;`);
  }
  if (db.pragma('user_version', { simple: true }) === 35) {
    db.exec(`DROP TRIGGER finding_origin_binding;
      ALTER TABLE findings DROP COLUMN origin_finding_id;
      ALTER TABLE findings DROP COLUMN priority;
      DELETE FROM schema_migrations WHERE version=35; PRAGMA user_version=34;`);
  }
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
