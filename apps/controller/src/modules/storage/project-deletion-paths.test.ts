import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, loadMigrations } from './migrations.js';
import { seedSettings } from './settings.js';
import { readConfiguration } from './configuration-reads.js';
import { insertRevision, registerProject } from './configuration-writes.js';
import { readProjectDeletionPaths } from './project-deletion-paths.js';

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
});
