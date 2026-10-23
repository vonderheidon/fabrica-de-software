import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeletionPreview, SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createDeletionCoordinator } from '../../apps/controller/src/modules/projects/index.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createDeletionInspector } from '../../apps/controller/src/modules/workspaces/index.js';
import { attemptFixture } from '../fixtures/attempt.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const f = await attemptFixture();
  cleanup.push(() => f.close());
  // Metadata-only, controlled filesystem. These tests never delete a real path.
  const inspector = createDeletionInspector({ pathStyle: 'windows', caseSensitive: false,
    policyVersion: 'http-controlled-reference/v1', safeReferenceRemoval: true,
    observe: async path => ({ path, resolvedPath: path, kind: 'directory', identity: path.toLowerCase(),
      ancestors: [{ path: 'C:\\', resolvedPath: 'C:\\', identity: 'volume' }] }) });
  const workspaces = { ...inspector, removeProjectDeletion: vi.fn(inspector.reconcileProjectDeletion) };
  const coordinator = createDeletionCoordinator({ storage: f.storage, workspaces, logFailure: vi.fn() });
  // Keep acceptance pending for deterministic assertions; resume uses the real coordinator.
  const schedule = vi.spyOn(coordinator, 'schedule').mockResolvedValue();
  const config = loadConfiguration({ FACTORY_LOG_LEVEL: 'silent' }, f.directory);
  const app = createApp(config, f.storage, undefined, { github: { ...createGitHub(), ...f.github }, workspaces: f.workspaces },
    { github: f.github, workspaces: f.workspaces }, f.pipeline, undefined, undefined, { workspaces, coordinator });
  cleanup.push(async () => { await coordinator.close(); await app.close(); });
  const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: {
    host: new URL(config.browserOrigin).host, origin: config.browserOrigin, 'content-type': 'application/json', 'x-factory-client': 'web',
  }, payload: {} });
  expect(session.statusCode).toBe(200);
  const headers = { host: new URL(config.browserOrigin).host, origin: config.browserOrigin, 'content-type': 'application/json',
    cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<SessionResponse>().csrf_token };
  const preview = async () => {
    const result = await app.inject({ method: 'GET', url: `/api/v1/projects/${f.projectId}/deletion-preview`, headers });
    expect(result.statusCode).toBe(200);
    return { body: result.json<DeletionPreview>(), etag: String(result.headers.etag), response: result };
  };
  const accept = async () => {
    const p = await preview(); const id = randomUUID();
    const body = { confirmed: true, authorization_digest: p.body.authorization_digest };
    const commandHeaders = { ...headers, 'idempotency-key': id, 'if-match': p.etag };
    const response = await app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/deletion`, headers: commandHeaders, payload: body });
    expect(response.statusCode).toBe(202);
    return { id, body, commandHeaders, response };
  };
  return { ...f, app, config, headers, preview, accept, coordinator, schedule, deletionWorkspaces: workspaces };
}

describe('project deletion HTTP boundary', () => {
  it.each(['accepted', 'running', 'pending', 'finalizing'] as const)(
    'reopens SQLite from %s and recovers the original authorization after a final receipt failure', async state => {
      const f = await fixture();
      const accepted = await f.accept();
      const otherId = f.register();
      const preserved = f.storage.getConfiguration(otherId).view.configuration;
      f.db.prepare("UPDATE project_deletions SET state=?,reason='Interrupção de teste',recovery='Retome a mesma operação' WHERE operation_id=?").run(state, accepted.id);
      f.db.exec("CREATE TRIGGER fail_integrated_receipt BEFORE INSERT ON project_deletion_receipts BEGIN SELECT RAISE(ABORT,'INJECTED_RECEIPT_FAILURE'); END");
      await f.app.close();
      const reopened = openStorage({ dataDirectory: f.directory });
      const coordinator = createDeletionCoordinator({ storage: reopened, workspaces: f.deletionWorkspaces, logFailure: vi.fn() });
      cleanup.push(async () => { await coordinator.close(); reopened.close(); });
      coordinator.recover(); await coordinator.drain();
      expect(reopened.getProjectDeletion(accepted.id)).toMatchObject({ state: 'pending', can_retry: true });
      expect(reopened.getProject(f.projectId).view.project.id).toBe(f.projectId);
      expect(f.db.prepare('SELECT * FROM project_deletion_receipts').all()).toEqual([]);
      expect(reopened.getConfiguration(otherId).view.configuration).toEqual(preserved);
      f.db.exec('DROP TRIGGER fail_integrated_receipt');
      await coordinator.resume(accepted.id); await coordinator.drain();
      expect(reopened.getProjectDeletion(accepted.id)).toEqual({ operation_id: accepted.id, state: 'succeeded' });
      expect(reopened.getConfiguration(otherId).view.configuration).toEqual(preserved);
      expect(f.db.prepare('SELECT operation_id FROM project_deletion_receipts').all()).toEqual([{ operation_id: accepted.id }]);
      expect(f.execution.startPassage).not.toHaveBeenCalled();
      expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
    },
  );

  it('completes URL-only deletion through the coordinator and registers a fresh context without restoring the old command', async () => {
    const f = await fixture();
    const otherId = f.register();
    const other = f.storage.getConfiguration(otherId);
    const accepted = await f.accept();
    f.schedule.mockRestore();
    await f.coordinator.schedule(accepted.id);
    await f.coordinator.drain();
    expect(f.storage.getProjectDeletion(accepted.id)).toEqual({ operation_id: accepted.id, state: 'succeeded' });
    const response = await f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: {
      ...f.headers, 'idempotency-key': randomUUID(),
    }, payload: { name: 'Project', source: { kind: 'github', location: f.issue.repository.url }, base_branch: 'main' } });
    expect(response.statusCode).toBe(201);
    const registered = response.json<{ project: { id: string }; configuration?: unknown }>();
    const projectId = registered.project.id;
    expect([f.projectId, otherId]).not.toContain(projectId);
    expect(f.storage.getConfiguration(projectId).view.configuration.automation_enabled).toBe(false);
    const currentOther = f.storage.getConfiguration(otherId);
    expect(currentOther.etag).toBe(other.etag);
    expect(currentOther.view.configuration).toEqual(other.view.configuration);
    expect(f.db.prepare('SELECT * FROM attempts WHERE project_id=?').all(projectId)).toEqual([]);
    expect(f.db.prepare('SELECT * FROM queue_cycles WHERE project_id=?').all(projectId)).toEqual([]);
    const replay = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/deletion`,
      headers: accepted.commandHeaders, payload: accepted.body });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ operation_id: accepted.id, state: 'succeeded' });
    expect(f.storage.getConfiguration(projectId).view.configuration.automation_enabled).toBe(false);
    expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
  });

  it('exposes durable acceptance, replay, light summaries and protected independent status', async () => {
    const f = await fixture(); const p = await f.preview();
    expect(p.response.headers['cache-control']).toBe('no-store');
    expect(p.etag).toBe(f.storage.getProject(f.projectId).etag);
    const accepted = await f.accept();
    expect(accepted.response.headers.location).toBe(`/api/v1/project-deletions/${accepted.id}`);
    expect(accepted.response.json()).toMatchObject({ operation_id: accepted.id, state: 'accepted' });
    expect(f.schedule).toHaveBeenCalledTimes(1);
    const replay = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/deletion`, headers: accepted.commandHeaders, payload: accepted.body });
    expect(replay.statusCode).toBe(202); expect(f.schedule).toHaveBeenCalledTimes(1);
    for (const url of [`/api/v1/projects/${f.projectId}`, `/api/v1/projects/${f.projectId}/configuration`, '/api/v1/projects']) {
      const result = await f.app.inject({ method: 'GET', url, headers: f.headers });
      expect(result.statusCode).toBe(200);
      const view = result.json<{ deletion?: unknown; items?: { deletion: unknown }[] }>();
      expect(view.items ? view.items[0]?.deletion : view.deletion).toMatchObject({ operation_id: accepted.id, state: 'accepted' });
      expect(JSON.stringify(view.items?.[0]?.deletion ?? view.deletion)).not.toContain('targets');
    }
    const status = await f.app.inject({ method: 'GET', url: `/api/v1/project-deletions/${accepted.id}`, headers: f.headers });
    expect(status.statusCode).toBe(200); expect(status.headers['x-content-type-options']).toBe('nosniff');
    expect(f.deletionWorkspaces.removeProjectDeletion).not.toHaveBeenCalled();
    const blocked = await f.app.inject({ method: 'PUT', url: `/api/v1/projects/${f.projectId}/configuration`, headers: {
      ...f.headers, 'idempotency-key': randomUUID(), 'if-match': f.storage.getConfiguration(f.projectId).etag,
    }, payload: { project_changes: { guidance: 'Do not save' } } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: 'PROJECT_DELETION_PENDING', recovery: expect.any(String) });
  });

  it('returns only the minimal receipt after finalization, including confirmation replay and resume', async () => {
    const f = await fixture(); const accepted = await f.accept();
    const sharedTerminalId = randomUUID();
    f.db.prepare(`INSERT INTO managed_terminals(id,installation_id,host_name,role,owner,generation,terminal_name,state,created_at_ms,updated_at_ms)
      VALUES (?,?,?,'implementer','factory',1,?,'planned',1,1)`).run(sharedTerminalId, f.storage.getSettings().installation_id, 'test-host', `factory-${sharedTerminalId}`);
    const worker = f.storage.deletionWorker.claim(accepted.id)!;
    f.storage.deletionWorker.start(worker);
    // Controlled proof of absence; no actual filesystem removal.
    f.db.prepare("UPDATE project_deletion_targets SET state='removed',verified_at_ms=1 WHERE operation_id=?").run(accepted.id);
    f.storage.finalizeProjectDeletion({ operationId: accepted.id, projectId: f.projectId, workerGeneration: worker.generation, workerToken: worker.token });
    expect(f.db.prepare('SELECT id FROM managed_terminals WHERE id=?').get(sharedTerminalId)).toEqual({ id: sharedTerminalId });
    const minimal = { operation_id: accepted.id, state: 'succeeded' };
    for (const url of [`/api/v1/project-deletions/${accepted.id}`, `/api/v1/operations/${accepted.id}`]) {
      const result = await f.app.inject({ method: 'GET', url, headers: f.headers });
      expect(result.statusCode).toBe(200); expect(result.json()).toEqual(minimal);
    }
    const replay = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/deletion`, headers: accepted.commandHeaders, payload: accepted.body });
    expect(replay.statusCode).toBe(200); expect(replay.json()).toEqual(minimal);
    const resume = await f.app.inject({ method: 'POST', url: `/api/v1/project-deletions/${accepted.id}/resume`, headers: {
      ...f.headers, 'idempotency-key': accepted.id,
    }, payload: {} });
    expect(resume.statusCode).toBe(200); expect(resume.json()).toEqual(minimal);
    const detail = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${f.projectId}`, headers: f.headers });
    expect(detail.statusCode).toBe(404);
    expect(f.deletionWorkspaces.removeProjectDeletion).not.toHaveBeenCalled();
  });

  it('rejects invalid security and confirmation contracts before acceptance or worker effects', async () => {
    const f = await fixture(); const p = await f.preview();
    const base = { ...f.headers, 'idempotency-key': randomUUID(), 'if-match': p.etag };
    const body = { confirmed: true, authorization_digest: p.body.authorization_digest };
    const cases = [
      { headers: { ...base, host: 'evil.test' }, payload: body, code: 403 },
      { headers: { ...base, origin: 'https://evil.test' }, payload: body, code: 403 },
      { headers: { ...base, 'sec-fetch-site': 'cross-site' }, payload: body, code: 403 },
      { headers: { ...base, cookie: '' }, payload: body, code: 401 },
      { headers: { ...base, 'x-csrf-token': '' }, payload: body, code: 403 },
      { headers: { ...base, 'content-type': 'text/plain' }, payload: JSON.stringify(body), code: 415 },
      { headers: { ...base, 'idempotency-key': 'bad' }, payload: body, code: 400 },
      { headers: base, payload: { ...body, confirmed: false }, code: 400 },
      { headers: base, payload: { ...body, path: 'C:\\private' }, code: 400 },
      { headers: base, payload: { ...body, authorization_digest: 'bad' }, code: 400 },
      { headers: base, payload: { ...body, authorization_digest: 'b'.repeat(64) }, code: 409 },
      { headers: { ...base, 'if-match': 'stale' }, payload: body, code: 412 },
    ];
    for (const test of cases) {
      const result = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/deletion`, headers: test.headers, payload: test.payload });
      expect(result.statusCode).toBe(test.code);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.json()).toMatchObject({ code: expect.any(String), message: expect.any(String), request_id: expect.any(String) });
      expect(result.body).not.toContain('C:\\private');
    }
    const { 'if-match': _etag, ...missing } = base;
    const result = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/deletion`, headers: missing, payload: body });
    expect(result.statusCode).toBe(428);
    expect(f.schedule).not.toHaveBeenCalled(); expect(f.deletionWorkspaces.removeProjectDeletion).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT * FROM project_deletions').all()).toEqual([]);
  });

  it('enforces resume key and empty body and preserves unsafe pending authorization', async () => {
    const f = await fixture(); const accepted = await f.accept();
    const worker = f.storage.deletionWorker.claim(accepted.id)!;
    f.storage.deletionWorker.finish(worker, 'pending', 'Conferência necessária.', 'Tente novamente.');
    const url = `/api/v1/project-deletions/${accepted.id}/resume`;
    for (const [key, payload] of [[randomUUID(), {}], [accepted.id, { path: 'external' }]] as const) {
      expect((await f.app.inject({ method: 'POST', url, headers: { ...f.headers, 'idempotency-key': key }, payload })).statusCode).toBe(400);
    }
    vi.spyOn(f.deletionWorkspaces, 'reconcileProjectDeletion').mockImplementation(async (_input, prior) => ({ ...prior,
      preview: { ...prior.preview, can_confirm: false, blockers: [{ reason: 'A pasta foi substituída.', recovery: 'Retire a substituta e tente novamente.' }] } }));
    const unsafe = await f.app.inject({ method: 'POST', url, headers: { ...f.headers, 'idempotency-key': accepted.id }, payload: {} });
    expect(unsafe.statusCode).toBe(409);
    expect(f.storage.getProjectDeletion(accepted.id)).toMatchObject({ state: 'reconfirmation_required' });
    expect(f.deletionWorkspaces.removeProjectDeletion).not.toHaveBeenCalled();
  });

  it('returns running status to concurrent resumes without awaiting removal or launching another worker', async () => {
    const f = await fixture(); const accepted = await f.accept();
    const worker = f.storage.deletionWorker.claim(accepted.id)!;
    f.storage.deletionWorker.finish(worker, 'pending', 'Execução interrompida.', 'Tente novamente.');
    let release!: () => void;
    const removal = new Promise<void>(resolve => { release = resolve; });
    f.deletionWorkspaces.removeProjectDeletion.mockImplementation(async (input, prior) => {
      await removal; return f.deletionWorkspaces.reconcileProjectDeletion(input, prior);
    });
    const url = `/api/v1/project-deletions/${accepted.id}/resume`;
    const resume = () => f.app.inject({ method: 'POST', url, headers: { ...f.headers, 'idempotency-key': accepted.id }, payload: {} });
    try {
      const first = await resume();
      expect(first.statusCode).toBe(202); expect(first.json()).toMatchObject({ state: 'running' });
      const second = await resume();
      expect(second.statusCode).toBe(202); expect(second.json()).toMatchObject({ state: 'running' });
      expect(f.deletionWorkspaces.removeProjectDeletion).toHaveBeenCalledTimes(1);
      expect(f.db.prepare("SELECT count(*) AS n FROM operation_requests WHERE operation_kind='project.delete'").get()).toEqual({ n: 1 });
    } finally { release(); await f.coordinator.drain(); }
  });

  it('keeps unavailable inspection sanitized and rate limiting active without worker effects', async () => {
    const f = await fixture();
    vi.spyOn(f.deletionWorkspaces, 'inspectProjectDeletion').mockRejectedValue(new Error('private filesystem detail'));
    const result = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${f.projectId}/deletion-preview`, headers: f.headers });
    expect(result.statusCode).toBe(503); expect(result.body).not.toContain('private filesystem detail');
    let status = 200;
    for (let i = 0; i < 600 && status !== 429; i++) {
      const response = await f.app.inject({ method: 'GET', url: `/api/v1/project-deletions/${randomUUID()}`, headers: f.headers });
      status = response.statusCode;
      if (status === 429) {
        expect(response.headers['retry-after']).toBe('60');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
      }
    }
    expect(status).toBe(429); expect(f.schedule).not.toHaveBeenCalled();
    expect(f.deletionWorkspaces.removeProjectDeletion).not.toHaveBeenCalled();
  });

});
