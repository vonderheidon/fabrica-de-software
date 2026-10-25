import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpControllerEventFrame, HttpDiagnosticsView, HttpOperationSummary, DiagnosticsView, type DiagnosticRequest, type SessionResponse } from '#contracts';
import { toHttpDiagnosticsView } from '../../apps/controller/src/http/observation-views.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createDiagnostics } from '../../apps/controller/src/modules/diagnostics/index.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { createWorkspaces } from '../../apps/controller/src/modules/workspaces/index.js';
import { applyMigrations, loadMigrations } from '../../apps/controller/src/modules/storage/migrations.js';
import { seedLegacySettings as seedSettings } from '../fixtures/legacy-settings.js';
import { attemptFixture } from '../fixtures/attempt.js';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'factory-diagnostics-'));
  cleanup.push(() => rmSync(directory, { recursive: true }));
  const storage = openStorage({ dataDirectory: directory, busyTimeoutMs: 10 }); cleanup.push(() => storage.close());
  const db = new Database(join(directory, 'factory.sqlite')); db.pragma('foreign_keys=ON'); cleanup.push(() => { db.close(); });
  const github = createGitHub(); const identity = vi.spyOn(github, 'getIdentity'); const logFailure = vi.fn();
  const preflight = vi.fn(async () => ({ ready: false, code: 'CONTEXT_MISSING' as const, ompVersion: null }));
  const diagnostics = createDiagnostics({ storage, github, execution: { preflight }, logFailure }); cleanup.push(() => diagnostics.drain());
  return { directory, storage, db, github, identity, preflight, logFailure, diagnostics };
}
const host = '127.0.0.1:4310';
async function httpFixture() {
  const f = fixture();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined,
    { github: f.github, workspaces: createWorkspaces({ github: f.github }) }, undefined, undefined, undefined, { execution: { preflight: f.preflight } });
  cleanup.push(() => app.close());
  const base = { host, origin: `http://${host}`, 'content-type': 'application/json', 'x-factory-client': 'web' };
  const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: base, payload: {} });
  const headers = { ...base, cookie: String(response.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': response.json<SessionResponse>().csrf_token };
  return { ...f, app, headers };
}

describe('operational snapshots and contextual diagnostic observations', () => {
  it('returns real empty-installation facts and no GET effects', async () => {
    const f = await httpFixture();
    const observer = new Database(join(f.directory, 'factory.sqlite')); cleanup.push(() => { observer.close(); });
    const before = observer.pragma('data_version', { simple: true });
    const response = await f.app.inject({ url: '/api/v1/operation', headers: f.headers });
    expect(response.statusCode).toBe(200); expect(Value.Check(HttpOperationSummary, response.json())).toBe(true);
    expect(response.json()).toMatchObject({ account: { id: null, observed_id: null }, automation: { enabled: false, dispatch_paused: true },
      active_attempt: null, next_candidates: [], recent_results: [], integration_status: { state: 'not_checked', proves_provider_execution: false }, event_cursor: '0' });
    const diagnosis = await f.app.inject({ url: '/api/v1/diagnostics?scope=host', headers: f.headers });
    expect(diagnosis.statusCode).toBe(200); expect(Value.Check(HttpDiagnosticsView, diagnosis.json())).toBe(true);
    expect(diagnosis.json<HttpDiagnosticsView>().diagnostics.map(d => d.code)).toContain('ACCOUNT_UNOBSERVED');
    expect(observer.pragma('data_version', { simple: true })).toBe(before);
    expect(f.identity).not.toHaveBeenCalled(); expect(f.preflight).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT count(*) AS n FROM diagnostic_runs').get()).toEqual({ n: 0 });
  });
  it('commits intent before observation and deduplicates accepted or completed commands without new IO', async () => {
    const f = fixture(); const id = randomUUID(); const body: DiagnosticRequest = { scope: 'host', checks: ['maestri_context', 'github_identity'] };
    f.identity.mockImplementation(async () => {
      expect(f.storage.getOperation(id)).toMatchObject({ state: 'accepted', resource: { type: 'diagnostic', id } });
      expect(f.db.prepare('SELECT state FROM diagnostic_runs WHERE operation_id=?').get(id)).toEqual({ state: 'accepted' });
      return { state: 'context_unavailable', data: null, diagnostics: [], retryAtMs: null };
    });
    const first = await f.diagnostics.verify(body, id);
    expect(first.state).toBe('accepted'); expect(f.preflight).not.toHaveBeenCalled();
    expect(await f.diagnostics.verify({ ...body, checks: [...body.checks].reverse() }, id)).toEqual(first);
    await f.diagnostics.drain();
    expect(f.identity).toHaveBeenCalledTimes(1); expect(f.preflight).toHaveBeenCalledTimes(1);
    expect(f.storage.getOperation(id)?.state).toBe('succeeded');
    const view = f.diagnostics.get({ scope: 'host' }); expect(Value.Check(DiagnosticsView, view)).toBe(true);
    expect(view.reports[0]?.diagnostics.every(d => d.state === 'unavailable' && d.cause && d.recovery && d.affectedRequirements.length)).toBe(true);
    expect(await f.diagnostics.verify(body, id)).toEqual(f.storage.getOperation(id));
    expect(f.preflight).toHaveBeenCalledTimes(1);
    await expect(f.diagnostics.verify({ scope: 'host', checks: ['configuration'] }, id)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.storage.getOperationSummary({}).integrationStatus).toMatchObject({ state: 'observed', observation: { state: 'unavailable' }, provesProviderExecution: false });
  });
  it('supports scope discriminators and rejects unsupported checks and foreign IDs before IO', async () => {
    const f = await httpFixture();
    for (const query of ['scope=host&id='+randomUUID(), 'scope=project', 'scope=attempt&id=bad', 'scope=unknown']) {
      expect((await f.app.inject({ url: '/api/v1/diagnostics?'+query, headers: f.headers })).statusCode).toBe(400);
    }
    for (const scope of ['project', 'attempt', 'creation']) expect((await f.app.inject({ url: `/api/v1/diagnostics?scope=${scope}&id=${randomUUID()}`, headers: f.headers })).statusCode).toBe(404);
    for (const payload of [{ checks: ['resources'] }, { checks: ['shell'] }, { checks: [] }, { checks: ['configuration', 'configuration'] }, { checks: ['configuration'], command: 'SYNTHETIC_SECRET' }]) {
      expect((await f.app.inject({ method: 'POST', url: '/api/v1/diagnostics?scope=host', headers: { ...f.headers, 'idempotency-key': randomUUID() }, payload })).statusCode).toBe(400);
    }
    expect(f.identity).not.toHaveBeenCalled(); expect(f.preflight).not.toHaveBeenCalled();
  });
  it('protects diagnostic commands and exposes a durable Location/receipt without changing settings', async () => {
    const f = await httpFixture(); const url = '/api/v1/diagnostics?scope=host'; const payload = { checks: ['configuration'] };
    expect((await f.app.inject({ url: '/api/v1/operation', headers: { host } })).statusCode).toBe(401);
    expect((await f.app.inject({ method: 'POST', url, headers: { host, origin: `http://${host}` }, payload })).statusCode).toBe(401);
    expect((await f.app.inject({ method: 'POST', url, headers: { ...f.headers, 'x-csrf-token': 'invalid' }, payload })).statusCode).toBe(403);
    const settings = f.storage.getSettings(); const id = randomUUID();
    const response = await f.app.inject({ method: 'POST', url, headers: { ...f.headers, 'idempotency-key': id }, payload });
    expect(response.statusCode).toBe(202); expect(response.headers.location).toBe('/api/v1/operations/'+id);
    expect(response.json()).toMatchObject({ operation_id: id, resource: { type: 'diagnostic', id }, receipt: { revision: 1, event_cursor: '1' } });
    await vi.waitFor(() => expect(f.storage.getOperation(id)?.state).toBe('succeeded'));
    expect(f.storage.getSettings()).toEqual(settings);
    const report = (await f.app.inject({ url, headers: f.headers })).json<HttpDiagnosticsView>();
    expect(Value.Check(HttpDiagnosticsView, report)).toBe(true);
    expect(report.reports[0]?.diagnostics.length).toBeGreaterThan(4);
    expect(report.reports[0]?.diagnostics.every(item => item.check === 'configuration')).toBe(true);
    expect(report.reports[0]?.diagnostics[0]?.facts).toMatchObject({
      implementer_profile_count: 0, reviewer_profile_count: 0, onboarding_completed_at_ms: null,
      projects_root_configured: false, projects_root_confirmed: false,
    });
    expect(report.reports[0]?.diagnostics[0]).toMatchObject({ code: 'ACCOUNT_UNOBSERVED', state: 'blocked' });
    expect(report.reports[0]?.receipt).toEqual(response.json().receipt);
    expect((await f.app.inject({ url: '/api/v1/operations/'+id, headers: f.headers })).json()).toMatchObject({ state: 'succeeded' });
  });
  it('rejects changed context and never records credentials or raw exceptions', async () => {
    const f = fixture(); let release!: () => void;
    f.identity.mockImplementation(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      throw new Error('SYNTHETIC_SECRET Authorization: Bearer private');
    });
    const id = randomUUID(); await f.diagnostics.verify({ scope: 'host', checks: ['github_identity'] }, id);
    await vi.waitFor(() => expect(f.identity).toHaveBeenCalled());
    f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: f.storage.getSettings().time_defaults });
    release(); await f.diagnostics.drain();
    expect(f.storage.getOperation(id)?.state).toBe('failed');
    const report = f.diagnostics.get({ scope: 'host' }); expect(report.reports[0]?.diagnostics[0]?.code).toBe('DIAGNOSTIC_CONTEXT_CHANGED');
    expect(JSON.stringify(report)).not.toContain('SYNTHETIC_SECRET'); expect(JSON.stringify(f.logFailure.mock.calls)).not.toContain('SYNTHETIC_SECRET');
    expect(f.db.prepare('SELECT diagnostics_json FROM diagnostic_runs').all().toString()).not.toContain('SYNTHETIC_SECRET');
  });
  it.each(['operation_requests', 'diagnostic_runs', 'events'])('rolls back failed intent at %s before observation', async table => {
    const f = fixture(); f.db.exec(`CREATE TRIGGER diagnostic_fault BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fixture failure'); END`);
    const id = randomUUID(); await expect(f.diagnostics.verify({ scope: 'host', checks: ['github_identity'] }, id)).rejects.toThrow();
    await f.diagnostics.drain(); expect(f.identity).not.toHaveBeenCalled(); expect(f.storage.getOperation(id)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM diagnostic_runs').get()).toEqual({ n: 0 }); expect(f.storage.getEvents({}).items).toEqual([]);
  });
  it('persists restart interruption, recovers the original receipt and never replays checks', async () => {
    const f = fixture(); const command = { operationId: randomUUID(), body: { scope: 'host' as const, checks: ['github_identity' as const] } };
    const accepted = f.storage.acceptDiagnostic(command).operation;
    const reopened = openStorage({ dataDirectory: f.directory }); cleanup.push(() => reopened.close()); reopened.interruptDiagnostics();
    expect(reopened.getOperation(command.operationId)).toMatchObject({ state: 'unknown', receipt: accepted.receipt });
    expect(reopened.getContextDiagnostics({ scope: 'host' }).reports[0]?.diagnostics[0]?.code).toBe('DIAGNOSTIC_INTERRUPTED');
    expect(reopened.getContextDiagnostics({ scope: 'host' }).reports[0]?.receipt).toEqual(accepted.receipt);
    expect(reopened.recoverDiagnostic(command)?.receipt).toEqual(accepted.receipt);
    reopened.interruptDiagnostics(); expect(reopened.getEvents({}).items.map(e => e.eventType)).toEqual(['diagnostic.accepted', 'diagnostic.interrupted']);
    expect(f.identity).not.toHaveBeenCalled();
  });
  it('binds project and attempt events and diagnostics to the current account', async () => {
    const f = await attemptFixture(); cleanup.push(() => f.close());
    const saved = await f.prepare(); const operation = await f.pipeline.startAttempt(saved.body, saved.context); await f.pipeline.drain();
    const attemptId = operation.resource.id;
    const diagnostics = createDiagnostics({ storage: f.storage, github: f.github, execution: f.execution, logFailure: vi.fn() }); cleanup.push(() => diagnostics.close());
    const id = randomUUID(); await diagnostics.verify({ scope: 'attempt', id: attemptId, checks: ['resources', 'github_identity'] }, id); await diagnostics.drain();
    const view = diagnostics.get({ scope: 'attempt', id: attemptId }); expect(Value.Check(DiagnosticsView, view)).toBe(true);
    expect(view.reports[0]?.diagnostics[1]).toMatchObject({ state: 'passed', facts: { projectId: f.projectId, attemptId } });
    const events = f.storage.getEvents({ projectId: f.projectId, attemptId, operationId: id });
    expect(events.items).toHaveLength(2); expect(events.items.every(e => e.projectId === f.projectId && e.attemptId === attemptId)).toBe(true);
    const storedIssue = f.db.prepare('SELECT p.name,a.capture_json,a.created_at_ms FROM attempts a JOIN projects p ON p.id=a.project_id WHERE a.id=?').get(attemptId) as { name: string; capture_json: string; created_at_ms: number };
    const issue = JSON.parse(storedIssue.capture_json).issue;
    expect(events.items[0]?.context).toMatchObject({ projectName: storedIssue.name, issueNumber: issue.number, issueTitle: issue.title, attemptCreatedAtMs: storedIssue.created_at_ms });
    expect(f.storage.getEvents({ attemptId }).items.find(event => event.eventType === 'attempt.accepted')?.context?.round).toBe(1);
    expect(f.storage.getOperationSummary({ projectId: f.projectId }).activeAttempt?.id).toBe(attemptId);
    const otherProject = f.register(); expect(() => f.storage.getEvents({ projectId: otherProject, attemptId })).toThrowError(expect.objectContaining({ statusCode: 404 }));
    f.db.prepare("UPDATE factory_settings SET account_id=NULL,automation_enabled=0,revision=revision+1").run();
    expect(() => diagnostics.get({ scope: 'attempt', id: attemptId })).toThrowError(expect.objectContaining({ statusCode: 404 }));
    expect(f.storage.getOperation(id)).toBeNull(); expect(f.storage.getEvents({}).items.some(e => e.operationId === id)).toBe(false);
    expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
  });
  it('filters technical events before pagination and binds the cursor to that choice', async () => {
    const f = await httpFixture();
    for (let i = 0; i < 4; i++) f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: f.storage.getSettings().time_defaults });
    f.db.prepare("INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms) SELECT entity_type,entity_id,operation_id,'cleanup-updated',entity_revision+100,'{}',occurred_at_ms FROM events WHERE seq IN (2,4)").run();
    const first = (await f.app.inject({ url: '/api/v1/events?include_technical=false&limit=1', headers: f.headers })).json();
    expect(first).toMatchObject({ items: [{ seq: '4' }], has_more: true });
    const next = await f.app.inject({ url: `/api/v1/events?include_technical=false&limit=1&cursor=${first.next_cursor}`, headers: f.headers });
    expect(next.json()).toMatchObject({ items: [{ seq: '3' }], has_more: true });
    expect((await f.app.inject({ url: `/api/v1/events?include_technical=true&cursor=${first.next_cursor}`, headers: f.headers })).statusCode).toBe(400);
    const all = await f.app.inject({ url: '/api/v1/events?include_technical=true', headers: f.headers });
    expect(all.json().items.map((event: { seq: string }) => event.seq)).toEqual(['6', '5', '4', '3', '2', '1']);
  });
  it('keeps a stable event-page ceiling when new events arrive and binds cursors to filters', async () => {
    const f = await httpFixture();
    for (let i = 0; i < 3; i++) f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: f.storage.getSettings().time_defaults });
    const first = (await f.app.inject({ url: '/api/v1/events?limit=1', headers: f.headers })).json<{ next_cursor: string; event_cursor: string }>();
    f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: f.storage.getSettings().time_defaults });
    const next = await f.app.inject({ url: '/api/v1/events?cursor='+first.next_cursor+'&limit=100', headers: f.headers });
    expect(next.json()).toMatchObject({ items: [{ seq: '2' }, { seq: '1' }], event_cursor: first.event_cursor, has_more: false });
    expect(f.storage.getEvents({ cursor: first.event_cursor }).items.map(e => e.seq)).toEqual(['4']);
    expect((await f.app.inject({ url: '/api/v1/events?cursor='+first.next_cursor+'&operation_id='+randomUUID(), headers: f.headers })).statusCode).toBe(400);
    const other = await httpFixture();
    expect((await other.app.inject({ url: '/api/v1/events?cursor='+first.next_cursor, headers: other.headers })).statusCode).toBe(400);
    f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('OTHER_SCOPE', 'other', 1, 1, 1);
    f.db.prepare('UPDATE factory_settings SET account_id=?,revision=revision+1').run('OTHER_SCOPE');
    expect((await f.app.inject({ url: '/api/v1/events?cursor='+first.next_cursor, headers: f.headers })).statusCode).toBe(400);
    for (const cursor of ['bad', '9007199254740992', '9999']) {
      const result = await f.app.inject({ url: '/api/v1/events/stream?cursor='+cursor, headers: f.headers });
      expect(result.statusCode).toBe(200); expect(result.body).toContain('event: resync'); expect(result.body).not.toContain('id: ');
    }
  });
  it('replays events created after a snapshot and gives Last-Event-ID precedence without duplicates', async () => {
    const f = await httpFixture();
    const snapshot = f.storage.getOperationSummary({});
    const operationId = randomUUID();
    f.storage.saveTimeDefaults({ operationId, expectedRevision: f.storage.getSettingsETag(), timeDefaults: f.storage.getSettings().time_defaults });
    const read = f.storage.getEvents.bind(f.storage);
    const getEvents = vi.spyOn(f.storage, 'getEvents').mockImplementationOnce(query => read(query)).mockImplementation(() => { throw new Error('stop fixture stream'); });
    const first = await f.app.inject({ url: '/api/v1/events/stream?cursor=invalid', headers: { ...f.headers, 'last-event-id': snapshot.eventCursor } });
    const frameLine = first.body.split('\n').find(line => line.startsWith('data: {"entity"'));
    expect(frameLine).toBeDefined();
    const frame: unknown = JSON.parse(frameLine!.slice(6));
    expect(Value.Check(HttpControllerEventFrame, frame)).toBe(true);
    expect(frame).toMatchObject({ operation_id: operationId, event_type: 'settings.time-defaults.updated' });
    expect(frame).not.toHaveProperty('seq');
    expect(first.body.match(/^id: /gm)).toHaveLength(1); expect(first.body).toContain('id: 1\n'); expect(first.body).toContain(operationId);
    expect(getEvents.mock.calls[0]?.[0].cursor).toBe(snapshot.eventCursor);
    getEvents.mockReset().mockImplementationOnce(query => read(query)).mockImplementation(() => { throw new Error('stop fixture stream'); });
    const reconnect = await f.app.inject({ url: '/api/v1/events/stream?cursor=0', headers: { ...f.headers, 'last-event-id': '1' } });
    expect(reconnect.body).not.toContain('id: 1\n'); expect(getEvents.mock.calls[0]?.[0].cursor).toBe('1');
    expect(f.storage.listAttempts({}).items).toEqual([]); expect(f.db.prepare('SELECT count(*) AS n FROM operation_requests').get()).toEqual({ n: 1 });
  });
  it('keeps failed completion atomic, records a sanitized failure and does not repeat verification', async () => {
    const f = fixture(); f.db.exec("CREATE TRIGGER diagnostic_completion_fault BEFORE INSERT ON events WHEN NEW.event_type='diagnostic.completed' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_SECRET'); END");
    const operationId = randomUUID(); await f.diagnostics.verify({ scope: 'host', checks: ['github_identity'] }, operationId); await f.diagnostics.drain();
    expect(f.storage.getOperation(operationId)?.state).toBe('accepted');
    expect(f.storage.getContextDiagnostics({ scope: 'host' }).reports[0]).toMatchObject({ state: 'accepted', diagnostics: [] });
    expect(f.logFailure).toHaveBeenCalledWith('DIAGNOSTIC_PERSISTENCE_FAILED');
    await f.diagnostics.verify({ scope: 'host', checks: ['github_identity'] }, operationId); await f.diagnostics.drain(); expect(f.identity).toHaveBeenCalledTimes(1);
    f.db.exec('DROP TRIGGER diagnostic_completion_fault'); f.storage.interruptDiagnostics();
    expect(f.storage.getOperation(operationId)?.state).toBe('unknown');
  });
  it('refuses SQL busy or concurrent checks before another observation', async () => {
    const f = fixture(); const body: DiagnosticRequest = { scope: 'host', checks: ['github_identity'] };
    f.db.exec('BEGIN IMMEDIATE');
    try { await expect(f.diagnostics.verify(body, randomUUID())).rejects.toThrow(); }
    finally { f.db.exec('ROLLBACK'); }
    expect(f.identity).not.toHaveBeenCalled();
    let release!: () => void;
    f.identity.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve; }); return { state: 'context_unavailable', data: null, diagnostics: [], retryAtMs: null }; });
    await f.diagnostics.verify(body, randomUUID()); await vi.waitFor(() => expect(f.identity).toHaveBeenCalledTimes(1));
    await expect(f.diagnostics.verify(body, randomUUID())).rejects.toMatchObject({ code: 'DIAGNOSTIC_ACTIVE' });
    release(); await f.diagnostics.drain(); expect(f.identity).toHaveBeenCalledTimes(1);
  });
  it('keeps creation context separate, rejects unsupported execution checks and omits its full plan', async () => {
    const f = fixture(); const creationId = randomUUID(); const sourceOperationId = randomUUID(); const settings = f.storage.getSettings();
    // Poison full documents deliberately: these existing-fact projections must never deserialize them.
    f.db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash)
      VALUES (?,?,'scaffold.create','creation',?,?)`).run(sourceOperationId, settings.installation_id, creationId, 'a'.repeat(64));
    f.db.prepare(`INSERT INTO project_creations(id,operation_id,installation_id,plan_hash,plan_json,destination,state,created_at_ms)
      VALUES (?,?,?,?,?,?,'partial',1)`).run(creationId, sourceOperationId, settings.installation_id, 'a'.repeat(64), '{"private_plan":"SYNTHETIC_SECRET"}', join(f.directory, 'own-creation'));
    const id = randomUUID(); const body: DiagnosticRequest = { scope: 'creation', id: creationId, checks: ['github_identity'] };
    await f.diagnostics.verify(body, id); await f.diagnostics.drain();
    const view = f.diagnostics.get({ scope: 'creation', id: creationId });
    expect(view.context).toEqual({ scope: 'creation', id: creationId }); expect(view.reports[0]?.diagnostics[0]?.facts.creationId).toBe(creationId);
    expect(JSON.stringify(view)).not.toContain('SYNTHETIC_SECRET');
    expect(f.diagnostics.get({ scope: 'host' }).reports).toEqual([]);
    await expect(f.diagnostics.verify({ scope: 'creation', id: creationId, checks: ['maestri_context'] }, randomUUID())).rejects.toMatchObject({ code: 'DIAGNOSTIC_CHECK_UNSUPPORTED' });
    expect(f.preflight).not.toHaveBeenCalled();
    expect(() => f.db.prepare("UPDATE diagnostic_runs SET scope='host' WHERE operation_id=?").run(id)).toThrow();
    expect(() => f.db.prepare('DELETE FROM diagnostic_runs WHERE operation_id=?').run(id)).toThrow();
  });
  it('projects only recorded eligible candidates in observed order and preserves current results', async () => {
    const f = await attemptFixture(); cleanup.push(() => f.close());
    const previous = f.storage.getConfiguration(f.projectId); const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAtMs, ...config } = previous.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), projectId: f.projectId, expectedRevision: previous.etag, body: { project_changes: { automation_enabled: true } },
      configuration: { ...config, automation_enabled: true }, globalChanges: {} });
    f.storage.recordQueueObservations(['I_z', 'I_a', 'I_blocked'].map((issueId, i) => ({ accountId: 'ACCOUNT_test', projectId: f.projectId, issueId, ready: true, eligible: i < 2, existingAttemptId: null })));
    const summary = f.storage.getOperationSummary({ projectId: f.projectId });
    expect(summary.nextCandidates.map(c => c.issueId)).toEqual(['I_z', 'I_a']); expect(summary.candidateObservation.requiresRevalidation).toBe(true);
    const before = JSON.stringify(summary);
    f.db.prepare("UPDATE queue_cycles SET last_eligible=NULL,observed_ordinal=NULL WHERE issue_id='I_z'").run();
    expect(f.storage.getOperationSummary({ projectId: f.projectId }).nextCandidates.map(c => c.issueId)).toEqual(['I_a']);
    expect(before).not.toContain('Profile guidance'); expect(before).not.toContain('Executable issue');
    const prepared = await f.prepare(); const op = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
    f.storage.interruptAttempts(); const current = f.storage.getOperationSummary({ projectId: f.projectId });
    expect(current.activeAttempt).toBeNull(); expect(current.recentResults[0]).toMatchObject({ id: op.resource.id, result: 'interrupted' });
  });
  it('migrates actual v17 without reseeding or inventing observations', () => {
    const f = fixture(); const directory = mkdtempSync(join(tmpdir(), 'factory-v17-diagnostics-')); cleanup.push(() => rmSync(directory, { recursive: true }));
    const db = new Database(join(directory, 'factory.sqlite')); applyMigrations(db, loadMigrations().slice(0, 17), () => seedSettings(db, directory));
    const identity = db.prepare('SELECT installation_id FROM factory_settings').get(); db.close();
    const reopened = openStorage({ dataDirectory: directory }); cleanup.push(() => reopened.close());
    expect(reopened.getDiagnostics().schemaVersion).toBe(49); expect(reopened.getSettings().installation_id).toEqual((identity as { installation_id: string }).installation_id);
    expect(reopened.getContextDiagnostics({ scope: 'host' }).reports).toEqual([]); expect(reopened.getOperationSummary({}).integrationStatus.state).toBe('not_checked');
    expect(f.storage.getDiagnostics().schemaVersion).toBe(49);
  });
});

  it('refuses camelCase query and command aliases without any accepted operation or partial write', async () => {
    const f = await httpFixture(); const id = randomUUID();
    const before = { operations: f.db.prepare('SELECT * FROM operation_requests').all(), events: f.db.prepare('SELECT * FROM events').all() };
    for (const url of [
      '/api/v1/operation?projectId='+id, '/api/v1/operation?project_id='+id+'&projectId='+id,
      '/api/v1/events?operationId='+id, '/api/v1/events?projectId='+id, '/api/v1/events?attemptId='+id,
      '/api/v1/events/stream?operation_id='+id+'&operationId='+id, '/api/v1/queue?projectIds='+id,
      '/api/v1/queue?project_id='+id+'&projectId='+id,
    ]) expect((await f.app.inject({ url, headers: f.headers })).statusCode, url).toBe(400);
    for (const payload of [
      { enabled: false, scope: { kind: 'account', projectIds: [] } },
      { enabled: false, scope: { kind: 'account', project_ids: [], projectIds: [] } },
      { enabled: false, scope: { kind: 'account', project_ids: [] }, observationId: id },
      { enabled: false, scope: { kind: 'account', project_ids: [] }, authorizedSummaryHash: 'hash' },
    ]) expect((await f.app.inject({ method: 'PUT', url: '/api/v1/queue', payload, headers: { ...f.headers, 'if-match': '"fixture"', 'idempotency-key': randomUUID() } })).statusCode).toBe(400);
    expect(f.db.prepare('SELECT * FROM operation_requests').all()).toEqual(before.operations);
    expect(f.db.prepare('SELECT * FROM events').all()).toEqual(before.events);
    expect(f.identity).not.toHaveBeenCalled(); expect(f.preflight).not.toHaveBeenCalled();
  });
  it('projects stored diagnostic reports without rewriting their private JSON or receipts, including reopen', async () => {
    const f = await httpFixture(); const id = randomUUID();
    const command = { method: 'POST' as const, url: '/api/v1/diagnostics?scope=host', headers: { ...f.headers, 'idempotency-key': id }, payload: { checks: ['github_identity'] } };
    const accepted = await f.app.inject(command); expect(accepted.statusCode).toBe(202);
    await vi.waitFor(() => expect(f.storage.getOperation(id)?.state).toBe('succeeded'));
    const snapshot = () => ({ reports: f.db.prepare('SELECT * FROM diagnostic_runs ORDER BY operation_id').all(), operations: f.db.prepare('SELECT * FROM operation_requests ORDER BY operation_id').all() });
    const before = snapshot(); const changes = f.db.prepare('SELECT total_changes() AS n').get();
    const response = await f.app.inject({ url: '/api/v1/diagnostics?scope=host', headers: f.headers });
    expect(Value.Check(HttpDiagnosticsView, response.json())).toBe(true);
    const report = response.json<HttpDiagnosticsView>().reports[0]!;
    expect(report).toMatchObject({ operation_id: id, receipt: accepted.json().receipt, diagnostics: [{ affected_requirements: expect.any(Array), observed_at_ms: expect.any(Number) }] });
    const replay = await f.app.inject(command); expect(replay.statusCode).toBe(202); expect(replay.json().receipt).toEqual(accepted.json().receipt);
    expect(f.identity).toHaveBeenCalledTimes(1);
    expect(snapshot()).toEqual(before); expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
    await f.app.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
      expect(toHttpDiagnosticsView(reopened.getContextDiagnostics({ scope: 'host' })).reports[0]).toEqual(report);
      expect(snapshot()).toEqual(before);
    } finally { reopened.close(); }
  });
