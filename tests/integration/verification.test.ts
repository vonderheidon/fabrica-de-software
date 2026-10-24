import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckDefinition, ImplementerResult, SessionResponse } from '#contracts';
import { attemptFixture, confirmTerminalStops, type AttemptFixture } from '../fixtures/attempt.js';
import { captureFixture } from '../fixtures/capture.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { createVerification } from '../../apps/controller/src/modules/verification/index.js';
import { type CheckProcessResult } from '../../apps/controller/src/modules/verification/runner.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createAttemptMaterializer } from '../../apps/controller/src/modules/workspaces/materialize.js';

const fixtures: AttemptFixture[] = []; const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const f of fixtures.splice(0)) await f.close(); });
const definitions: CheckDefinition[] = [{ id: 'typecheck', command: 'npm run typecheck', cwd_relative: '.', timeout_ms: 1234 }, { id: 'lint', command: 'npm run lint', cwd_relative: 'src' }];
async function fixture(auto = false, checks = definitions) {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  const f = await attemptFixture(join(process.cwd(), '.cache')); fixtures.push(f);
  const c = f.storage.getConfiguration(f.projectId);
  const { id: _id, project_id: _project, revision: _revision, created_at_ms: _time, ...configuration } = c.view.configuration;
  if (checks.length) f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: c.etag, projectId: f.projectId,
    body: { project_changes: { checks } }, configuration: { ...configuration, checks }, globalChanges: {} });
  const prepared = await f.prepare(); const op = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const a = f.storage.getAttempt(op.resource.id); const binding = f.persistence.getPassage({ passageId: a.passageId }).binding;
  const captured = await captureFixture(f.directory, { attemptId: a.id, passageId: a.passageId, deliveryId: binding.deliveryVersion });
  await mkdir(join(captured.implementation, 'src'));
  Object.assign(f.workspaces, { captureDelivery: captured.capture });
  const shared = createAttemptMaterializer(f.directory, captured.run, async path => path);
  const materializeCheck = vi.fn(async (d, id: string) => {
    expect(d.contentIdentity).toBe(f.storage.getDelivery(binding.deliveryVersion).delivery.contentIdentity);
    return shared(d, id);
  });
  const runner = vi.fn(async (_command: string, cwd: string, _timeout: number, _signal: AbortSignal): Promise<CheckProcessResult> => {
    expect(cwd).toContain('implementation');
    return { state: 'passed', exitCode: 0, diagnostic: null, endedAtMs: Date.now(), durationMs: 12, output: Buffer.from('<script>alert(1)</script>\nCheck passed 😀') };
  });
  const verification = createVerification({ storage: f.storage, workspaces: { materializeCheck }, dataDirectory: f.directory, logFailure: f.logFailure }, { runner, canonicalize: async p => p });
  if (auto) f.dependencies.verification = verification;
  const result: ImplementerResult = { formatVersion: 1, writesStopped: true, summary: 'Agent declares success but does not run controller checks',
    criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Declared'] })), checks: [] };
  const accept = () => f.persistence.acceptResult({ binding, result, sha256: digest(result) });
  const run = (reason?: string) => verification.verifyDelivery(binding.deliveryVersion, new AbortController().signal, reason);
  return { ...f, a, binding, captured, materializeCheck, runner, verification, accept, run };
}

describe('controller verification and external evidence', () => {
  it('retries the complete configured set after a partial failure with a durable reason for valid checks', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain();
    f.runner.mockResolvedValueOnce({ state: 'passed', exitCode: 0, output: Buffer.from('passed'), endedAtMs: Date.now() + 1000, durationMs: 1, diagnostic: null });
    f.runner.mockResolvedValueOnce({ state: 'failed', exitCode: 1, output: Buffer.from('failed'), endedAtMs: Date.now() + 1000, durationMs: 1, diagnostic: null });
    await f.run(); const previous = f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries;
    expect(f.storage.getDelivery(f.binding.deliveryVersion).verification?.state).toBe('failed');
    await f.run();
    const current = f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries.filter(c => c.runNumber === 2);
    expect(current).toHaveLength(2); expect(f.runner).toHaveBeenCalledTimes(4);
    expect(current.find(c => c.checkDefinitionId === 'typecheck')?.repeatReason).toContain('failed configured check set');
    expect(f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries.filter(c => c.runNumber === 1)).toEqual(previous);
  });
  it('requires a reason before repeating valid checks for the same version and preserves earlier evidence', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain(); await f.run();
    const previous = f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries;
    await expect(f.run()).rejects.toMatchObject({ code: 'VERIFICATION_NOT_ALLOWED' });
    expect(f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries).toEqual(previous);
    await f.run('Reproduce the result with a second process to inspect intermittent behavior.');
    const entries = f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries;
    expect(entries.filter(c => c.runNumber === 1)).toEqual(previous);
    expect(entries.filter(c => c.runNumber === 2).every(c => c.repeatReason?.includes('intermittent'))).toBe(true);
    expect(() => f.db.prepare("UPDATE checks SET repeat_reason='changed'").run()).toThrow();
  });
  it('runs captured definitions in the shared checkout and verifies integrity before and after every check', async () => {
    const f = await fixture(true); expect(f.runner).not.toHaveBeenCalled();
    f.accept(); await f.pipeline.drain();
    expect(f.runner).toHaveBeenCalledTimes(2); expect(f.materializeCheck).toHaveBeenCalledTimes(4);
    const page = f.storage.getCheckHistory(f.binding.deliveryVersion, {});
    expect(page.entries.map(c => c.command)).toEqual(expect.arrayContaining(definitions.map(c => c.command)));
    expect(page.entries.every(c => c.state === 'passed' && c.runNumber === 1 && c.contentIdentity === f.storage.getDelivery(c.deliveryId).delivery.contentIdentity)).toBe(true);
    expect(page.entries.map(c => c.timeoutMs).sort((a, b) => a - b)).toEqual([1234, 300_000]);
    expect(new Set(f.runner.mock.calls.map(call => call[1])).size).toBe(2);
    for (const c of page.entries) {
      expect(c.startedAtMs).toBeGreaterThan(0); expect(c.endedAtMs).toBeGreaterThanOrEqual(c.startedAtMs!); expect(c.durationMs).toBe(12);
      const artifact = c.artifacts[0]!; const result = await f.verification.getArtifact(artifact.id);
      expect(result.bytes.toString()).toContain('Check passed 😀'); expect(artifact.sizeBytes).toBe(result.bytes.length);
    }
    expect(f.storage.getDelivery(f.binding.deliveryVersion).verification).toMatchObject({ state: 'passed', runNumber: 1, checkCount: 2 });
    expect(f.storage.getAttempt(f.a.id).result).toBeNull();
  });
  it('keeps historical runs on the same tree with bounded pagination and captured commands despite later project changes', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain(); await f.run();
    const originalCapture = structuredClone(f.storage.getAttemptCapture(f.a.id));
    const previous = f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries;
    await f.run('Confirm captured commands remain stable after a same-version rerun.');
    f.storage.interruptAttempts();
    confirmTerminalStops(f, f.a.id);
    expect(f.storage.getConfiguration(f.projectId).view.configuration_lock).toBeNull();
    const c = f.storage.getConfiguration(f.projectId); const { id: _id, project_id: _p, revision: _r, created_at_ms: _t, ...configuration } = c.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: c.etag, projectId: f.projectId, body: { project_changes: { checks: [] } }, configuration: { ...configuration, checks: [] }, globalChanges: {} });
    expect(f.storage.getAttemptCapture(f.a.id)).toEqual(originalCapture);
    await expect(f.run()).rejects.toMatchObject({ code: 'VERIFICATION_NOT_ALLOWED' });
    const first = f.storage.getCheckHistory(f.binding.deliveryVersion, { limit: '1' }); expect(first.hasMore).toBe(true);
    const second = f.storage.getCheckHistory(f.binding.deliveryVersion, { cursor: first.nextCursor!, limit: '100' });
    expect(second.entries).toHaveLength(3); expect(second.entries.filter(c => c.runNumber === 1)).toEqual(previous);
    expect(f.runner).toHaveBeenCalledTimes(4);
    expect([...first.entries, ...second.entries].map(check => check.command)).toEqual(
      expect.arrayContaining(definitions.map(check => check.command)),
    );
    expect(() => f.storage.getCheckHistory(randomUUID(), { cursor: first.nextCursor! })).toThrow();
    expect(() => f.db.prepare("UPDATE checks SET command='changed'").run()).toThrow();
    expect(() => f.db.prepare('DELETE FROM artifacts').run()).toThrow(); expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it.each([
    ['failed', 2, null], ['error', null, 'CHECK_LAUNCH_FAILED'], ['error', null, 'CHECK_TIMEOUT_STOP_UNCONFIRMED'],
  ] as const)('distinguishes %s, exit %s and diagnostic %s', async (state, exitCode, diagnostic) => {
    const f = await fixture(false, definitions.slice(0, 1)); f.accept(); await f.pipeline.drain();
    f.runner.mockImplementationOnce(async () => ({ state, exitCode, diagnostic, endedAtMs: Date.now(), durationMs: 1, output: Buffer.from('pertinent check output') }));
    if (diagnostic?.includes('STOP_UNCONFIRMED')) await expect(f.run()).rejects.toMatchObject({ code: diagnostic }); else await f.run();
    expect(f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries[0]).toMatchObject({ state, exitCode, diagnostic });
    expect(f.storage.getDelivery(f.binding.deliveryVersion).verification?.state).toBe(state);
    expect(f.storage.getAttempt(f.a.id)).toMatchObject({ suspension: 'VERIFICATION_FAILED', result: null });
  });
  it('does not turn absence of checks into passed', async () => {
    const f = await fixture(false, []); f.accept(); await f.pipeline.drain(); await f.run();
    expect(f.runner).not.toHaveBeenCalled(); expect(f.storage.getDelivery(f.binding.deliveryVersion).verification).toMatchObject({ state: 'not_applicable', diagnostic: 'CHECKS_NOT_CONFIGURED' });
    expect(f.storage.getAttempt(f.a.id)).toMatchObject({ suspension: null, result: null });
  });
  it('keeps a technical failure when artifact IO fails even after process exit zero', async () => {
    const f = await fixture(false, definitions.slice(0, 1)); f.accept(); await f.pipeline.drain();
    await writeFile(join(f.directory, 'artifacts'), 'not a directory'); await f.run();
    expect(f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries[0]).toMatchObject({ state: 'error', exitCode: 0, diagnostic: 'ARTIFACT_INTEGRITY_FAILED', artifacts: [] });
    expect(f.storage.getDelivery(f.binding.deliveryVersion).verification?.state).toBe('error');
  });
  it('preserves timeout diagnosis and stops subsequent checks even when evidence IO also fails', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain();
    await writeFile(join(f.directory, 'artifacts'), 'not a directory');
    f.runner.mockImplementationOnce(async () => ({ state: 'error', exitCode: null, diagnostic: 'CHECK_TIMEOUT_STOP_UNCONFIRMED', endedAtMs: Date.now(), durationMs: 1234, output: Buffer.from('timed out') }));
    await expect(f.run()).rejects.toMatchObject({ code: 'CHECK_STOP_UNCONFIRMED' });
    expect(f.runner).toHaveBeenCalledOnce();
    expect(f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: 'error', executionDiagnostic: 'CHECK_TIMEOUT_STOP_UNCONFIRMED', diagnostic: 'ARTIFACT_INTEGRITY_FAILED' }),
    ]));
  });
  it('does not confirm exit zero as passed after cancellation and does not launch the next check', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain(); const abort = new AbortController();
    f.runner.mockImplementationOnce(async () => {
      abort.abort(); return { state: 'passed', exitCode: 0, diagnostic: null, endedAtMs: Date.now(), durationMs: 1, output: Buffer.from('late success') };
    });
    await expect(f.verification.verifyDelivery(f.binding.deliveryVersion, abort.signal)).rejects.toMatchObject({ code: 'VERIFICATION_CANCELLED' });
    expect(f.runner).toHaveBeenCalledOnce(); expect(f.storage.getDelivery(f.binding.deliveryVersion).verification?.state).toBe('error');
  });
  it.each(['artifact', 'event'])('rolls back success with %s failure and preserves the orphan for diagnosis', async failure => {
    const f = await fixture(false, definitions.slice(0, 1)); f.accept(); await f.pipeline.drain();
    f.db.exec(failure === 'artifact' ? "CREATE TRIGGER fail_check BEFORE INSERT ON artifacts BEGIN SELECT RAISE(ABORT,'fixture'); END" :
      "CREATE TRIGGER fail_check BEFORE INSERT ON events WHEN NEW.event_type='check.completed' BEGIN SELECT RAISE(ABORT,'fixture'); END");
    await expect(f.run()).rejects.toMatchObject({ code: 'VERIFICATION_PERSISTENCE_FAILED' });
    expect(f.storage.getDelivery(f.binding.deliveryVersion).verification).toMatchObject({ state: 'error', diagnostic: 'VERIFICATION_PERSISTENCE_FAILED' });
    expect(f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries[0]).toMatchObject({ state: 'error', artifacts: [] });
    const checkId = f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries[0]!.id;
    expect((await readdir(join(f.directory, 'artifacts', f.a.id, checkId))).filter(p => p.endsWith('.log'))).toHaveLength(1);
    f.db.exec('DROP TRIGGER fail_check'); await f.run(); expect(f.storage.getDelivery(f.binding.deliveryVersion).verification).toMatchObject({ state: 'passed', runNumber: 2 });
  });
  it('does not launch checks before a durable claim, under contention or on a concurrent request', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain(); f.db.exec('BEGIN IMMEDIATE');
    try { await expect(f.run()).rejects.toMatchObject({ code: 'CONFIGURATION_STORAGE_FAILED' }); } finally { f.db.exec('ROLLBACK'); }
    expect(f.runner).not.toHaveBeenCalled(); expect(f.materializeCheck).not.toHaveBeenCalled();
    const plan = f.storage.beginVerification(f.binding.deliveryVersion);
    await expect(f.run()).rejects.toMatchObject({ code: 'VERIFICATION_NOT_ALLOWED' }); expect(f.runner).not.toHaveBeenCalled();
    f.storage.finishVerification(plan.id, 'FIXTURE_STOPPED');
  });
  it('revokes success when attempt continuity is lost while a check is running', async () => {
    const f = await fixture(false, definitions.slice(0, 1)); f.accept(); await f.pipeline.drain();
    f.runner.mockImplementationOnce(async () => {
      f.persistence.record({ passageId: f.a.passageId }, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
      return { state: 'passed', exitCode: 0, diagnostic: null, endedAtMs: Date.now(), durationMs: 1, output: Buffer.from('late exit zero') };
    });
    await f.run(); expect(f.storage.getDelivery(f.binding.deliveryVersion).verification).toMatchObject({ state: 'error', diagnostic: 'VERIFICATION_CONTINUITY_REVOKED' });
    expect(f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries[0]?.state).toBe('error');
  });
  it('preserves completed checks/artifacts and interrupts unfinished intent across restart', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain(); await f.run();
    const old = f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries;
    const p = f.storage.beginVerification(f.binding.deliveryVersion, 'Inspect restart recovery during a repeated verification.'); f.storage.startCheck(p.checks[0]!.id);
    await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
      expect(reopened.getDelivery(f.binding.deliveryVersion).verification).toMatchObject({ state: 'error', diagnostic: 'VERIFICATION_INTERRUPTED' });
      expect(reopened.getCheckHistory(f.binding.deliveryVersion, {}).entries.filter(c => c.runNumber === 1)).toEqual(old);
      expect(reopened.getArtifact(old[0]!.artifacts[0]!.id)).toEqual(old[0]!.artifacts[0]);
    } finally { reopened.close(); }
  });
  it('migrates a real version-six database preserving captured refs and official result without fabricating check success', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain();
    const old = f.storage.getDelivery(f.binding.deliveryVersion).delivery; const identity = f.storage.getSettings().installation_id;
    const result = f.persistence.getResult({ passageId: f.a.passageId }); await f.pipeline.close(); f.storage.close();
    removeReviewSchema(f.db);
    f.db.exec('DROP TABLE artifacts; DROP TABLE checks; DROP TABLE verification_runs; DROP INDEX delivery_attempt_version; DELETE FROM schema_migrations WHERE version=7; PRAGMA user_version=6');
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
    expect(reopened.getDiagnostics().schemaVersion).toBe(42); expect(reopened.getSettings().installation_id).toBe(identity);
      expect(reopened.getDelivery(old.id)).toMatchObject({ delivery: old, verification: null });
      expect(reopened.executionPersistence().getResult({ passageId: f.a.passageId })).toEqual(result);
      expect(reopened.getCheckHistory(old.id, {}).entries).toEqual([]); expect(f.db.pragma('foreign_key_check')).toEqual([]);
    } finally { reopened.close(); }
  });
  it('serves protected inert evidence and diagnoses missing/corrupt bytes without accepting arbitrary paths', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain(); await f.run(); f.dependencies.verification = f.verification;
    const configuration = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory);
    const app = createApp(configuration, f.storage, undefined, undefined, undefined, f.pipeline); apps.push(app); await app.ready();
    const artifact = f.storage.getCheckHistory(f.binding.deliveryVersion, {}).entries[0]!.artifacts[0]!;
    const url = `/api/v1/artifacts/${artifact.id}`;
    expect((await app.inject({ url, headers: { host: new URL(configuration.browserOrigin).host } })).statusCode).toBe(401);
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host: new URL(configuration.browserOrigin).host, origin: configuration.browserOrigin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
    expect(bootstrap.statusCode).toBe(200); const session = bootstrap.json<SessionResponse>(); expect(session.csrf_token).toBeDefined();
    const cookie = bootstrap.cookies.map(c => `${c.name}=${c.value}`).join('; '); const headers = { host: new URL(configuration.browserOrigin).host, cookie };
    const response = await app.inject({ url, headers }); expect(response.statusCode).toBe(200); expect(response.body).toContain('<script>');
    expect(response.headers['content-type']).toContain('text/plain'); expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toContain('attachment'); expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect((await app.inject({ url: `${url}?path=../../file`, headers })).statusCode).toBe(400);
    const path = join(f.directory, 'artifacts', artifact.pathRelative); const bytes = await readFile(path);
    await writeFile(path, Buffer.alloc(bytes.length, 65));
    expect((await app.inject({ url, headers })).json()).toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED' });
    await rm(path); expect((await app.inject({ url, headers })).json()).toMatchObject({ code: 'ARTIFACT_MISSING' });
    expect((await app.inject({ url: `/api/v1/deliveries/${f.binding.deliveryVersion}/checks`, headers })).json()).toMatchObject({ entries: expect.any(Array), has_more: false });
    f.db.prepare('UPDATE factory_settings SET account_id=NULL').run(); expect((await app.inject({ url, headers })).statusCode).toBe(404);
  });
});
import { removeReviewSchema } from '../fixtures/review-schema.js';
