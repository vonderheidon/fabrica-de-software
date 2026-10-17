import type Database from 'better-sqlite3';
import { removeQueueSchedulerSchema } from './queue-schema.js';

/** Reconstruct a temporary v10 fixture only. Production never downgrades a database. */
export function removePublicationSchema(db: Database.Database): void {
  removeQueueSchedulerSchema(db);
  db.exec(`DROP TABLE IF EXISTS publication_upgrades; DROP TABLE IF EXISTS creation_steps; DROP TABLE IF EXISTS project_creations; DROP TABLE IF EXISTS queue_cycles; DROP TABLE publication_requests; DROP TABLE effects; DROP TABLE attempt_authority; DROP TABLE controller_authority;
    DROP INDEX deliveries_effect_binding; DROP INDEX attempts_account_created; DROP INDEX questions_attempt_created;
    DELETE FROM schema_migrations WHERE version>=11; PRAGMA user_version=10;`);
}
