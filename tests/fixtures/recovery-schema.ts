import type Database from 'better-sqlite3';
import { removePublicationSchema } from './publication-schema.js';

/** Temporary fixture downgrade only; production migrations remain forward-only. */
export function removeRecoverySchema(db: Database.Database): void {
  removePublicationSchema(db);
  db.exec(`DROP TABLE native_open_requests; DROP TABLE resource_removals; DROP TABLE cancellation_requests;
    DROP TRIGGER resource_revision; DROP TRIGGER resource_removal_terminal;
    ALTER TABLE resources DROP COLUMN removed; ALTER TABLE resources DROP COLUMN revision;
    DELETE FROM schema_migrations WHERE version=10; PRAGMA user_version=9;`);
}
