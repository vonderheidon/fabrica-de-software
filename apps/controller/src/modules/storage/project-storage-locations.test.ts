import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpDelivery, issueAttemptAreaReference, issueHistoryRepositoryReference, managedWorkspaceReference } from '#contracts';
import { createProjectStorageTransitionWorkspace } from '../workspaces/project-storage-transition.js';
import { createProjectStorageInspector, projectStorageRootRelative, retainedRepositoryOwner, retainedRepositoryPath } from '../workspaces/project-storage.js';
import { openStorage } from './index.js';
import { attemptFixture } from '../../../../../tests/fixtures/attempt.js';

const directories: string[] = [];
const stores: { close(): void }[] = [];
function fixture() {
  const installationRoot = mkdtempSync(join(tmpdir(), 'factory-project-storage-'));
  directories.push(installationRoot);
  const dataDirectory = resolve(installationRoot, 'var', 'factory');
  mkdirSync(dataDirectory, { recursive: true });
  const storage = openStorage({ dataDirectory });
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

  it('preserves an unallocated project and refuses repository access without persistence', async () => {
    const f = fixture(); const projectId = f.project('Legacy project'); const attemptId = randomUUID();
    const inspector = createProjectStorageInspector(f.dataDirectory);
    const delivery = { id: randomUUID(), attempt_id: attemptId, producer_passage_id: randomUUID(), round: 1,
      base_sha: 'a'.repeat(40), capture_state: 'pending', git_ref: null, repository_relative: `git/${attemptId}.git`,
      content_identity: null, commit_sha: null, has_delta: null, diagnostic: null, captured_at_ms: null, revision: 1, warnings: [] };
    expect(Value.Check(HttpDelivery, delivery)).toBe(true);
    await expect(inspector.resolveRepositoryReference(attemptId, delivery.repository_relative))
      .rejects.toThrow('PROJECT_STORAGE_PERSISTENCE_UNAVAILABLE');
    expect(f.storage.getProjectStorageView(projectId)).toMatchObject({ managed_root: null, state: 'current', locations: [] });
    await expect(inspector.resolveRepositoryReference(randomUUID(), delivery.repository_relative))
      .rejects.toThrow('PROJECT_STORAGE_REFERENCE_INVALID');
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

  it('allocates the managed root after intent and refuses old references without global fallback', async () => {
    const f = fixture(); const projectId = f.project('Managed allocation');
    const newAttempt = randomUUID(); const legacyAttempt = randomUUID();
    const persistence = {
      getAttemptWorkspaceBinding: (id: string) => {
        if (id !== newAttempt && id !== legacyAttempt) throw new Error('ATTEMPT_NOT_FOUND');
        return { attempt_id: id, workspace: { project_id: projectId, repository_id: 'R_test', issue_id: 'I_test' }, issue_number: 17,
          resource_id: id, environment_reference: id === newAttempt ? managedWorkspaceReference(projectId, 17) : `work/${id}/implementation`,
          predecessor_attempt_id: null, initial_state: { kind: 'base_checkout' as const, content_identity: 'a'.repeat(40) },
          inherited_base_sha: null, comparison_base_sha: 'a'.repeat(40), resolution_state: 'candidate' as const };
      },
      getProjectStorageView: (id: string) => f.storage.getProjectStorageView(id),
      recordProjectStorageLocation: (observation: import('#contracts').ProjectStorageRootObservation) => f.storage.recordProjectStorageLocation(observation),
      assertProjectStorageLocation: (observation: import('#contracts').ProjectStorageRootObservation) => f.storage.assertProjectStorageLocation(observation),
    };
    const workspace = createProjectStorageInspector(f.dataDirectory, undefined, persistence);
    await expect(workspace.resolveAttemptRoot(newAttempt)).rejects.toThrow('PROJECT_STORAGE_ROOT_UNAVAILABLE');
    const root = await workspace.resolveAttemptRoot(newAttempt, true);
    expect(root).toBe(resolve(f.installationRoot, ...projectStorageRootRelative(projectId, 'managed').split('/')));
    expect(f.storage.getProjectStorageView(projectId)).toMatchObject({ managed_root: projectStorageRootRelative(projectId, 'managed'), state: 'current' });
    expect(await workspace.resolveAttemptRoot(newAttempt)).toBe(root);
    expect(await workspace.resolveAttemptArea(newAttempt, 'sessions'))
      .toBe(resolve(root, ...issueAttemptAreaReference(17, newAttempt, 'sessions').split('/')));
    expect(await workspace.resolveAttemptArea(newAttempt, 'publication'))
      .toBe(resolve(root, ...issueAttemptAreaReference(17, newAttempt, 'publication').split('/')));
    await expect(workspace.resolveAttemptRoot(legacyAttempt)).rejects.toThrow('PROJECT_STORAGE_REFERENCE_INVALID');
    expect(await workspace.resolveRepositoryReference(newAttempt, `git/${newAttempt}.git`)).toBe(resolve(root, 'git', `${newAttempt}.git`));
    const historyReference = issueHistoryRepositoryReference(17);
    expect(await workspace.resolveRepositoryReference(newAttempt, historyReference)).toBe(resolve(root, 'issues', '17', 'history.git'));
    expect(retainedRepositoryPath(root, newAttempt, `git/${newAttempt}.git`)).toBe(resolve(root, 'git', `${newAttempt}.git`));
    expect(retainedRepositoryPath(root, newAttempt, historyReference)).toBe(resolve(root, 'issues', '17', 'history.git'));
    expect(retainedRepositoryOwner(newAttempt, historyReference)).toBe('issue:17');
    expect(() => retainedRepositoryPath(root, '../invalid', '../escape')).toThrow('PROJECT_STORAGE_REFERENCE_INVALID');
    await expect(workspace.resolveRepositoryReference(legacyAttempt, `git/${legacyAttempt}.git`)).rejects.toThrow('PROJECT_STORAGE_REFERENCE_INVALID');
    expect(f.storage.getProjectStorageLocations(projectId)).toHaveLength(1);
  });

  it('resumes a journaled directory move after restart without replacing its identity', async () => {
    const f = fixture(); const projectId = f.project('Recoverable transition');
    const sourceRelative = projectStorageRootRelative(projectId, 'managed');
    const source = resolve(f.installationRoot, ...sourceRelative.split('/'));
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'preserved.txt'), 'kept across rename');
    const inspector = createProjectStorageInspector(f.dataDirectory);
    const sourceObservation = await inspector.inspectProjectStorageRoot(projectId, 'managed');
    const sourceLocation = f.storage.recordProjectStorageLocation(sourceObservation);
    const destinationRelative = projectStorageRootRelative(projectId, 'managed', 2);
    const project = f.storage.getProject(projectId).view.project;
    const planHash = createHash('sha256').update(JSON.stringify([project.id, project.revision, sourceRelative,
      JSON.stringify(sourceObservation.object_identity), destinationRelative, 'managed'])).digest('hex');
    const operationId = randomUUID();
    f.storage.acceptStorageTransition({ operationId, projectId, expectedRevision: f.storage.getConfiguration(projectId).etag,
      command: { location_key: 'managed', source_location_id: sourceLocation.id, plan_hash: planHash, authorized: true },
      destinationRelative, sourceIdentity: sourceObservation.object_identity });
    let transition = f.storage.claimStorageTransition(operationId);
    f.storage.advanceStorageTransition(operationId, transition.generation, 'quiescence_checked', 'running', null);
    f.storage.advanceStorageTransition(operationId, transition.generation, 'moving', 'running', null);

    const workspace = createProjectStorageTransitionWorkspace(f.dataDirectory);
    const moved = await workspace.moveProjectStorageTransition({ project_id: projectId, source_relative: transition.source_relative,
      destination_relative: transition.destination_relative, source_identity: transition.source_identity });
    const index = stores.indexOf(f.storage);
    if (index >= 0) stores.splice(index, 1);
    f.storage.close();

    const resumed = openStorage({ dataDirectory: f.dataDirectory }); stores.push(resumed);
    transition = resumed.getStorageTransition(operationId)!;
    expect(transition).toMatchObject({ state: 'uncertain', step: 'moving', destination_identity: null });
    const claimed = resumed.claimStorageTransition(operationId);
    const recovered = await workspace.moveProjectStorageTransition({ project_id: projectId, source_relative: claimed.source_relative,
      destination_relative: claimed.destination_relative, source_identity: claimed.source_identity });
    expect(recovered.object_identity).toMatchObject({ volume_id: sourceObservation.object_identity.volume_id,
      object_id: sourceObservation.object_identity.object_id });
    expect(moved.object_identity.object_id).toBe(recovered.object_identity.object_id);
    resumed.advanceStorageTransition(operationId, claimed.generation, 'verifying', 'running', null, recovered.object_identity);
    resumed.advanceStorageTransition(operationId, claimed.generation, 'publishing_location', 'running', null, recovered.object_identity);
    resumed.completeStorageTransition(operationId, claimed.generation, recovered.object_identity);

    const destination = resolve(f.installationRoot, ...destinationRelative.split('/'));
    expect(readFileSync(join(destination, 'preserved.txt'), 'utf8')).toBe('kept across rename');
    expect(existsSync(source)).toBe(false);
    expect(resumed.getProjectStorageView(projectId)).toMatchObject({ state: 'current', managed_root: destinationRelative });
    const locations = resumed.getProjectStorageLocations(projectId);
    expect(locations).toHaveLength(2);
    expect(locations.find(item => item.path === destinationRelative)).toMatchObject({ current: true, layout_version: 2 });
    expect(locations.find(item => item.path === sourceRelative)).toMatchObject({ current: false, layout_version: 1 });
    expect(resumed.getStorageTransition(operationId)).toMatchObject({ state: 'verified', step: 'publishing_location' });
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

  it('creates delivery evidence in the owning issue attempt outside the shared checkout', async () => {
    const installationRoot = mkdtempSync(join(tmpdir(), 'factory-review-evidence-'));
    const f = await attemptFixture(installationRoot, 'a'.repeat(40), 'high', 'var/factory');
    try {
      const prepared = await f.prepare();
      const operation = await f.pipeline.startAttempt(prepared.body, prepared.context);
      await f.pipeline.drain();
      const attemptId = operation.resource.id;
      const deliveryId = randomUUID();
      const inspector = createProjectStorageInspector(f.directory, undefined, f.storage);
      await inspector.resolveAttemptRoot(attemptId, true);
      const evidence = await inspector.resolveAttemptEvidenceDirectory(attemptId, deliveryId);
      const managed = resolve(installationRoot, ...projectStorageRootRelative(f.projectId, 'managed').split('/'));
      expect(evidence).toBe(resolve(managed, 'issues', '17', 'attempts', attemptId, 'evidence', deliveryId));
      expect(existsSync(evidence)).toBe(true);
      const workspace = await inspector.resolveAttemptWorkspace(attemptId);
      expect(workspace).toBe(resolve(managed, 'issues', '17', 'workspace'));
      expect(evidence).not.toBe(workspace);
    } finally {
      await f.close();
      rmSync(installationRoot, { recursive: true, force: true });
    }
  });
});
