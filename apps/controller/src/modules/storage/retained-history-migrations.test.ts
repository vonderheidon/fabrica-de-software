import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createRetainedHistoryMigrations } from './retained-history-migrations.js';

const databases: Database.Database[] = [];
function fixture() {
  const db = new Database(':memory:'); databases.push(db);
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY);
    CREATE TABLE attempts(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), repository_id TEXT NOT NULL,
      issue_id TEXT NOT NULL, issue_number INTEGER NOT NULL, result TEXT, created_at_ms INTEGER NOT NULL, UNIQUE(id,project_id));
    CREATE TABLE deliveries(id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), repository_relative TEXT NOT NULL);
    CREATE TABLE project_deletions(operation_id TEXT, project_id TEXT, worker_generation INTEGER, worker_token TEXT, state TEXT);`);
  db.exec(readFileSync(resolve('resources/storage/055_issue_history_repository_reference.sql'), 'utf8'));
  const store = createRetainedHistoryMigrations(db);
  const projectId = randomUUID(); const oldAttemptId = randomUUID(); const currentAttemptId = randomUUID();
  db.prepare('INSERT INTO projects(id) VALUES (?)').run(projectId);
  const insertAttempt = db.prepare(`INSERT INTO attempts(id,project_id,repository_id,issue_id,issue_number,result,created_at_ms)
    VALUES (?,?,?,?,?,?,?)`);
  insertAttempt.run(oldAttemptId,projectId,'R_fixture','I_fixture',17,'interrupted',1);
  insertAttempt.run(currentAttemptId,projectId,'R_fixture','I_fixture',17,null,2);
  db.prepare('INSERT INTO deliveries(id,attempt_id,repository_relative) VALUES (?,?,?)')
    .run(randomUUID(),oldAttemptId,`git/${oldAttemptId}.git`);
  return { db, store, projectId, oldAttemptId, currentAttemptId };
}
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

describe('retained history migration journal', () => {
  it('does not nominate attempts with no delivery or migration journal before workspace allocation', () => {
    const f = fixture();
    f.db.prepare('DELETE FROM deliveries WHERE attempt_id=?').run(f.oldAttemptId);
    expect(f.store.candidates(f.currentAttemptId)).toEqual([]);
  });

  it('publishes delivery references only after verified copy and resumes the same journal idempotently', () => {
    const f = fixture();
    expect(f.store.candidates(f.currentAttemptId)).toEqual([{ attemptId: f.oldAttemptId, projectId: f.projectId,
      repositoryId: 'R_fixture', issueId: 'I_fixture', issueNumber: 17, hasLegacyDeliveries: true }]);
    const input = { attemptId: f.oldAttemptId, projectId: f.projectId, repositoryId: 'R_fixture', issueId: 'I_fixture', issueNumber: 17,
      sourceIdentityJson: JSON.stringify({ device: '1', inode: '2' }), refsSha256: 'a'.repeat(64), refCount: 2 };
    f.store.begin(input);
    expect(f.store.get(f.oldAttemptId)?.state).toBe('copying');
    expect(() => f.db.prepare(`INSERT INTO project_deletions(operation_id,project_id,worker_generation,worker_token,state)
      VALUES (?, ?, 1, 'worker', 'accepted')`).run(randomUUID(),f.projectId)).toThrow('PROJECT_DELETION_BLOCKED_BY_HISTORY_MIGRATION');
    expect(f.db.prepare('SELECT history_repository_relative FROM deliveries WHERE attempt_id=?').get(f.oldAttemptId))
      .toEqual({ history_repository_relative: null });
    const destinationIdentity = JSON.stringify({ device: '1', inode: '3' });
    f.store.recordDestinationIdentity(f.oldAttemptId,destinationIdentity);
    f.store.complete(f.oldAttemptId,input.refsSha256,input.refCount,destinationIdentity);
    expect(f.db.prepare('SELECT history_repository_relative FROM deliveries WHERE attempt_id=?').get(f.oldAttemptId))
      .toEqual({ history_repository_relative: 'issues/17/history.git' });
    expect(f.store.get(f.oldAttemptId)?.state).toBe('verified');
    expect(() => f.store.complete(f.oldAttemptId,input.refsSha256,input.refCount,destinationIdentity)).not.toThrow();
  });

  it('rejects a changed source manifest and prevents concurrent issue writers from entering migration', () => {
    const f = fixture();
    const input = { attemptId: f.oldAttemptId, projectId: f.projectId, repositoryId: 'R_fixture', issueId: 'I_fixture', issueNumber: 17,
      sourceIdentityJson: JSON.stringify({ device: '1', inode: '2' }), refsSha256: 'a'.repeat(64), refCount: 1 };
    f.store.begin(input);
    expect(() => f.store.begin({ ...input, refsSha256: 'b'.repeat(64) })).toThrowError(expect.objectContaining({ code: 'RETAINED_HISTORY_SOURCE_CHANGED' }));
    const activeAttemptId = randomUUID();
    f.db.prepare(`INSERT INTO attempts(id,project_id,repository_id,issue_id,issue_number,result,created_at_ms)
      VALUES (?,?, 'R_fixture','I_fixture',17,NULL,3)`).run(activeAttemptId,f.projectId);
    expect(() => f.store.candidates(f.currentAttemptId)).toThrowError(expect.objectContaining({ code: 'RETAINED_HISTORY_ATTEMPT_ACTIVE' }));
  });
});
