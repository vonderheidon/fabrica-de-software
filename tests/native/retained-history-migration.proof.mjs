import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createRetainedHistoryMigrations } from '../../dist/apps/controller/src/modules/storage/retained-history-migrations.js';
import { createGitReader } from '../../dist/apps/controller/src/modules/workspaces/git.js';
import { createRetainedHistoryMigrator } from '../../dist/apps/controller/src/modules/workspaces/retained-history-migration.js';

if (process.env.FACTORY_HISTORY_MIGRATION_PROOF !== 'authorized') throw new Error('HISTORY_MIGRATION_PROOF_NOT_AUTHORIZED');
const executable = (process.env.PATH ?? '').split(delimiter)
  .map(directory => join(directory, process.platform === 'win32' ? 'git.exe' : 'git')).find(existsSync);
if (!executable) throw new Error('LOCAL_GIT_UNAVAILABLE');
const git = createGitReader({ kind: 'windows_keyring', executable });
const cache = resolve('.cache'); mkdirSync(cache, { recursive: true });
const root = mkdtempSync(join(cache, 'retained-history-migration-'));
const resolvedRoot = resolve(root);
if (!resolvedRoot.startsWith(cache + sep)) throw new Error('PROOF_PATH_INVALID');
const managedRoot = join(root, 'managed root'); const sourceAttemptId = randomUUID(); const currentAttemptId = randomUUID();
const projectId = randomUUID(); const deliveryId = randomUUID(); const issueNumber = 17;
const source = join(managedRoot, 'git', `${sourceAttemptId}.git`); const checkout = join(root, 'checkout');
const runSetup = (args, cwd = checkout) => execFileSync(executable, args, {
  cwd, encoding: 'utf8', windowsHide: true, shell: false, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
}).trim();
const db = new Database(':memory:'); db.pragma('foreign_keys = ON');
try {
  mkdirSync(source, { recursive: true }); writeFileSync(join(source, 'factory-owner'), sourceAttemptId, { flag: 'wx' });
  runSetup(['init', '--bare', '--template=', source], root);
  mkdirSync(checkout); runSetup(['init', '-b', 'main']);
  writeFileSync(join(checkout, 'history.txt'), 'legacy retained content\n');
  runSetup(['add', '--', 'history.txt']);
  runSetup(['-c', 'user.name=History Fixture', '-c', 'user.email=history@factory.invalid', 'commit', '-m', 'legacy history']);
  runSetup(['remote', 'add', 'origin', source]);
  runSetup(['push', 'origin', 'HEAD:refs/heads/main']);
  runSetup(['push', 'origin', `HEAD:refs/factory/workspace-snapshots/${sourceAttemptId}`]);
  runSetup(['push', 'origin', `HEAD:refs/factory/deliveries/${deliveryId}`]);

  db.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY);
    CREATE TABLE attempts(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),repository_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,issue_number INTEGER NOT NULL,result TEXT,created_at_ms INTEGER NOT NULL,UNIQUE(id,project_id));
    CREATE TABLE deliveries(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES attempts(id),repository_relative TEXT NOT NULL);
    CREATE TABLE project_deletions(operation_id TEXT,project_id TEXT,worker_generation INTEGER,worker_token TEXT,state TEXT);`);
  db.exec(readFileSync('resources/storage/055_issue_history_repository_reference.sql', 'utf8'));
  db.prepare('INSERT INTO projects(id) VALUES (?)').run(projectId);
  db.prepare(`INSERT INTO attempts(id,project_id,repository_id,issue_id,issue_number,result,created_at_ms)
    VALUES (?,?, 'R_fixture','I_fixture',17,'interrupted',1),(?,?, 'R_fixture','I_fixture',17,NULL,2)`)
    .run(sourceAttemptId, projectId, currentAttemptId, projectId);
  db.prepare('INSERT INTO deliveries(id,attempt_id,repository_relative) VALUES (?,?,?)')
    .run(deliveryId, sourceAttemptId, `git/${sourceAttemptId}.git`);
  const persistence = createRetainedHistoryMigrations(db);
  const store = {
    listRetainedHistoryMigrationCandidates: id => persistence.candidates(id),
    getRetainedHistoryMigration: id => persistence.get(id),
    beginRetainedHistoryMigration: input => persistence.begin(input),
    recordRetainedHistoryMigrationDestination: (id, identity) => persistence.recordDestinationIdentity(id, identity),
    blockRetainedHistoryMigration: (id, reason) => persistence.block(id, reason),
    completeRetainedHistoryMigration: () => { throw new Error('CONTROLLED_INTERRUPTION_BEFORE_SQL_PUBLICATION'); },
  };
  const resolveAttemptRoot = async () => managedRoot;
  await assert.rejects(createRetainedHistoryMigrator(managedRoot, git, store, resolveAttemptRoot)(currentAttemptId),
    /CONTROLLED_INTERRUPTION_BEFORE_SQL_PUBLICATION/);
  const destination = join(managedRoot, 'issues', String(issueNumber), 'history.git');
  assert.equal(persistence.get(sourceAttemptId)?.state, 'copying');
  assert.equal(db.prepare('SELECT history_repository_relative FROM deliveries WHERE id=?').get(deliveryId)?.history_repository_relative, null);
  for (const reference of [`refs/heads/main`, `refs/factory/workspace-snapshots/${sourceAttemptId}`, `refs/factory/deliveries/${deliveryId}`]) {
    const copied = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', 'show-ref', '--verify', '--hash', reference]);
    assert.equal(copied.exitCode, 0, `missing ref ${reference}`);
  }

  const resumedStore = { ...store,
    completeRetainedHistoryMigration: (id, hash, count, identity) => persistence.complete(id, hash, count, identity) };
  await createRetainedHistoryMigrator(managedRoot, git, resumedStore, resolveAttemptRoot)(currentAttemptId);
  assert.equal(persistence.get(sourceAttemptId)?.state, 'verified');
  assert.equal(db.prepare('SELECT history_repository_relative FROM deliveries WHERE id=?').get(deliveryId)?.history_repository_relative,
    `issues/${issueNumber}/history.git`);
  assert.equal(readFileSync(join(source, 'factory-owner'), 'utf8'), sourceAttemptId);
  assert.equal((await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', 'show', `refs/factory/deliveries/${deliveryId}:history.txt`])).stdout,
    'legacy retained content\n');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  console.log(JSON.stringify({ proof: 'retained_history_migration_real_git', refsPreserved: 3, resumedAfterCopy: true,
    deliveryReferencePublishedAfterVerification: true, sourcePreserved: existsSync(source) }));
} finally {
  db.close();
  if (!resolve(root).startsWith(cache + sep)) throw new Error('PROOF_PATH_INVALID');
  rmSync(root, { recursive: true, force: true });
}
