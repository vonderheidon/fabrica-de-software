import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { OperationId } from '#contracts';
import { OperationError } from './operations.js';

export interface RetainedHistoryMigrationCandidate {
  attemptId: string;
  projectId: string;
  repositoryId: string;
  issueId: string;
  issueNumber: number;
  hasLegacyDeliveries: boolean;
}

export interface RetainedHistoryMigrationInput {
  attemptId: string;
  projectId: string;
  repositoryId: string;
  issueId: string;
  issueNumber: number;
  sourceIdentityJson: string;
  refsSha256: string;
  refCount: number;
}

export interface RetainedHistoryMigrationRow extends RetainedHistoryMigrationInput {
  sourceRelative: string;
  destinationRelative: string;
  destinationIdentityJson: string | null;
  state: 'copying' | 'blocked' | 'verified';
  reason: string | null;
}
interface CandidateRow extends Omit<RetainedHistoryMigrationCandidate, 'hasLegacyDeliveries'> { hasLegacyDeliveries: number }

function row(db: Database.Database, attemptId: string): RetainedHistoryMigrationRow | undefined {
  return db.prepare<[string], RetainedHistoryMigrationRow>(`SELECT attempt_id AS attemptId,project_id AS projectId,
    repository_id AS repositoryId,issue_id AS issueId,issue_number AS issueNumber,source_relative AS sourceRelative,
    destination_relative AS destinationRelative,source_identity_json AS sourceIdentityJson,refs_sha256 AS refsSha256,
    ref_count AS refCount,destination_identity_json AS destinationIdentityJson,state,reason
    FROM retained_history_migrations WHERE attempt_id=?`).get(attemptId);
}

function validIdentity(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
    const identity = parsed as Record<string, unknown>;
    return typeof identity.device === 'string' && /^\d{1,128}$/.test(identity.device) &&
      typeof identity.inode === 'string' && /^\d{1,128}$/.test(identity.inode);
  } catch { return false; }
}

export function createRetainedHistoryMigrations(db: Database.Database) {
  function candidates(currentAttemptId: string): RetainedHistoryMigrationCandidate[] {
    if (!Value.Check(OperationId, currentAttemptId)) throw new OperationError(400, 'ATTEMPT_ID_INVALID', 'Attempt ID is invalid.');
    const current = db.prepare<[string], { project_id: string; repository_id: string; issue_id: string }>(
      'SELECT project_id,repository_id,issue_id FROM attempts WHERE id=?',
    ).get(currentAttemptId);
    if (!current) throw new OperationError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found.');
    if (db.prepare<[string,string,string,string], { id: string }>(`SELECT id FROM attempts WHERE project_id=? AND repository_id=?
      AND issue_id=? AND id<>? AND result IS NULL LIMIT 1`).get(current.project_id,current.repository_id,current.issue_id,currentAttemptId)) {
      throw new OperationError(409, 'RETAINED_HISTORY_ATTEMPT_ACTIVE', 'Another attempt for this issue is not terminal.');
    }
    return db.prepare<[string,string,string,string], CandidateRow>(`SELECT a.id AS attemptId,
      a.project_id AS projectId,a.repository_id AS repositoryId,a.issue_id AS issueId,a.issue_number AS issueNumber,
      EXISTS(SELECT 1 FROM deliveries d WHERE d.attempt_id=a.id AND d.history_repository_relative IS NULL) AS hasLegacyDeliveries
      FROM attempts a WHERE a.project_id=? AND a.repository_id=? AND a.issue_id=? AND a.id<>?
      AND (EXISTS(SELECT 1 FROM deliveries d WHERE d.attempt_id=a.id AND d.history_repository_relative IS NULL)
        OR EXISTS(SELECT 1 FROM retained_history_migrations m WHERE m.attempt_id=a.id))
      ORDER BY a.created_at_ms,a.id`).all(current.project_id,current.repository_id,current.issue_id,currentAttemptId)
      .map(value => ({ ...value, hasLegacyDeliveries: value.hasLegacyDeliveries === 1 }));
  }

  function get(attemptId: string): RetainedHistoryMigrationRow | null {
    if (!Value.Check(OperationId, attemptId)) throw new OperationError(400, 'ATTEMPT_ID_INVALID', 'Attempt ID is invalid.');
    return row(db, attemptId) ?? null;
  }

  function begin(input: RetainedHistoryMigrationInput): void {
    if (!Value.Check(OperationId, input.attemptId) || !Value.Check(OperationId, input.projectId) ||
        !input.repositoryId || input.repositoryId.length > 1024 || !input.issueId || input.issueId.length > 1024 ||
        /[\x00-\x1f\x7f]/.test(input.repositoryId + input.issueId) || !Number.isSafeInteger(input.issueNumber) || input.issueNumber < 1 ||
        !/^[a-f0-9]{64}$/.test(input.refsSha256) || !Number.isSafeInteger(input.refCount) || input.refCount < 0 ||
        input.refCount > 100_000 || !validIdentity(input.sourceIdentityJson)) {
      throw new OperationError(400, 'RETAINED_HISTORY_MIGRATION_INVALID', 'The retained history migration input is invalid.');
    }
    db.transaction(() => {
      const attempt = db.prepare<[string], { project_id: string; repository_id: string; issue_id: string; issue_number: number }>(
        'SELECT project_id,repository_id,issue_id,issue_number FROM attempts WHERE id=?',
      ).get(input.attemptId);
      if (!attempt || attempt.project_id !== input.projectId || attempt.repository_id !== input.repositoryId ||
          attempt.issue_id !== input.issueId || attempt.issue_number !== input.issueNumber) {
        throw new OperationError(409, 'RETAINED_HISTORY_IDENTITY_CHANGED', 'The attempt no longer matches its registered issue.');
      }
      const existing = row(db, input.attemptId);
      const sourceRelative = `git/${input.attemptId}.git`;
      const destinationRelative = `issues/${input.issueNumber}/history.git`;
      if (existing) {
        if (existing.projectId !== input.projectId || existing.repositoryId !== input.repositoryId || existing.issueId !== input.issueId ||
            existing.issueNumber !== input.issueNumber || existing.sourceIdentityJson !== input.sourceIdentityJson ||
            existing.refsSha256 !== input.refsSha256 || existing.refCount !== input.refCount ||
            existing.sourceRelative !== sourceRelative || existing.destinationRelative !== destinationRelative) {
          throw new OperationError(409, 'RETAINED_HISTORY_SOURCE_CHANGED', 'The registered source repository changed during migration.');
        }
        if (existing.state === 'blocked') throw new OperationError(409, 'RETAINED_HISTORY_MIGRATION_BLOCKED', 'The retained history migration requires reconciliation.');
        return;
      }
      const now = Date.now();
      db.prepare(`INSERT INTO retained_history_migrations(attempt_id,project_id,repository_id,issue_id,issue_number,source_relative,
        destination_relative,source_identity_json,refs_sha256,ref_count,destination_identity_json,state,reason,revision,created_at_ms,updated_at_ms)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL,'copying',NULL,1,?,?)`).run(input.attemptId,input.projectId,input.repositoryId,input.issueId,
        input.issueNumber,sourceRelative,destinationRelative,input.sourceIdentityJson,input.refsSha256,input.refCount,now,now);
    }).immediate();
  }

  function recordDestinationIdentity(attemptId: string, identity: string): void {
    if (!validIdentity(identity)) throw new OperationError(400, 'RETAINED_HISTORY_IDENTITY_INVALID', 'The repository identity is invalid.');
    db.transaction(() => {
      const current = row(db, attemptId);
      if (!current || current.state !== 'copying') throw new OperationError(409, 'RETAINED_HISTORY_MIGRATION_STALE', 'The retained history migration is no longer active.');
      if (current.destinationIdentityJson && current.destinationIdentityJson !== identity) {
        throw new OperationError(409, 'RETAINED_HISTORY_DESTINATION_CHANGED', 'The destination repository changed during migration.');
      }
      if (!current.destinationIdentityJson) db.prepare(`UPDATE retained_history_migrations SET destination_identity_json=?,revision=revision+1,updated_at_ms=?
        WHERE attempt_id=? AND state='copying' AND destination_identity_json IS NULL`).run(identity,Date.now(),attemptId);
    }).immediate();
  }

  function block(attemptId: string, reason: string): void {
    if (!/^[A-Z0-9_]{1,100}$/.test(reason)) throw new Error('RETAINED_HISTORY_REASON_INVALID');
    db.prepare(`UPDATE retained_history_migrations SET state='blocked',reason=?,revision=revision+1,updated_at_ms=?
      WHERE attempt_id=? AND state='copying'`).run(reason,Date.now(),attemptId);
  }

  function complete(attemptId: string, refsSha256: string, refCount: number, destinationIdentity: string): void {
    db.transaction(() => {
      const current = row(db, attemptId);
      if (!current) throw new OperationError(409, 'RETAINED_HISTORY_MIGRATION_MISSING', 'The retained history migration journal is missing.');
      if (current.state === 'verified') return;
      if (current.state !== 'copying' || current.refsSha256 !== refsSha256 || current.refCount !== refCount ||
          current.destinationIdentityJson !== destinationIdentity) {
        throw new OperationError(409, 'RETAINED_HISTORY_MIGRATION_STALE', 'The retained history migration changed before verification.');
      }
      const conflict = db.prepare<[string,string], { id: string }>(`SELECT id FROM deliveries WHERE attempt_id=?
        AND history_repository_relative IS NOT NULL AND history_repository_relative<>? LIMIT 1`).get(attemptId,current.destinationRelative);
      if (conflict) throw new OperationError(409, 'RETAINED_HISTORY_DELIVERY_CONFLICT', 'A delivery already points to another repository.');
      db.prepare(`UPDATE deliveries SET history_repository_relative=? WHERE attempt_id=? AND history_repository_relative IS NULL`)
        .run(current.destinationRelative,attemptId);
      db.prepare(`UPDATE retained_history_migrations SET state='verified',reason=NULL,revision=revision+1,updated_at_ms=?
        WHERE attempt_id=? AND state='copying'`).run(Date.now(),attemptId);
    }).immediate();
  }

  return { candidates, get, begin, recordDestinationIdentity, block, complete };
}
