import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRetainedHistoryMigrations } from '../storage/retained-history-migrations.js';
import { createRetainedHistoryMigrator, type RetainedHistoryMigrationStore } from './retained-history-migration.js';
import type { GitReader } from './git.js';

const directories: string[] = [];
const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

function database() {
  const db = new Database(':memory:'); databases.push(db); db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY);
    CREATE TABLE attempts(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),repository_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,issue_number INTEGER NOT NULL,result TEXT,created_at_ms INTEGER NOT NULL,UNIQUE(id,project_id));
    CREATE TABLE deliveries(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES attempts(id),repository_relative TEXT NOT NULL);
    CREATE TABLE project_deletions(operation_id TEXT,project_id TEXT,worker_generation INTEGER,worker_token TEXT,state TEXT);`);
  db.exec(readFileSync(resolve('resources/storage/055_issue_history_repository_reference.sql'),'utf8'));
  return db;
}

function controlledGit(source: string, refs: Map<string,string>, extras: Array<{ path:string; refs:Map<string,string> }> = []): GitReader {
  const repositories = new Map<string,{ refs: Map<string,string>; objects: Set<string>; format: string }>([
    [source,{ refs:new Map(refs),objects:new Set(refs.values()),format:'sha1' }],
    ...extras.map(extra => [extra.path,{ refs:new Map(extra.refs),objects:new Set(extra.refs.values()),format:'sha1' }] as const),
  ]);
  const git: GitReader = async (_cwd,args) => {
    const gitDir = args.find(value => value.startsWith('--git-dir='))?.slice('--git-dir='.length);
    const commandIndex = args.findIndex(value => ['init','rev-parse','for-each-ref','show-ref','fetch','cat-file','symbolic-ref'].includes(value));
    const command = args[commandIndex]; const tail = args.slice(commandIndex + 1);
    if (!gitDir || commandIndex < 0 || !command) return { exitCode: 128, stdout: '' };
    if (command === 'init') {
      if (!repositories.has(gitDir)) repositories.set(gitDir,{ refs:new Map(),objects:new Set(),format:tail.find(value => value.startsWith('--object-format='))?.slice('--object-format='.length) ?? 'sha1' });
      return { exitCode: 0, stdout: '' };
    }
    const repository = repositories.get(gitDir);
    if (!repository) return { exitCode: 128, stdout: '' };
    if (command === 'rev-parse' && tail[0] === '--show-object-format') return { exitCode: 0, stdout: repository.format };
    if (command === 'for-each-ref') return { exitCode: 0, stdout: [...repository.refs].sort(([a],[b]) => a.localeCompare(b)).map(([name,oid]) => `${name} ${oid} `).join('\n') };
    if (command === 'show-ref') {
      const ref = tail.at(-1)!; const oid = repository.refs.get(ref);
      return oid ? { exitCode: 0, stdout: oid } : { exitCode: 1, stdout: '' };
    }
    if (command === 'fetch') {
      const sourcePath = tail.at(-2)!; const refspec = tail.at(-1)!; const separator = refspec.indexOf(':');
      const ref = refspec.slice(0,separator); const destinationRef = refspec.slice(separator + 1);
      const sourceRepo = repositories.get(sourcePath); const oid = sourceRepo?.refs.get(ref);
      if (!oid || repository.refs.has(destinationRef)) return { exitCode: 1, stdout: '' };
      repository.refs.set(destinationRef,oid); for (const object of sourceRepo!.objects) repository.objects.add(object);
      return { exitCode: 0, stdout: '' };
    }
    if (command === 'cat-file') return { exitCode: repository.objects.has(tail.at(-1)!.split('^')[0]!) ? 0 : 1, stdout: '' };
    if (command === 'symbolic-ref') return { exitCode: 1, stdout: '' };
    return { exitCode: 1, stdout: '' };
  };
  return git;
}

describe('retained issue history migration', () => {
  it('does not resolve a managed root when a new issue has no historical attempts', async () => {
    const root = vi.fn(async (): Promise<string> => { throw new Error('PROJECT_STORAGE_ROOT_UNAVAILABLE'); });
    const store = { listRetainedHistoryMigrationCandidates: () => [] } as unknown as RetainedHistoryMigrationStore;
    const git = vi.fn<GitReader>();
    await expect(createRetainedHistoryMigrator(resolve('unused-managed-root'), git, store, root)(randomUUID())).resolves.toBeUndefined();
    expect(root).not.toHaveBeenCalled();
    expect(git).not.toHaveBeenCalled();
  });
  it('recovers after copying refs but before SQL publication and keeps the source repository', async () => {
    const root = mkdtempSync(join(tmpdir(),'factory-history-migration-')); directories.push(root);
    const managedRoot = join(root,'managed root'); const sourceAttemptId = randomUUID(); const currentAttemptId = randomUUID();
    const projectId = randomUUID(); const deliveryId = randomUUID(); const source = join(managedRoot,'git',`${sourceAttemptId}.git`);
    mkdirSync(source,{ recursive:true }); writeFileSync(join(source,'factory-owner'),sourceAttemptId,{ flag:'wx' });
    const firstOid = 'a'.repeat(40); const secondOid = 'b'.repeat(40);
    const refs = new Map([[`refs/heads/main`,firstOid],[`refs/factory/deliveries/${deliveryId}`,secondOid]]);
    const db = database(); db.prepare('INSERT INTO projects(id) VALUES (?)').run(projectId);
    db.prepare(`INSERT INTO attempts(id,project_id,repository_id,issue_id,issue_number,result,created_at_ms)
      VALUES (?,?, 'R_fixture','I_fixture',17,'interrupted',1),(?,?, 'R_fixture','I_fixture',17,NULL,2)`)
      .run(sourceAttemptId,projectId,currentAttemptId,projectId);
    db.prepare('INSERT INTO deliveries(id,attempt_id,repository_relative) VALUES (?,?,?)')
      .run(deliveryId,sourceAttemptId,`git/${sourceAttemptId}.git`);
    const persistence = createRetainedHistoryMigrations(db);
    const failingStore: RetainedHistoryMigrationStore = {
      listRetainedHistoryMigrationCandidates: id => persistence.candidates(id),
      getRetainedHistoryMigration: id => persistence.get(id),
      beginRetainedHistoryMigration: input => persistence.begin(input),
      recordRetainedHistoryMigrationDestination: (id, identity) => persistence.recordDestinationIdentity(id,identity),
      blockRetainedHistoryMigration: (id, reason) => persistence.block(id,reason),
      completeRetainedHistoryMigration: () => { throw new Error('CONTROLLED_INTERRUPTION_BEFORE_SQL_PUBLICATION'); },
    };
    const resolveAttemptRoot = async () => managedRoot; const git = controlledGit(source,refs);
    await expect(createRetainedHistoryMigrator(managedRoot,git,failingStore,resolveAttemptRoot)(currentAttemptId))
      .rejects.toThrow('CONTROLLED_INTERRUPTION_BEFORE_SQL_PUBLICATION');
    const destination = join(managedRoot,'issues','17','history.git');
    expect(persistence.get(sourceAttemptId)?.state).toBe('copying');
    expect(db.prepare('SELECT history_repository_relative FROM deliveries WHERE id=?').get(deliveryId))
      .toEqual({ history_repository_relative:null });

    const resumedStore: RetainedHistoryMigrationStore = { ...failingStore,
      completeRetainedHistoryMigration: (id,hash,count,identity) => persistence.complete(id,hash,count,identity) };
    await createRetainedHistoryMigrator(managedRoot,git,resumedStore,resolveAttemptRoot)(currentAttemptId);
    expect(persistence.get(sourceAttemptId)?.state).toBe('verified');
    expect(db.prepare('SELECT history_repository_relative FROM deliveries WHERE id=?').get(deliveryId))
      .toEqual({ history_repository_relative:'issues/17/history.git' });
    expect(readFileSync(join(source,'factory-owner'),'utf8')).toBe(sourceAttemptId);
    const copiedRefs = await git(destination,[`--git-dir=${destination}`,'for-each-ref','--format=%(refname)']);
    for (const ref of refs.keys()) expect(copiedRefs.stdout).toContain(ref);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('preserves a conflicting destination ref and leaves all delivery pointers on the legacy repository', async () => {
    const root = mkdtempSync(join(tmpdir(),'factory-history-conflict-')); directories.push(root);
    const managedRoot = join(root,'managed root'); const sourceAttemptId = randomUUID(); const currentAttemptId = randomUUID();
    const projectId = randomUUID(); const deliveryId = randomUUID(); const source = join(managedRoot,'git',`${sourceAttemptId}.git`);
    const destination = join(managedRoot,'issues','17','history.git');
    mkdirSync(source,{ recursive:true }); writeFileSync(join(source,'factory-owner'),sourceAttemptId,{ flag:'wx' });
    mkdirSync(destination,{ recursive:true }); writeFileSync(join(destination,'factory-owner'),'issue:17',{ flag:'wx' });
    const sourceOid = 'a'.repeat(40); const conflictingOid = 'b'.repeat(40);
    const conflictRef = `refs/factory/deliveries/${deliveryId}`;
    const sourceRefs = new Map([[conflictRef,sourceOid]]);
    const db = database(); db.prepare('INSERT INTO projects(id) VALUES (?)').run(projectId);
    db.prepare(`INSERT INTO attempts(id,project_id,repository_id,issue_id,issue_number,result,created_at_ms)
      VALUES (?,?, 'R_fixture','I_fixture',17,'interrupted',1),(?,?, 'R_fixture','I_fixture',17,NULL,2)`)
      .run(sourceAttemptId,projectId,currentAttemptId,projectId);
    db.prepare('INSERT INTO deliveries(id,attempt_id,repository_relative) VALUES (?,?,?)')
      .run(deliveryId,sourceAttemptId,`git/${sourceAttemptId}.git`);
    const persistence = createRetainedHistoryMigrations(db);
    const git = controlledGit(source,sourceRefs,[{ path:destination,refs:new Map([[conflictRef,conflictingOid]]) }]);
    const store: RetainedHistoryMigrationStore = {
      listRetainedHistoryMigrationCandidates: id => persistence.candidates(id),
      getRetainedHistoryMigration: id => persistence.get(id),
      beginRetainedHistoryMigration: input => persistence.begin(input),
      recordRetainedHistoryMigrationDestination: (id, identity) => persistence.recordDestinationIdentity(id,identity),
      blockRetainedHistoryMigration: (id, reason) => persistence.block(id,reason),
      completeRetainedHistoryMigration: (id,hash,count,identity) => persistence.complete(id,hash,count,identity),
    };
    await expect(createRetainedHistoryMigrator(managedRoot,git,store,async () => managedRoot)(currentAttemptId))
      .rejects.toThrow('RETAINED_HISTORY_REF_CONFLICT');
    expect((await git(destination,[`--git-dir=${destination}`,'show-ref','--verify','--hash',conflictRef])).stdout).toBe(conflictingOid);
    expect(persistence.get(sourceAttemptId)?.state).toBe('copying');
    expect(db.prepare('SELECT history_repository_relative FROM deliveries WHERE id=?').get(deliveryId))
      .toEqual({ history_repository_relative:null });
  });
});
