import type Database from 'better-sqlite3';
import { removeQuestionSchema } from './question-schema.js';

/** Temporary test databases only: reconstruct v7 before exercising an actual upgrade. */
export function removeReviewSchema(db: Database.Database): void {
  removeQuestionSchema(db);
  db.exec(`DROP TABLE finding_resolutions; DROP TABLE findings; DROP TABLE reviews;
    DROP INDEX verification_review_binding; DROP INDEX passages_review_binding;
    DROP TRIGGER passage_source_binding; DROP TRIGGER passage_source_immutable;
    ALTER TABLE passages DROP COLUMN session_source_id;
    DELETE FROM schema_migrations WHERE version=8; PRAGMA user_version=7;`);
}
