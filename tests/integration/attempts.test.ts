import { toHttpStartAttempt } from '../../apps/controller/src/http/execution-views.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { AttemptCapture, OperationAccepted, type SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { readCapturedConfiguration, serializeCapture } from '../../apps/controller/src/modules/storage/historical-configuration.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { attemptFixture, complete, type AttemptFixture } from '../fixtures/attempt.js';

const fixtures: AttemptFixture[] = [];
const apps: ReturnType<typeof createApp>[] = [];
const host = '127.0.0.1:4310';
const origin = `http://${host}`;
async function fixture() { const f = await attemptFixture(); fixtures.push(f); return f; }
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const f of fixtures.splice(0)) await f.close();
});
async function start(f: AttemptFixture) {
  const command = await f.prepare(); const operation = await f.pipeline.startAttempt(command.body, command.context);
  await f.pipeline.drain();
  return { ...command, operation, id: operation.resource.id, status: f.storage.getAttempt(operation.resource.id), capture: f.storage.getAttemptCapture(operation.resource.id) };
}

describe('manual attempt composition and HTTP', () => {
  it('commits capture, criteria, round, passage and resource intentions before any clone or process', async () => {
    const f = await fixture();
    const savedConfiguration = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...configuration } = savedConfiguration.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), projectId: f.projectId, expectedRevision: savedConfiguration.etag,
      body: { project_changes: { queue_order: { use_board_position: false } } },
      configuration: { ...configuration, queue_order: { use_board_position: false } }, globalChanges: {} });
    const command = await f.prepare();
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => {
      const a = f.storage.getAttempt(input.attemptId);
      expect(f.storage.getOperation(command.context.operationId)?.receipt).toBeDefined();
      expect(f.db.prepare('SELECT count(*) AS n FROM attempt_criteria WHERE attempt_id=?').get(a.id)).toEqual({ n: 2 });
      expect(f.db.prepare('SELECT count(*) AS n FROM rounds WHERE attempt_id=?').get(a.id)).toEqual({ n: 1 });
      expect(f.db.prepare('SELECT count(*) AS n FROM resources WHERE attempt_id=?').get(a.id)).toEqual({ n: 2 });
      expect(f.storage.getAttemptCapture(a.id).roleResources).toEqual(f.roles);
      expect(f.execution.startPassage).not.toHaveBeenCalled();
      return { state: 'prepared', attemptId: a.id, baseSha: input.baseSha, branch: `factory/17/${a.id}`,
        resource: { kind: 'implementation', path: join(f.directory, 'work', a.id, 'implementation'), owned: true }, diagnostic: null };
    });
    const operation = await f.pipeline.startAttempt(command.body, command.context);
    expect(operation.state).toBe('accepted'); expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
    await f.pipeline.drain();
    expect(f.storage.getAttempt(operation.resource.id)).toMatchObject({ phase: 'implementing', result: null, suspension: null, tracking: 'tracked', round: 1 });
    expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
    expect(f.execution.preflight).not.toHaveBeenCalled();
    const capture = f.storage.getAttemptCapture(operation.resource.id);
    expect(Value.Check(AttemptCapture, capture)).toBe(true);
    expect(capture.criteria.map(c => c.id)).toEqual(['ac-1', 'ac-2']);
    expect(capture.summaryHash).toBe(command.body.authorizedSummaryHash);
    expect(capture.preparationRevision).toBe(f.storage.getPreparation(command.body.preparationId).view.revision);
    expect(capture.configuration.configuration).not.toHaveProperty('checks');
    expect(capture.configuration.configuration.queue_order).toEqual({ use_board_position: false });
    expect(JSON.stringify(capture.configuration)).not.toMatch(/priority_field_id|priority_direction/);
    expect(capture.configuration.origins).toMatchObject({ time_defaults: 'global', delivery_mode: 'preparation' });
    expect(capture.configuration.origins).not.toHaveProperty('checks');
    const captureDocument = f.db.prepare<[string], { capture_json: string }>('SELECT capture_json FROM attempts WHERE id=?').get(operation.resource.id)!;
    expect(captureDocument.capture_json).not.toContain('"checks"');
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it('persists role sessions before occupancy and reuses only a released physical terminal with a new OMP session', async () => {
    const f = await fixture(); const first = await start(f);
    const firstHandle = { passageId: first.status.passageId };
    const firstSession = f.persistence.getAttemptSession(firstHandle);
    expect(f.db.prepare('SELECT role,state FROM attempt_sessions WHERE attempt_id=? ORDER BY role').all(first.id))
      .toEqual([{ role: 'implementer', state: 'active' }, { role: 'reviewer', state: 'reserved' }]);
    expect(f.db.prepare('SELECT state FROM terminal_occupancies WHERE attempt_id=?').all(first.id)).toEqual([{ state: 'occupied' }]);
    const capture = f.storage.getAttemptCapture(first.id);
    const result = { formatVersion: 1 as const, summary: 'Implemented', writesStopped: true as const,
      criteria: capture.criteria.map(c => ({ criterionId: c.id, verdict: 'passed' as const, evidence: ['Observed'] })), checks: [] };
    f.persistence.acceptResult({ binding: f.persistence.getPassage(firstHandle).binding, result, sha256: digest(result) });
    expect(f.db.prepare('SELECT state FROM terminal_occupancies WHERE attempt_id=?').all(first.id)).toEqual([{ state: 'released' }]);
    expect(f.db.prepare('SELECT state FROM managed_terminals WHERE id=?').get(firstSession.managedTerminalId)).toEqual({ state: 'available' });
    f.db.prepare("UPDATE attempts SET phase='finished',result='delivered' WHERE id=?").run(first.id);
    const saved = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAtMs, ...configuration } = saved.view.configuration;
    expect(() => f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: saved.etag, projectId: f.projectId,
      body: { project_changes: { guidance: 'Idle terminal does not lock configuration.' } },
      configuration: { ...configuration, guidance: 'Idle terminal does not lock configuration.' }, globalChanges: {} })).not.toThrow();
    await f.pipeline.drain();

    f.issue.id = 'I_other'; f.issue.number = 18;
    const second = await start(f); const secondHandle = { passageId: second.status.passageId };
    const secondSession = f.persistence.getAttemptSession(secondHandle);
    expect(secondSession.id).not.toBe(firstSession.id);
    expect(secondSession.attemptId).not.toBe(firstSession.attemptId);
    expect(secondSession.managedTerminalId).toBe(firstSession.managedTerminalId);
    expect(secondSession.terminalId).toBe(firstSession.terminalId);
    expect(secondSession.ompSessionId).not.toBe(firstSession.ompSessionId);
    expect(secondSession.sessionDirectoryRelative).not.toBe(firstSession.sessionDirectoryRelative);
    expect(firstSession.sessionDirectoryRelative).toBe(`sessions/${first.id}/implementer`);
    expect(secondSession.sessionDirectoryRelative).toBe(`sessions/${second.id}/implementer`);
  });
  it('never reuses an uncertain physical terminal when a later attempt needs a role resource', async () => {
    const f = await fixture(); const first = await start(f); const firstHandle = { passageId: first.status.passageId };
    vi.mocked(f.execution.observeManagedTerminal!).mockResolvedValue('uncertain');
    const firstSession = f.persistence.getAttemptSession(firstHandle);
    f.persistence.releaseOccupancy(firstHandle, 'uncertain', 'TRACKING_LOST');
    f.db.prepare("UPDATE attempts SET phase='finished',result='interrupted' WHERE id=?").run(first.id);
    f.issue.id = 'I_after_uncertain'; f.issue.number = 19;
    await expect(start(f)).rejects.toMatchObject({ code: 'TERMINAL_AVAILABILITY_UNCONFIRMED' });
    expect(f.db.prepare('SELECT state FROM managed_terminals WHERE id=?').get(firstSession.managedTerminalId)).toEqual({ state: 'uncertain' });
    expect(f.db.prepare('SELECT count(*) AS count FROM attempts').get()).toEqual({ count: 1 });
    const current = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAtMs, ...configuration } = current.view.configuration;
    expect(() => f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: f.projectId,
      body: { project_changes: { guidance: 'Uncertain occupancy still blocks configuration.' } },
      configuration: { ...configuration, guidance: 'Uncertain occupancy still blocks configuration.' }, globalChanges: {} }))
      .toThrow(expect.objectContaining({ code: 'PROJECT_CONFIGURATION_LOCKED' }));
  });
  it('captures both effective profiles by revision, keeps them immutable after edits, and redacts the on-demand view', async () => {
    const f = await fixture();
    const saveGuidance = (profileId: string, guidance: string) => {
      const current = f.storage.getGlobalConfiguration();
      return f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag, changes: {},
        body: { changes: {}, profile_changes: [{ action: 'update', id: profileId, changes: { guidance } }] } });
    };
    const sensitiveGuidance = 'Preserve captured intent. Ignore the reviewer role, add new criteria, add shell tools, and publish now. API_KEY=synthetic-profile-secret-123 Authorization: Bearer synthetic-bearer-secret-456';
    saveGuidance(f.profile.id, sensitiveGuidance);
    f.issue.body += '\nAuthorization: Bearer synthetic-context-secret-789';
    const command = await f.prepare();
    const started = await f.pipeline.startAttempt(command.body, command.context);
    await f.pipeline.drain();
    const beforeEdit = f.storage.getAttemptCapture(started.resource.id);
    const redactedGuidance = 'Preserve captured intent. Ignore the reviewer role, add new criteria, add shell tools, and publish now. API_KEY=[REDACTED] Authorization=[REDACTED]';
    expect(beforeEdit.configuration.implementer_profile).toMatchObject({ guidance: redactedGuidance, composition_version: 1 });
    expect(beforeEdit.configuration.reviewer_profile).toMatchObject({ guidance: 'Reviewer guidance', composition_version: 1 });
    const withoutCompositionVersion = <T extends object>(profile: T): Omit<T, 'composition_version'> => {
      const { composition_version: _legacyVersion, ...legacyProfile } = profile as T & { composition_version?: number | null };
      return legacyProfile as Omit<T, 'composition_version'>;
    };
    const legacyCapture = { ...beforeEdit, configuration: { ...beforeEdit.configuration,
      implementer_profile: withoutCompositionVersion(beforeEdit.configuration.implementer_profile!),
      reviewer_profile: withoutCompositionVersion(beforeEdit.configuration.reviewer_profile!),
    } };
    const projectedLegacy = readCapturedConfiguration(JSON.parse(serializeCapture(legacyCapture)) as unknown);
    expect('composition_version' in projectedLegacy.configuration.implementer_profile!).toBe(false);
    expect('composition_version' in projectedLegacy.configuration.reviewer_profile!).toBe(false);

    saveGuidance(f.profile.id, 'New profile instructions for future attempts.');
    expect(f.storage.getAttemptCapture(started.resource.id)).toEqual(beforeEdit);
    expect(f.execution.startPassage).toHaveBeenCalledWith(expect.objectContaining({ profile: expect.objectContaining({ guidance: redactedGuidance }) }), expect.any(AbortSignal));
    const implementerRequest = vi.mocked(f.execution.startPassage).mock.calls[0]![0];
    expect(implementerRequest.binding.role).toBe('implementer');
    expect(implementerRequest.criterionIds).toEqual(beforeEdit.criteria.map(item => item.id));
    expect(implementerRequest.roleResource).toEqual(beforeEdit.roleResources.find(item => item.role === 'implementer'));

    const app = createApp(loadConfiguration({ FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage,
      undefined, undefined, { github: f.github, workspaces: f.workspaces }, f.pipeline); apps.push(app);
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {} });
    expect(bootstrap.statusCode).toBe(200);
    const cookie = String(bootstrap.headers['set-cookie']).split(';')[0]!;
    const details = await app.inject({ url: `/api/v1/attempts/${started.resource.id}?section=profiles&limit=2`, headers: { host, cookie } });
    expect(details.statusCode, details.body).toBe(200);
    const profiles = details.json().details;
    expect(profiles.section).toBe('profiles');
    expect(profiles.items).toHaveLength(2);
    const capturedImplementer = beforeEdit.configuration.implementer_profile!;
    expect(profiles.items[0]).toMatchObject({ role: 'implementer', profile_id: f.profile.id, profile_revision: 'revision' in capturedImplementer ? capturedImplementer.revision : null,
      guidance: redactedGuidance, composition_version: 1, credentials_redacted: true });
    expect(profiles.items[0].context_summary).toContain('Executable issue');
    expect(profiles.items[0].technical_contract_summary).toContain('schemas fechados');
    expect(details.body).not.toContain('synthetic-profile-secret-123');
    expect(details.body).not.toContain('synthetic-bearer-secret-456');
    expect(details.body).not.toContain('synthetic-context-secret-789');
    expect(profiles.items[1]).toMatchObject({ role: 'reviewer', profile_id: f.reviewerProfile.id, composition_version: 1, credentials_redacted: true });
  });
  it('blocks an uncomposed legacy profile before clone and allows explicit repair within the unchanged limit', async () => {
    const f = await fixture();
    const profile = f.storage.getGlobalConfiguration().view.profiles.find(item => item.id === f.profile.id)!;
    f.db.prepare('UPDATE execution_profiles SET composition_version=NULL,revision=revision+1,updated_at_ms=updated_at_ms+1 WHERE id=?').run(profile.id);
    const command = await f.prepare();
    const preview = await f.preparations.getPreparation(command.body.preparationId);
    expect(preview.view.preparation.prerequisites.map(item => item.code)).toContain('PROFILE_COMPOSITION_REQUIRED');
    await expect(f.pipeline.startAttempt(command.body, command.context)).rejects.toMatchObject({ code: 'START_PREREQUISITES' });
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();

    const current = f.storage.getGlobalConfiguration();
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag, changes: {},
      body: { changes: {}, profile_changes: [{ action: 'update', id: profile.id, changes: { guidance: 'Explicit replacement guidance' } }] } });
    expect(f.storage.getGlobalConfiguration().view.profiles.find(item => item.id === profile.id)).toMatchObject({ composition_version: 1, guidance: 'Explicit replacement guidance' });
    await expect(f.pipeline.startAttempt(command.body, command.context)).rejects.toMatchObject({ code: 'SUMMARY_CHANGED' });
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  });
  it('returns 202 and Location without awaiting a clone, then recovers a lost response before new IO', async () => {
    const f = await fixture();
    const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage,
      undefined, undefined, { github: f.github, workspaces: f.workspaces }, f.pipeline); apps.push(app);
    const command = await f.prepare();
    const host = '127.0.0.1:4310'; const origin = `http://${host}`;
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {} });
    const headers = { host, origin, 'content-type': 'application/json', cookie: String(bootstrap.headers['set-cookie']).split(';')[0]!,
      'x-csrf-token': bootstrap.json<SessionResponse>().csrf_token, 'idempotency-key': command.context.operationId, 'if-match': command.context.expectedRevision };
    let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
    const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => { await wait; return original(input); });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/attempts', headers, payload: toHttpStartAttempt(command.body) });
      expect(response.statusCode, response.body).toBe(202); expect(Value.Check(OperationAccepted, response.json())).toBe(true);
      expect(response.headers.location).toBe(`/api/v1/operations/${command.context.operationId}`);
      const attempts = f.db.prepare('SELECT count(*) AS n FROM attempts').get();
      const replay = await app.inject({ method: 'POST', url: '/api/v1/attempts', headers, payload: toHttpStartAttempt(command.body) });
      expect(replay.statusCode).toBe(202); expect(replay.json<OperationAccepted>().receipt).toEqual(response.json<OperationAccepted>().receipt);
      expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual(attempts);
      expect(f.observeTools).toHaveBeenCalledTimes(1);
      const get = await app.inject({ url: String(response.headers.location), headers: { host, cookie: headers.cookie } });
      expect(get.statusCode).toBe(200); expect(get.json().resource).toEqual(response.json().resource);
      expect((await app.inject({ method: 'POST', url: '/api/v1/attempts', headers: { ...headers, 'x-csrf-token': '' }, payload: toHttpStartAttempt(command.body) })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/v1/attempts', headers, payload: { ...toHttpStartAttempt(command.body), extra: 'secret-marker' } })).statusCode).toBe(400);
    } finally { release(); await f.pipeline.drain(); }
    const id = f.storage.getOperation(command.context.operationId)!.resource.id;
    const detail = await app.inject({ url: `/api/v1/attempts/${id}`, headers: { host, cookie: headers.cookie } });
    expect(detail.statusCode).toBe(200); expect(detail.headers.etag).toBeDefined(); expect(detail.body).not.toContain('capture_json');
    const second = await f.prepare(f.register());
    const conflict = await app.inject({ method: 'POST', url: '/api/v1/attempts', headers: { ...headers, 'idempotency-key': second.context.operationId, 'if-match': second.context.expectedRevision }, payload: toHttpStartAttempt(second.body) });
    expect(conflict.statusCode, conflict.body).toBe(409); expect(conflict.json()).toMatchObject({ code: 'ATTEMPT_ACTIVE', resource: { type: 'attempt', id } });
  });
  it('serializes simultaneous starts across duplicate project registrations by account/repository/issue', async () => {
    const f = await fixture(); const a = await f.prepare(); const b = await f.prepare(f.register());
    const results = await Promise.allSettled([f.pipeline.startAttempt(a.body, a.context), f.pipeline.startAttempt(b.body, b.context)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'ATTEMPT_ACTIVE', resource: { type: 'attempt' } } });
    await f.pipeline.drain(); expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1); expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
  });
  it.each(['icr', 'commit', 'pr'] as const)('revalidates Ready and all authority prerequisites for %s', async mode => {
    const f = await fixture(); const p = await f.prepare();
    const updated = await f.preparations.updatePreparation(p.body.preparationId, { changes: { delivery_mode: mode, ...(mode === 'icr' ? {} : { publication_target: { format_version: 1, repository_id: f.issue.repository.id, selection: { kind: 'existing_clone', path: join(f.directory,'target') } } }) } }, { operationId: randomUUID(), expectedRevision: p.context.expectedRevision });
    const body = { ...p.body, preparationRevision: 2, authorizedSummaryHash: updated.view.preparation.summary_hash };
    f.issue.assignees.push({ id: 'OTHER', login: 'other' });
    await expect(f.pipeline.startAttempt(body, { operationId: randomUUID(), expectedRevision: updated.etag })).rejects.toMatchObject({ code: 'SUMMARY_CHANGED' });
    const current = await f.preparations.getPreparation(p.body.preparationId);
    await expect(f.pipeline.startAttempt({ ...body, authorizedSummaryHash: current.view.preparation.summary_hash }, { operationId: randomUUID(), expectedRevision: updated.etag })).rejects.toMatchObject({ code: 'START_PREREQUISITES' });
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  });
  it.each(['closed', 'ready', 'project', 'membership', 'remote', 'base', 'dependency', 'account', 'partial'] as const)('refuses invalid %s observations before effects', async target => {
    const f = await fixture();
    if (target === 'closed') f.issue.state = 'CLOSED';
    if (target === 'ready') f.issue.memberships[0]!.statusValues[0]!.optionId = 'PROGRESS';
    if (target === 'project') f.project.project.closed = true;
    if (target === 'membership') f.issue.memberships = [];
    if (target === 'remote') f.observation.remote!.confirmed = false;
    if (target === 'base') f.observation.remote!.branch!.sha = 'b'.repeat(40);
    if (target === 'dependency') f.issue.blockers.push({ id: 'I_block', number: 4, title: 'Blocker', url: 'https://github.com/test-org/repo/issues/4', state: 'OPEN' });
    if (target === 'account') vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
    if (target === 'partial') vi.mocked(f.github.getIdentity).mockResolvedValue({ state: 'partial', data: null, diagnostics: [], retryAtMs: null });
    const c = await f.prepare(); await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toMatchObject({ code: 'START_PREREQUISITES' });
    expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 0 }); expect(f.execution.startPassage).not.toHaveBeenCalled();
  });
  it.each([
    ['remote', 'REMOTE_UNCONFIRMED'],
    ['publication', 'CODE_NOT_PUBLISHED'],
    ['board', 'PROJECT_REQUIRED'],
  ] as const)('shows %s as a specific prerequisite and refuses manual start before physical preparation', async (target, reason) => {
    const f = await fixture();
    if (target === 'remote') {
      f.observation.remote = null;
      f.observation.diagnostics.push({ code: 'REMOTE_MISSING', message: 'No remote.', recovery: 'Configure remote.' });
    }
    if (target === 'publication') f.observation.remote!.branch!.sha = 'b'.repeat(40);
    if (target === 'board') {
      const current = f.storage.getConfiguration(f.projectId);
      const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = current.view.configuration;
      const githubProject = null;
      f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: f.projectId,
        body: { project_changes: { github_project: githubProject } }, configuration: { ...configuration, github_project: githubProject }, globalChanges: {} });
    }
    const command = await f.prepare();
    const current = await f.preparations.getPreparation(command.saved.view.preparation.id);
    expect(current.view.preparation.prerequisites.map(item => item.code)).toContain(reason);
    await expect(f.pipeline.startAttempt(command.body, command.context)).rejects.toMatchObject({ code: 'START_PREREQUISITES' });
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
    expect(f.execution.startPassage).not.toHaveBeenCalled();
  });
  it('rejects stale CAS, missing precondition and conflicting operation contents', async () => {
    const f = await fixture(); const c = await f.prepare();
    await expect(f.pipeline.startAttempt(c.body, { ...c.context, expectedRevision: undefined })).rejects.toMatchObject({ statusCode: 428 });
    await expect(f.pipeline.startAttempt(c.body, { ...c.context, expectedRevision: 'stale' })).rejects.toMatchObject({ statusCode: 412 });
    await f.pipeline.startAttempt(c.body, c.context);
    await expect(f.pipeline.startAttempt({ ...c.body, authorizedSummaryHash: 'b'.repeat(64) }, c.context)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await f.pipeline.drain(); expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
  });
  it('rechecks configuration after version observation and revalidates authority again after clone', async () => {
    const f = await fixture(); const c = await f.prepare();
    f.observeTools.mockImplementationOnce(async () => {
      f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: f.storage.getSettings().time_defaults }); return f.tools;
    });
    await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toMatchObject({ statusCode: 412 });
    const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => { f.issue.assignees = []; return original(input); });
    const a = await start(f);
    expect(f.storage.getAttempt(a.id)).toMatchObject({ phase: 'preparing', result: null, suspension: 'DISPATCH_FAILED', diagnostic: 'SUMMARY_CHANGED' });
    expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.db.prepare("SELECT owned,launch_state FROM resources WHERE attempt_id=? AND kind='implementation'").get(a.id)).toEqual({ owned: 1, launch_state: 'ready' });
  });
  it('refuses missing role contracts and records unobservable versions with pending requirements before effects', async () => {
    const f = await fixture(); const c = await f.prepare();
    vi.mocked(f.execution.roleResources).mockReturnValueOnce([f.roles[0]!]);
    await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toMatchObject({ code: 'ROLE_RESOURCE_REQUIRED' });
    f.tools[3] = { tool: 'maestri', state: 'unavailable', version: null, cause: 'VERSION_NOT_EXPOSED', affectedRequirements: ['RF-22'], observedAtMs: 2 };
    const op = await f.pipeline.startAttempt(c.body, c.context); await f.pipeline.drain();
    expect(f.storage.getAttempt(op.resource.id)).toMatchObject({ suspension: 'TOOL_VERSION_UNAVAILABLE', result: null });
    expect(f.storage.getAttemptCapture(op.resource.id).tools[3]).toMatchObject({ cause: 'VERSION_NOT_EXPOSED', version: null, affectedRequirements: ['RF-22'] });
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled(); expect(f.execution.preflight).not.toHaveBeenCalled();
  });
  it('keeps independent captures when defaults, resources and observed versions change', async () => {
    const f = await fixture(); const first = await start(f); const bytes = JSON.stringify(first.capture);
    f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: { ...f.storage.getSettings().time_defaults, passage_active_time_ms: 123456 } });
    f.roles[0]!.sha256 = 'f'.repeat(64); f.tools[1]!.version = '2.0.0'; f.issue.id = 'I_second'; f.issue.number = 18;
    const second = await start(f);
    expect(second.capture.configuration.time_defaults.passage_active_time_ms).toBe(123456);
    expect(second.capture.roleResources).not.toEqual(first.capture.roleResources); expect(second.capture.tools).not.toEqual(first.capture.tools);
    expect(JSON.stringify(f.storage.getAttemptCapture(first.id))).toBe(bytes);
    const passage = f.persistence.getPassage({ passageId: second.status.passageId });
    expect(passage.executorVersion).toBe('18.11.1'); expect(passage.effectiveProfile).toMatchObject({ model: 'model', effort: 'high' });
  });
  it('keeps a legacy four-value mapping readable after an unrelated save and leaves the captured attempt unchanged', async () => {
    const f = await fixture(); const attempt = await start(f);
    const captureBefore = JSON.stringify(f.storage.getAttemptCapture(attempt.id));
    f.storage.interruptAttempts();
    f.persistence.recordStop({ passageId: attempt.status.passageId }, { passageId: attempt.status.passageId, state: 'confirmed' });
    const current = f.storage.getConfiguration(f.projectId);
    f.db.exec('DROP TRIGGER project_revision_update_immutable');
    f.db.prepare('UPDATE project_revisions SET status_options_json=? WHERE id=?')
      .run(JSON.stringify({ ready: 'READY', inProgress: 'PROGRESS', inReview: 'REVIEW', delivered: 'DELIVERED' }), current.view.configuration.id);
    const legacy = f.storage.getConfiguration(f.projectId);
    expect(legacy.view.configuration.github_project?.status_option_ids).toEqual({ ready: 'READY', in_progress: 'PROGRESS', in_review: 'REVIEW', delivered: 'DELIVERED' });
    const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = legacy.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: legacy.etag, projectId: f.projectId,
      body: { project_changes: { guidance: 'Updated without remapping Status.' } },
      configuration: { ...configuration, guidance: 'Updated without remapping Status.' }, globalChanges: {} });
    const after = f.storage.getConfiguration(f.projectId);
    expect(after.view.configuration.github_project?.status_option_ids).toEqual({ ready: 'READY', in_progress: 'PROGRESS', in_review: 'REVIEW', delivered: 'DELIVERED' });
    expect(after.view.prerequisites.map(item => item.code)).toContain('STATUS_MAPPING_LEGACY');
    expect(JSON.stringify(f.storage.getAttemptCapture(attempt.id))).toBe(captureBefore);
    const next = await f.prepare();
    const preview = await f.preparations.getPreparation(next.saved.view.preparation.id);
    expect(preview.view.preparation.prerequisites.map(item => item.code)).toContain('STATUS_MAPPING_LEGACY');
    const attemptsBeforeStart = f.storage.listAttempts({}).items.length;
    const physicalPreparesBefore = f.workspaces.prepareAttempt.mock.calls.length;
    await expect(f.pipeline.startAttempt(next.body, next.context)).rejects.toMatchObject({ code: 'START_PREREQUISITES' });
    expect(f.storage.listAttempts({}).items).toHaveLength(attemptsBeforeStart);
    expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(physicalPreparesBefore);
  });
  it('preserves partial ownership and late clone completion after cancellation without launching', async () => {
    const f = await fixture(); const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => {
      f.persistence.recordCancellation(input.attemptId, randomUUID()); return original(input);
    });
    const a = await start(f);
    expect(f.storage.getAttempt(a.id).result).toBe('cancelled'); expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.db.prepare("SELECT owned,launch_state FROM resources WHERE attempt_id=? AND kind='implementation'").get(a.id)).toEqual({ owned: 1, launch_state: 'ready' });
  });
  it('preserves failed owned clone diagnostics without treating creation as ready', async () => {
    const f = await fixture(); const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => ({ ...await original(input), state: 'failed', diagnostic: { code: 'CLONE_FAILED', message: 'Failed', recovery: 'Preserve work' } }));
    const a = await start(f);
    expect(a.status).toMatchObject({ suspension: 'WORKSPACE_PREPARATION_FAILED', diagnostic: 'CLONE_FAILED', result: null });
    expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.db.prepare("SELECT owned,launch_state FROM resources WHERE attempt_id=? AND kind='implementation'").get(a.id)).toEqual({ owned: 1, launch_state: 'failed' });
  });
  it('recovers after reopen and interrupts history without automatically scheduling a second launch', async () => {
    const f = await fixture(); const a = await start(f); await f.pipeline.close(); f.storage.close();
    expect(f.db.prepare('SELECT state FROM terminal_occupancies WHERE attempt_id=?').get(a.id)).toEqual({ state: 'uncertain' });
    expect(f.db.prepare('SELECT state FROM attempt_sessions WHERE attempt_id=? ORDER BY role').all(a.id)).toEqual([{ state: 'interrupted' }, { state: 'interrupted' }]);
    expect(f.db.prepare(`SELECT t.role,t.state FROM managed_terminals t JOIN attempt_sessions s ON s.managed_terminal_id=t.id
      WHERE s.attempt_id=? ORDER BY t.role`).all(a.id))
      .toEqual([{ role: 'implementer', state: 'uncertain' }, { role: 'reviewer', state: 'planned' }]);
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
      expect(reopened.getAttempt(a.id)).toMatchObject({ result: 'interrupted', phase: 'finished', tracking: 'lost' });
      expect(reopened.recoverAttempt({ body: a.body, ...a.context })?.receipt).toEqual(a.operation.receipt);
      expect(reopened.getAttemptCapture(a.id)).toEqual(a.capture);
      expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
    } finally { reopened.close(); }
  });
});
