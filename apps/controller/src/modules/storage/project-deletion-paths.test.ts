import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, loadMigrations } from '../../../../../tests/fixtures/historical-schema.js';
import { seedSettings } from './settings.js';
import { readConfiguration } from './configuration-reads.js';
import { insertRevision, registerProject } from './configuration-writes.js';
import { readProjectDeletionPaths } from './project-deletion-paths.js';
import { attemptFixture } from '../../../../../tests/fixtures/attempt.js';
import { passageBootstrapDirectoryReference } from '#contracts';
import { resolve } from 'node:path';

describe('saved current origins and versioned deletion path inventory', () => {
  it('selects B after A→B, preserves A after B→URL and never writes during inspection', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys=ON');
      applyMigrations(db, loadMigrations(), () => seedSettings(db));
      const original = { kind: 'local' as const, location: 'C:\\Projects\\A' };
      const saved = registerProject(db, { operationId: randomUUID(), expectedRevision: undefined,
        body: { name: 'Current origin', source: original, base_branch: 'main' }, source: original, originNotes: [] });
      const projectId = saved.resource.id;
      const change = (source: typeof original | { kind: 'github'; location: string }) => {
        const { id: _id, project_id: _projectId, revision, created_at_ms: _createdAt, ...configuration } = readConfiguration(db, projectId).configuration;
        const id = randomUUID();
        db.transaction(() => {
          insertRevision(db, projectId, id, revision + 1, { ...configuration, source }, []);
          db.prepare('UPDATE projects SET current_revision_id=?,revision=? WHERE id=?').run(id, revision + 1, projectId);
        })();
      };
      change({ kind: 'local', location: 'C:\\Projects\\B' });
      const before = db.prepare('SELECT total_changes() AS n').get();
      const b = readProjectDeletionPaths(db, projectId, 'C:\\Factory\\var\\factory');
      expect(b.targets.map(t => t.path)).toEqual(['C:\\Projects\\B']);
      expect(readProjectDeletionPaths(db, projectId, 'C:\\Factory\\var\\factory').inventoryVersion).toBe(b.inventoryVersion);
      expect(db.prepare('SELECT total_changes() AS n').get()).toEqual(before);
      change({ kind: 'github', location: 'https://github.com/example/repo' });
      const remote = readProjectDeletionPaths(db, projectId, 'C:\\Factory\\var\\factory');
      expect(remote.targets).toEqual([]);
      expect(remote.inventoryVersion).not.toBe(b.inventoryVersion);
      expect(db.prepare('SELECT count(*) AS n FROM project_revisions WHERE project_id=?').get(projectId)).toEqual({ n: 3 });
    } finally { db.close(); }
  });

  it('targets bootstrap residues by passage and protects bootstrap paths owned by another project', async () => {
    const fixture = await attemptFixture();
    try {
      const prepared = await fixture.prepare();
      await fixture.pipeline.startAttempt(prepared.body, prepared.context);
      await fixture.pipeline.drain();
      const repository = fixture.issue.repository;
      Object.assign(repository, { id: 'R_other', name: 'repo-other', url: 'https://github.com/test-org/repo-other' });
      fixture.issue.url = `${repository.url}/issues/17`;
      const otherProjectId = fixture.register();
      fixture.observation.source = fixture.storage.getConfiguration(otherProjectId).view.configuration.source;
      if (!fixture.observation.remote?.branch) throw new Error('TEST_FIXTURE_REMOTE_BRANCH_MISSING');
      Object.assign(fixture.observation.remote, { url: repository.url, repository,
        branch: { ...fixture.observation.remote.branch, repositoryId: repository.id } });
      const otherPrepared = await fixture.prepare(otherProjectId);
      await fixture.pipeline.startAttempt(otherPrepared.body, otherPrepared.context);
      await fixture.pipeline.drain();
      const selected = fixture.db.prepare<[string], { id: string; attempt_id: string }>(`SELECT p.id,p.attempt_id FROM passages p
        JOIN attempts a ON a.id=p.attempt_id WHERE a.project_id=? ORDER BY p.id`).all(fixture.projectId);
      const other = fixture.db.prepare<[string], { id: string }>(`SELECT p.id FROM passages p JOIN attempts a ON a.id=p.attempt_id
        WHERE a.project_id=? ORDER BY p.id`).all(otherProjectId);
      const paths = fixture.storage.getProjectDeletionPaths(fixture.projectId);
      for (const passage of selected) expect(paths.targets).toContainEqual(expect.objectContaining({
        key: `bootstrap:${passage.id}`, kind: 'exclusive_workspace', ownerKind: 'attempt', ownerId: passage.attempt_id,
        path: resolve(fixture.directory, ...passageBootstrapDirectoryReference(passage.id).split('/')),
      }));
      for (const passage of other) expect(paths.protectedPaths).toContain(
        resolve(fixture.directory, ...passageBootstrapDirectoryReference(passage.id).split('/')));
      expect(paths.containers).toContain(resolve(fixture.directory, 'runtime', 'bootstrap'));
    } finally { await fixture.close(); }
  });
});
