import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpDelivery } from '#contracts';
import { createProjectStorageInspector, projectStorageRootRelative } from '../workspaces/project-storage.js';
import { openStorage, openStorageAtMigrationVersionForTests } from './index.js';
import { applyMigrations, loadMigrations } from './migrations.js';
import { seedSettings } from './settings.js';

const directories: string[] = [];
const stores: { close(): void }[] = [];
function fixture(migrationVersionForTest?: number) {
  const installationRoot = mkdtempSync(join(tmpdir(), 'factory-project-storage-'));
  directories.push(installationRoot);
  const dataDirectory = resolve(installationRoot, 'var', 'factory');
  mkdirSync(dataDirectory, { recursive: true });
  const storage = migrationVersionForTest === undefined ? openStorage({ dataDirectory })
    : openStorageAtMigrationVersionForTests({ dataDirectory }, migrationVersionForTest);
  stores.push(storage);
  const project = (name: string) => {
    const source = { kind: 'local' as const, location: installationRoot };
    const result = storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
      body: { name, source, base_branch: 'main' }, source, originNotes: [] });
    return result.resource.id;
  };
  return { installationRoot, dataDirectory, storage, project };
}
afterEach(() => {
  for (const store of stores.splice(0).reverse()) store.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('project storage location identity and reads', () => {
  it('assigns same-name projects distinct roots and preserves the root after rename', async () => {
    const f = fixture(); const firstId = f.project('Duplicate name'); const secondId = f.project('Duplicate name');
    const inspector = createProjectStorageInspector(f.dataDirectory);
    const firstRelative = projectStorageRootRelative(firstId, 'managed');
    const secondRelative = projectStorageRootRelative(secondId, 'managed');
    expect(firstRelative).not.toBe(secondRelative);
    mkdirSync(resolve(f.installationRoot, ...firstRelative.split('/')), { recursive: true });
    mkdirSync(resolve(f.installationRoot, ...secondRelative.split('/')), { recursive: true });
    const first = await inspector.inspectProjectStorageRoot(firstId, 'managed');
    const second = await inspector.inspectProjectStorageRoot(secondId, 'managed');
    const firstStored = f.storage.recordProjectStorageLocation(first);
    const secondStored = f.storage.recordProjectStorageLocation(second);
    expect(firstStored).toMatchObject({ location_key: 'managed', path: firstRelative, current: true, layout_version: 1 });
    expect(secondStored.path).toBe(secondRelative);

    const db = new Database(join(f.dataDirectory, 'factory.sqlite'));
    try { db.prepare('UPDATE projects SET name=? WHERE id=?').run('Renamed project', firstId); }
    finally { db.close(); }
    expect(f.storage.getProjectStorageView(firstId).managed_root).toBe(firstRelative);
    expect(f.storage.getProjectStorageLocations(firstId)).toMatchObject([{ id: firstStored.id, path: firstRelative, current: true }]);
  });

  it('rejects escaped paths, shared identities and replacement without a verified transition', async () => {
    const f = fixture(); const firstId = f.project('First'); const secondId = f.project('Second');
    const inspector = createProjectStorageInspector(f.dataDirectory);
    expect(() => projectStorageRootRelative(firstId, '../shared')).toThrow('PROJECT_STORAGE_IDENTITY_INVALID');
    expect(() => inspector.resolveProjectRelativeReference(firstId, 'managed', '../outside.git'))
      .toThrow('PROJECT_STORAGE_REFERENCE_INVALID');
    const rootRelative = projectStorageRootRelative(firstId, 'managed');
    mkdirSync(resolve(f.installationRoot, ...rootRelative.split('/')), { recursive: true });
    const first = await inspector.inspectProjectStorageRoot(firstId, 'managed');
    const stored = f.storage.recordProjectStorageLocation(first);
    const shared = { ...first, project_id: secondId, root_relative: projectStorageRootRelative(secondId, 'managed') };
    let sharedError: unknown;
    try { f.storage.recordProjectStorageLocation(shared); } catch (error) { sharedError = error; }
    expect(sharedError).toMatchObject({ code: 'PROJECT_STORAGE_ROOT_SHARED' });
    let invalidError: unknown;
    try { f.storage.recordProjectStorageLocation({ ...first, root_relative: `var/factory/projects/${firstId}/../escape` }); } catch (error) { invalidError = error; }
    expect(invalidError).toMatchObject({ code: 'PROJECT_STORAGE_OBSERVATION_INVALID' });
    let transitionError: unknown;
    try { f.storage.recordProjectStorageLocation({ ...first,
      object_identity: { ...first.object_identity, object_id: 'different' } }); } catch (error) { transitionError = error; }
    expect(transitionError).toMatchObject({ code: 'PROJECT_STORAGE_TRANSITION_REQUIRED' });
    expect(f.storage.getProjectStorageLocations(firstId)).toHaveLength(1);
    expect(f.storage.getProjectStorageLocations(firstId)[0]?.id).toBe(stored.id);
  });

  it('reads repository_relative legacy references without inventing an observed location', () => {
    const f = fixture(); const projectId = f.project('Legacy project'); const attemptId = randomUUID();
    const inspector = createProjectStorageInspector(f.dataDirectory);
    const delivery = { id: randomUUID(), attempt_id: attemptId, producer_passage_id: randomUUID(), round: 1,
      base_sha: 'a'.repeat(40), capture_state: 'pending', git_ref: null, repository_relative: `git/${attemptId}.git`,
      content_identity: null, commit_sha: null, has_delta: null, diagnostic: null, captured_at_ms: null, revision: 1, warnings: [] };
    expect(Value.Check(HttpDelivery, delivery)).toBe(true);
    expect(inspector.resolveLegacyRepositoryReference(attemptId, delivery.repository_relative))
      .toBe(resolve(f.dataDirectory, 'git', `${attemptId}.git`));
    expect(f.storage.getProjectStorageView(projectId)).toMatchObject({ managed_root: null, state: 'legacy', locations: [] });
    expect(() => inspector.resolveLegacyRepositoryReference(randomUUID(), delivery.repository_relative))
      .toThrow('LEGACY_REPOSITORY_REFERENCE_INVALID');
  });

  it('includes locations in the project deletion inventory', async () => {
    const f = fixture(); const projectId = f.project('Delete inventory');
    const rootRelative = projectStorageRootRelative(projectId, 'managed');
    mkdirSync(resolve(f.installationRoot, ...rootRelative.split('/')), { recursive: true });
    const observation = await createProjectStorageInspector(f.dataDirectory).inspectProjectStorageRoot(projectId, 'managed');
    const location = f.storage.recordProjectStorageLocation(observation);
    const inventory = f.storage.getProjectDeletionInventory(projectId);
    expect(inventory.keys.project_storage_locations).toEqual([JSON.stringify([location.id])]);
    expect(inventory.blockers).toEqual([]);
    expect(f.storage.getProjectDeletionPaths(projectId).targets).toContainEqual(expect.objectContaining({
      key: `managed:managed:${location.id}`, path: resolve(f.installationRoot, ...rootRelative.split('/')),
    }));
  });

  it('allocates the managed root after intent and resolves new and legacy attempts independently', async () => {
    const f = fixture(); const projectId = f.project('Managed allocation');
    const newAttempt = randomUUID(); const legacyAttempt = randomUUID();
    const persistence = {
      getAttemptProjectId: (id: string) => id === newAttempt || id === legacyAttempt ? projectId : (() => { throw new Error('ATTEMPT_NOT_FOUND'); })(),
      getAttemptWorkspaceReference: (id: string) => id === newAttempt
        ? `projects/${projectId}/v1/managed/work/${id}/implementation` : `work/${id}/implementation`,
      getProjectStorageView: (id: string) => f.storage.getProjectStorageView(id),
      recordProjectStorageLocation: (observation: import('#contracts').ProjectStorageRootObservation) => f.storage.recordProjectStorageLocation(observation),
      assertProjectStorageLocation: (observation: import('#contracts').ProjectStorageRootObservation) => f.storage.assertProjectStorageLocation(observation),
    };
    const workspace = createProjectStorageInspector(f.dataDirectory, undefined, persistence);
    const root = await workspace.resolveAttemptRoot(newAttempt, true);
    expect(root).toBe(resolve(f.installationRoot, ...projectStorageRootRelative(projectId, 'managed').split('/')));
    expect(f.storage.getProjectStorageView(projectId)).toMatchObject({ managed_root: projectStorageRootRelative(projectId, 'managed'), state: 'current' });
    expect(await workspace.resolveAttemptRoot(newAttempt)).toBe(root);
    expect(await workspace.resolveAttemptRoot(legacyAttempt)).toBe(f.dataDirectory);
    expect(await workspace.resolveRepositoryReference(newAttempt, `git/${newAttempt}.git`)).toBe(resolve(root, 'git', `${newAttempt}.git`));
    expect(await workspace.resolveRepositoryReference(legacyAttempt, `git/${legacyAttempt}.git`)).toBe(resolve(f.dataDirectory, 'git', `${legacyAttempt}.git`));
    expect(f.storage.getProjectStorageLocations(projectId)).toHaveLength(1);
  });

  it('upgrades schema 27 without synthesizing locations', () => {
    const installationRoot = mkdtempSync(join(tmpdir(), 'factory-project-storage-upgrade-'));
    directories.push(installationRoot);
    const dataDirectory = resolve(installationRoot, 'var', 'factory');
    mkdirSync(dataDirectory, { recursive: true });
    const filename = join(dataDirectory, 'factory.sqlite');
    const db = new Database(filename); db.pragma('foreign_keys = ON');
    applyMigrations(db, loadMigrations().slice(0, 27), () => seedSettings(db));
    expect(db.pragma('user_version', { simple: true })).toBe(27);
    expect(db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type='table' AND name='project_storage_locations'").get())
      .toEqual({ count: 0 });
    db.close();
    const storage = openStorage({ dataDirectory }); stores.push(storage);
    ;
    const reopened = new Database(filename);
    try {
      expect(reopened.prepare('SELECT * FROM project_storage_locations').all()).toEqual([]);
      expect(reopened.pragma('foreign_key_check')).toEqual([]);
    } finally { reopened.close(); }
  });

  it('preserves verified locations across reopen without inventing transitions', async () => {
    const f = fixture(); const projectId = f.project('Current schema project');
    const relative = projectStorageRootRelative(projectId, 'managed');
    const root = resolve(f.installationRoot, ...relative.split('/'));
    mkdirSync(root, { recursive: true });
    const location = f.storage.recordProjectStorageLocation(await createProjectStorageInspector(f.dataDirectory)
      .inspectProjectStorageRoot(projectId, 'managed'));
    f.storage.close();
    const reopened = openStorage({ dataDirectory: f.dataDirectory }); stores.push(reopened);
    expect(reopened.getProjectStorageLocations(projectId)).toMatchObject([{ id: location.id, path: relative, current: true }]);
    expect(reopened.getProjectStorageView(projectId)).toMatchObject({ state: 'current', active_transition_operation_id: null });
    const db = new Database(join(f.dataDirectory, 'factory.sqlite'));
    try {
      expect(db.prepare('SELECT * FROM project_storage_transitions').all()).toEqual([]);
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('verification_runs','checks','artifacts')").all()).toEqual([]);
      expect(db.prepare<[], { name: string }>("PRAGMA table_info('project_revisions')").all().map(column => column.name)).not.toContain('checks_json');
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally { db.close(); }
  });
});
