import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { attemptFixture, type AttemptFixture } from '../../../../../tests/fixtures/attempt.js';
import { projectConfigurationLock } from './project-configuration-lock.js';

let fixture: AttemptFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

function command(f: AttemptFixture, projectId = f.projectId) {
  const { view, etag } = f.storage.getConfiguration(projectId);
  const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = view.configuration;
  return { operationId: randomUUID(), expectedRevision: etag, projectId,
    body: { project_changes: { guidance: 'Updated guidance' } },
    configuration: { ...configuration, guidance: 'Updated guidance' }, globalChanges: {} };
}

describe('project configuration execution barrier', () => {
  it('rejects a save prepared before dispatch, including suspended attempts, without changing configuration', async () => {
    const f = fixture = await attemptFixture();
    const save = command(f);
    const prepared = await f.prepare();
    const operation = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
    expect(f.storage.getConfiguration(f.projectId).view.configuration_lock).toEqual({ attempt_id: operation.resource.id });
    expect(() => f.storage.saveConfiguration(save)).toThrow(expect.objectContaining({ code: 'PROJECT_CONFIGURATION_LOCKED' }));
    f.db.prepare("UPDATE attempts SET suspension='PUBLICATION_CONFIGURATION_CHANGED' WHERE id=?").run(operation.resource.id);
    expect(() => f.storage.saveConfiguration(save)).toThrow(expect.objectContaining({ code: 'PROJECT_CONFIGURATION_LOCKED' }));
    expect(f.storage.getConfiguration(f.projectId).view.configuration.guidance).not.toBe('Updated guidance');
  });

  it('recovers an already saved command before the lock and keeps other projects editable', async () => {
    const f = fixture = await attemptFixture();
    const savedCommand = command(f); const saved = f.storage.saveConfiguration(savedCommand);
    const prepared = await f.prepare();
    await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
    expect(f.storage.saveConfiguration(savedCommand)).toEqual(saved);
    const other = f.register();
    expect(projectConfigurationLock(f.db, other)).toBeNull();
    expect(() => f.storage.saveConfiguration(command(f, other))).not.toThrow();
  });

  it('keeps cancellation locked until terminal stop is confirmed, then releases configuration', async () => {
    const f = fixture = await attemptFixture(); const prepared = await f.prepare();
    const operation = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
    f.db.prepare("UPDATE attempts SET phase='finished',result='cancelled' WHERE id=?").run(operation.resource.id);
    expect(projectConfigurationLock(f.db, f.projectId)).not.toBeNull();
    f.db.prepare("UPDATE resources SET stop_state='confirmed' WHERE attempt_id=? AND kind='terminal'").run(operation.resource.id);
    expect(projectConfigurationLock(f.db, f.projectId)).toBeNull();
    expect(() => f.storage.saveConfiguration(command(f))).not.toThrow();
  });

  it('blocks pending publication after the attempt ends without treating historical receipts as active work', async () => {
    const f = fixture = await attemptFixture(); const prepared = await f.prepare();
    const operation = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
    const attemptId = operation.resource.id;
    f.db.prepare("UPDATE attempts SET phase='finished',result='cancelled' WHERE id=?").run(attemptId);
    f.db.prepare("UPDATE resources SET stop_state='confirmed' WHERE attempt_id=? AND kind='terminal'").run(attemptId);
    const accept = () => {
      const operationId = randomUUID(); const attempt = f.storage.getAttempt(attemptId);
      f.storage.acceptPublication({ operationId, attemptId, kind: 'attempt.revalidate', body: {}, expectedRevision: `"${attemptId}:${attempt.revision}"` });
      return operationId;
    };
    const pending = accept();
    expect(() => f.storage.saveConfiguration(command(f))).toThrow(expect.objectContaining({ code: 'PROJECT_CONFIGURATION_LOCKED' }));
    f.storage.finishPublicationRequest(pending, 'succeeded', null);
    expect(projectConfigurationLock(f.db, f.projectId)).toBeNull();
    f.storage.finishPublicationRequest(accept(), 'unknown', 'EFFECT_UNRESOLVED');
    expect(projectConfigurationLock(f.db, f.projectId)).toBeNull();
  });
});
