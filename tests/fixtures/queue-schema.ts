import type Database from 'better-sqlite3';

/** Temporary historical fixture only; production never downgrades. */
export function removeQueueSchedulerSchema(db: Database.Database): void {
  db.exec(`DROP TABLE queue_consumptions;
    DROP INDEX attempts_active_automatic_account; DROP INDEX attempts_issue_history; DROP TRIGGER attempts_source_immutable; DROP TRIGGER attempts_source_required;
    ALTER TABLE attempts DROP COLUMN source;
    ALTER TABLE queue_cycles DROP COLUMN ready_exit_observed_at_ms;
    ALTER TABLE queue_cycles DROP COLUMN ready_return_observed_at_ms;
    DELETE FROM schema_migrations WHERE version=16; PRAGMA user_version=15;`);
}
