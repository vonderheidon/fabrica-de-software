import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectItem } from '#contracts';
import { createQueue } from '../../apps/controller/src/modules/projects/queue.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { applyMigrations, loadMigrations } from '../../apps/controller/src/modules/storage/migrations.js';
import { readSettings } from '../../apps/controller/src/modules/storage/settings.js';
import { seedLegacySettings as seedSettings } from '../fixtures/legacy-settings.js';
import { saveTimeDefaults, settingsETag } from '../../apps/controller/src/modules/storage/operations.js';
import { attemptFixture, complete, type AttemptFixture } from '../fixtures/attempt.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() { const f = await attemptFixture(); fixtures.push(f); return f; }
describe('atomic attempt acceptance', () => {
  it.each(['operation_requests', 'attempts', 'attempt_criteria', 'rounds', 'passages', 'resources', 'events'] as const)('rolls back every record and dispatch intention on %s failure', async table => {
    const f = await fixture(); const c = await f.prepare(); const cursor = f.storage.getEvents({}).event_cursor;
    f.db.exec(`CREATE TRIGGER fail_start BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fixture-failure'); END`);
    await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toThrow();
    expect(f.storage.getOperation(c.context.operationId)).toBeNull();
    for (const name of ['attempts', 'attempt_criteria', 'rounds', 'passages', 'resources']) expect(f.db.prepare(`SELECT count(*) AS n FROM ${name}`).get()).toEqual({ n: 0 });
    expect(f.storage.getEvents({}).event_cursor).toBe(cursor);
    await f.pipeline.drain(); expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled(); expect(f.execution.startPassage).not.toHaveBeenCalled();
    f.db.exec('DROP TRIGGER fail_start');
    await f.pipeline.startAttempt(c.body, c.context); await f.pipeline.drain(); expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
  });
  it('refuses busy without durable receipt or effects, then accepts the original key', async () => {
    const f = await fixture(); const c = await f.prepare(); f.db.exec('BEGIN IMMEDIATE');
    try { await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toThrow(); }
    finally { f.db.exec('ROLLBACK'); }
    expect(f.storage.getOperation(c.context.operationId)).toBeNull(); expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
    await f.pipeline.startAttempt(c.body, c.context); await f.pipeline.drain(); expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
  });
  it('does not repeat an already accepted preparation after restart', async () => {
    const f = await fixture(); const c = await f.prepare(); const op = await f.pipeline.startAttempt(c.body, c.context); await f.pipeline.drain();
    f.storage.interruptAttempts();
    expect(f.storage.getAttempt(op.resource.id).result).toBe('interrupted');
    await expect(f.pipeline.startAttempt(c.body, { ...c.context, operationId: randomUUID() })).rejects.toMatchObject({ code: 'EXPLICIT_RETRY_REQUIRED' });
    expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
  });
  it('accepts a fresh manual preparation for an interrupted issue using the newly selected branch', async () => {
    const f = await fixture(); const first = await f.prepare();
    const original = await f.pipeline.startAttempt(first.body, first.context); await f.pipeline.drain();
    f.storage.interruptAttempts();
    const branch = 'feat/landing'; const sha = 'b'.repeat(40);
    f.observation.base = { branch, sha, observedFrom: 'github' };
    f.observation.remote!.branch = { repositoryId: f.issue.repository.id, name: branch, sha };
    const saved = await f.preparations.createPreparation(f.projectId, {
      issue_id: f.issue.id, delivery_mode: 'icr', guidance: '', overrides: { base_branch: branch },
    }, { operationId: randomUUID(), expectedRevision: undefined });
    const p = saved.view.preparation;
    const next = await f.pipeline.startAttempt({ preparationId: p.id, preparationRevision: p.revision,
      authorizedSummaryHash: p.summary_hash, authorized: true }, { operationId: randomUUID(), expectedRevision: saved.etag });
    await f.pipeline.drain();
    expect(next.resource.id).not.toBe(original.resource.id);
    expect(f.storage.getAttempt(original.resource.id).result).toBe('interrupted');
    expect(f.workspaces.prepareAttempt).toHaveBeenLastCalledWith(expect.objectContaining({ baseSha: sha }));
  });
  it('automatically consumes one durable Ready cycle and rearms only after observed exit and eligible return', async () => {
    const f = await fixture();
    await f.pipeline.close();
    const settings = f.storage.getGlobalConfiguration();
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes: { automation_enabled: true } }, changes: { automation_enabled: true } });
    const project = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = project.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: project.etag, projectId: f.projectId,
      body: { project_changes: { automation_enabled: true } }, configuration: { ...configuration, automation_enabled: true }, globalChanges: {} });
    const item: ProjectItem = { id: 'ITEM_test', archived: false, kind: 'issue', contentId: f.issue.id, title: f.issue.title, url: f.issue.url, executable: true };
    vi.mocked(f.github.listProjectItems).mockResolvedValue(complete([item]));
    const queue = createQueue({ storage: f.storage, github: f.github, workspaces: f.workspaces, hostName: 'test-host' });
    f.pipeline = createPipeline({ ...f.dependencies, github: f.github, queue: { observe: queue.observe } });
    const base = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(base);
    try {
      await f.pipeline.tick(); await f.pipeline.drain();
      expect(f.logFailure.mock.calls).toEqual([]);
      let page = f.storage.listAttempts({ projectId: f.projectId, limit: '10' });
      expect(page.items).toHaveLength(1);
      const first = page.items[0]!;
      expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)).toMatchObject({ cycleNumber: 1, ready: true, consumedAttemptId: first.id });

      clock.mockReturnValue(base + 15_001); await f.pipeline.tick(); await f.pipeline.drain();
      expect(f.storage.listAttempts({ projectId: f.projectId, limit: '10' }).items).toHaveLength(1);

      f.storage.interruptAttempts();
      f.issue.memberships[0]!.statusValues[0]!.optionId = 'BACKLOG';
      clock.mockReturnValue(base + 30_002); await f.pipeline.tick();
      expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)).toMatchObject({ cycleNumber: 1, ready: false, consumedAttemptId: first.id });
      f.issue.memberships[0]!.statusValues[0]!.optionId = 'READY';
      clock.mockReturnValue(base + 45_003); await f.pipeline.tick(); await f.pipeline.drain();
      page = f.storage.listAttempts({ projectId: f.projectId, limit: '10' });
      expect(page.items).toHaveLength(2);
      const second = page.items.find(attempt => attempt.id !== first.id && attempt.issueId === f.issue.id);
      expect(second).toBeDefined();
      expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)).toMatchObject({ cycleNumber: 2, ready: true, consumedAttemptId: second!.id });
      clock.mockReturnValue(base + 60_004); await f.pipeline.tick(); await f.pipeline.drain();
      expect(f.storage.listAttempts({ projectId: f.projectId, limit: '10' }).items).toHaveLength(2);
      expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)?.cycleNumber).toBe(2);
    } finally { clock.mockRestore(); }
  });
  it('does not dispatch another Ready issue while an attempt is active', async () => {
    const f = await fixture();
    const global = f.storage.getGlobalConfiguration();
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: global.etag,
      body: { changes: { automation_enabled: true } }, changes: { automation_enabled: true } });
    const project = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = project.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: project.etag, projectId: f.projectId,
      body: { project_changes: { automation_enabled: true } }, configuration: { ...configuration, automation_enabled: true }, globalChanges: {} });

    const first = await f.prepare();
    await f.pipeline.startAttempt(first.body, first.context);
    await f.pipeline.drain();
    expect(f.storage.listAttempts({ projectId: f.projectId, limit: '10' }).items).toHaveLength(1);

    const secondIssueId = 'I_second';
    const secondIssue = { ...structuredClone(f.issue), id: secondIssueId, number: 18,
      url: `${f.issue.repository.url}/issues/18`, title: 'Second eligible issue',
      memberships: f.issue.memberships.map(membership => ({ ...membership, itemId: 'ITEM_second' })) };
    vi.mocked(f.github.getIssueContextById).mockImplementation(async id => complete(id === secondIssueId ? secondIssue : f.issue));
    vi.mocked(f.github.listProjectItems).mockResolvedValue(complete([
      { id: 'ITEM_test', archived: false, kind: 'issue', contentId: f.issue.id, title: f.issue.title, url: f.issue.url, executable: true },
      { id: 'ITEM_second', archived: false, kind: 'issue', contentId: secondIssueId, title: secondIssue.title, url: secondIssue.url, executable: true },
    ]));

      const queue = createQueue({ storage: f.storage, github: f.github, workspaces: f.workspaces, hostName: 'test-host' });
    const dispatchPipeline = createPipeline({ ...f.dependencies, github: f.github, queue: { observe: queue.observe } });
    try {
      const observed = await queue.observe({ limit: '100' });
      expect(observed.observation.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'QUEUE_OCCUPIED' })]));
      expect(observed.items).toEqual(expect.arrayContaining([expect.objectContaining({
        issueId: secondIssueId, eligible: false, reasons: expect.arrayContaining(['ATTEMPT_ACTIVE']),
      })]));

      await dispatchPipeline.tick();
      await dispatchPipeline.drain();
      expect(f.storage.listAttempts({ projectId: f.projectId, limit: '10' }).items).toHaveLength(1);
      expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
      expect(f.logFailure).not.toHaveBeenCalled();
    } finally { await dispatchPipeline.close(); }
  });
  it('does not dispatch from a rate-limited and incomplete queue observation', async () => {
    const f = await fixture();
    const global = f.storage.getGlobalConfiguration();
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: global.etag,
      body: { changes: { automation_enabled: true } }, changes: { automation_enabled: true } });
    const project = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = project.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: project.etag, projectId: f.projectId,
      body: { project_changes: { automation_enabled: true } }, configuration: { ...configuration, automation_enabled: true }, globalChanges: {} });
    vi.mocked(f.github.listProjectItems).mockResolvedValue({ state: 'rate_limited', data: null,
      diagnostics: [{ code: 'RATE_LIMITED', message: 'GitHub query rate limit reached.', recovery: 'Retry after the supplied reset time.' }],
      retryAtMs: Date.now() + 60_000 });

    const queue = createQueue({ storage: f.storage, github: f.github, workspaces: f.workspaces, hostName: 'test-host' });
    const dispatchPipeline = createPipeline({ ...f.dependencies, github: f.github, queue: { observe: queue.observe } });
    try {
      const observed = await queue.observe({ limit: '100' });
      expect(observed.observation).toMatchObject({ complete: false, eligibleTotal: null,
        diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'RATE_LIMITED' })]) });
      await dispatchPipeline.tick();
      await dispatchPipeline.drain();
      expect(f.storage.listAttempts({ projectId: f.projectId, limit: '10' }).items).toHaveLength(0);
      expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
      expect(f.logFailure).not.toHaveBeenCalled();
    } finally { await dispatchPipeline.close(); }
  });
  it('refuses invalid observations rather than filling tool versions or losing pending requirements', async () => {
    const f = await fixture(); const c = await f.prepare(); f.tools[0]!.version = null;
    await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toMatchObject({ code: 'CAPTURE_INVALID' });
    expect(f.storage.getOperation(c.context.operationId)).toBeNull(); expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  });
  it('migrates a real version-four database without modifying identity, configuration or historical operations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'factory-attempt-upgrade-'));
    const db = new Database(join(directory, 'factory.sqlite'));
    let identity: string; const operationId = randomUUID();
    try {
      db.pragma('foreign_keys=ON'); applyMigrations(db, loadMigrations().slice(0, 4), () => seedSettings(db, directory));
      const s = readSettings(db); identity = s.installation_id;
      saveTimeDefaults(db, { operationId, expectedRevision: settingsETag(s.installation_id, s.revision), timeDefaults: s.time_defaults });
    } finally { db.close(); }
    const storage = openStorage({ dataDirectory: directory });
    try {
    ; expect(storage.getSettings()).toMatchObject({ installation_id: identity, revision: 2 });
      expect(storage.getOperation(operationId)).toMatchObject({ state: 'succeeded', receipt: { revision: 2 } });
      const probe = new Database(join(directory, 'factory.sqlite'));
      try {
        expect(probe.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 0 }); expect(probe.pragma('foreign_key_check')).toEqual([]);
      } finally { probe.close(); }
    } finally { storage.close(); rmSync(directory, { recursive: true }); }
  });
});
