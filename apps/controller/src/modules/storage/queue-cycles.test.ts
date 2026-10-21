import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { consumeQueueCycle, readQueueCycle, recordQueueObservations } from './queue-cycles.js';

describe('durable Ready cycles', () => {
  let database: Database.Database | null = null;
  afterEach(() => { if (database?.open) database.close(); database = null; });

  it('rearms only after observing an exit from Ready and a later eligible Ready snapshot', () => {
    database = new Database(':memory:');
    database.exec(`CREATE TABLE attempts(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,project_id TEXT NOT NULL,issue_id TEXT NOT NULL);
      CREATE TABLE project_deletions(project_id TEXT PRIMARY KEY,operation_id TEXT NOT NULL);
      CREATE TABLE queue_cycles(ready_exit_observed_at_ms INTEGER,ready_return_observed_at_ms INTEGER,account_id TEXT NOT NULL,project_id TEXT NOT NULL,issue_id TEXT NOT NULL,cycle_number INTEGER NOT NULL,
        last_ready INTEGER NOT NULL,consumed_attempt_id TEXT,updated_at_ms INTEGER NOT NULL,last_eligible INTEGER,observed_ordinal INTEGER,PRIMARY KEY(account_id,project_id,issue_id));
      INSERT INTO attempts(id,account_id,project_id,issue_id) VALUES ('attempt-first','account-one','project-one','issue-one');
      INSERT INTO queue_cycles(account_id,project_id,issue_id,cycle_number,last_ready,consumed_attempt_id,updated_at_ms)
        VALUES ('account-one','project-one','issue-one',1,1,'attempt-first',0);`);

    const observation = (ready: boolean, eligible: boolean) => recordQueueObservations(database!, [{
      accountId: 'account-one', projectId: 'project-one', issueId: 'issue-one', ready, eligible, existingAttemptId: 'attempt-first',
    }]);

    observation(false, false);
    expect(readQueueCycle(database, 'account-one', 'project-one', 'issue-one')).toMatchObject({ cycleNumber: 1, ready: false, consumedAttemptId: 'attempt-first' });
    observation(true, false);
    expect(readQueueCycle(database, 'account-one', 'project-one', 'issue-one')).toMatchObject({ cycleNumber: 1, ready: false, consumedAttemptId: 'attempt-first' });
    observation(true, true);
    expect(readQueueCycle(database, 'account-one', 'project-one', 'issue-one')).toMatchObject({ cycleNumber: 2, ready: true, consumedAttemptId: null });
    observation(true, true);
    expect(readQueueCycle(database, 'account-one', 'project-one', 'issue-one')).toMatchObject({ cycleNumber: 2, ready: true, consumedAttemptId: null });
  });

  it('consumes one ready cycle once and preserves the linked attempt identity', () => {
    database = new Database(':memory:');
    database.exec(`CREATE TABLE attempts(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,project_id TEXT NOT NULL,issue_id TEXT NOT NULL,repository_id TEXT DEFAULT 'repo');
      CREATE TABLE project_deletions(project_id TEXT PRIMARY KEY,operation_id TEXT NOT NULL);
      CREATE TABLE queue_consumptions(id TEXT,account_id TEXT,project_id TEXT,repository_id TEXT,issue_id TEXT,observed_cycle INTEGER,ready_exit_observed_at_ms INTEGER,ready_return_observed_at_ms INTEGER,consumed_at_ms INTEGER,attempt_id TEXT);
      CREATE TABLE projects(id TEXT,current_revision_id TEXT); CREATE TABLE project_revisions(id TEXT,repository_id TEXT);
      CREATE TABLE queue_cycles(ready_exit_observed_at_ms INTEGER,ready_return_observed_at_ms INTEGER,account_id TEXT NOT NULL,project_id TEXT NOT NULL,issue_id TEXT NOT NULL,cycle_number INTEGER NOT NULL,
        last_ready INTEGER NOT NULL,consumed_attempt_id TEXT,updated_at_ms INTEGER NOT NULL,PRIMARY KEY(account_id,project_id,issue_id));
      INSERT INTO attempts(id,account_id,project_id,issue_id) VALUES ('attempt-next','account-one','project-one','issue-one');
      INSERT INTO queue_cycles(account_id,project_id,issue_id,cycle_number,last_ready,consumed_attempt_id,updated_at_ms)
        VALUES ('account-one','project-one','issue-one',2,1,NULL,0);`);

    consumeQueueCycle(database, 'account-one', 'project-one', 'issue-one', 2, 'attempt-next');
    expect(readQueueCycle(database, 'account-one', 'project-one', 'issue-one')).toMatchObject({ cycleNumber: 2, ready: true, consumedAttemptId: 'attempt-next' });
    expect(() => consumeQueueCycle(database!, 'account-one', 'project-one', 'issue-one', 2, 'attempt-next')).toThrowError(expect.objectContaining({ code: 'QUEUE_CYCLE_ALREADY_CONSUMED' }));
  });
});
