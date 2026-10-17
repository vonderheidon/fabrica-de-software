import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import * as directoryFs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConfigurationOptions, ConfigurationSaved, ConfigurationView, ProjectRegistered, SettingsSaved, QueueObservation,
  type ConfigurationUpdate, type ExecutionProfile, type GitHubProjectDetails, type GitHubProjectSelection, type GitHubQueryResult,
  type IssueContext, type OriginInspection, type ProjectDetail, type ProjectItem, type ProjectPage, type SessionResponse, type SettingsUpdate, type SettingsView,
} from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import type { ProjectDependencies } from '../../apps/controller/src/modules/projects/index.js';
import { createQueue } from '../../apps/controller/src/modules/projects/queue.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, realpath: vi.fn(original.realpath) };
});

async function queueFixture() {
  const f = fixture(); const headers = await session(f);
  const projectId = (await register(f, headers)).json<ProjectDetail>().project.id;
  f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)')
    .run('ACCOUNT_test', 'test-user', Date.now(), Date.now(), Date.now());
  f.db.prepare('UPDATE factory_settings SET account_id=?,designated_host=?,revision=revision+1').run('ACCOUNT_test', hostname());
  function configure(changes: ConfigurationUpdate['projectChanges']) {
    const current = f.storage.getConfiguration(projectId);
    const { id: _id, projectId: _projectId, revision: _revision, createdAtMs: _created, ...fields } = current.view.configuration;
    const configuration = { ...fields, ...changes, source: changes.source ? { ...changes.source, repositoryId: 'REPO_test', repositoryUrl: 'https://github.com/test-org/repo' } : fields.source,
      queueOrder: { ...fields.queueOrder, ...changes.queueOrder } };
    f.storage.saveConfiguration({ operationId: randomUUID(), projectId, expectedRevision: current.etag,
      body: { projectChanges: changes }, configuration, globalChanges: {} });
  }
  configure({ source: { kind: 'local', location: f.directory }, githubProject: mapping, automationEnabled: true });
  const contexts: IssueContext[] = [1, 2, 3].map((number) => ({
    id: `ISSUE_${number}`, number, url: `https://github.com/test-org/repo/issues/${number}`, title: `Issue ${number}`, body: 'Goal', state: 'OPEN',
    repository: { id: 'REPO_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repo', url: 'https://github.com/test-org/repo', defaultBranch: 'main', isArchived: false, isPrivate: true },
    assignees: [{ id: 'ACCOUNT_test', login: 'test-user' }], blockers: [], comments: [], references: [],
    memberships: [{ itemId: `ITEM_${number}`, projectId: mapping.id, archived: false, statusValues: [{ fieldId: mapping.statusFieldId, optionId: mapping.statusOptionIds.ready, name: 'Ready' }] }],
  }));
  const items: ProjectItem[] = contexts.map((issue) => ({ id: `ITEM_${issue.number}`, archived: false, kind: 'issue', contentId: issue.id, title: issue.title, url: issue.url, executable: true }));
  vi.mocked(f.github.listProjectItems).mockImplementation(async () => complete(structuredClone(items)));
  vi.mocked(f.github.getIssueContextById).mockImplementation(async (id) => complete(structuredClone(contexts.find((issue) => issue.id === id)!)));
  const queue = createQueue({ storage: f.storage, github: f.github });
  return { ...f, headers, projectId, contexts, items, queue, configure };
}

describe('complete Ready observations without dispatch', () => {
  it('refuses automatic work when the default controller account context is unavailable, even with configured automation', async () => {
    const f = await queueFixture();
    const settings = f.storage.getGlobalConfiguration();
    const changes = { automationEnabled: true, projectsRoot: f.directory };
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes }, changes });
    const record = vi.spyOn(f.storage, 'recordQueueObservations');
    const response = await f.app.inject({ method: 'GET', url: '/api/v1/queue', headers: f.headers });
    expect(response.json<QueueObservation>()).toMatchObject({ enabled: true, valid: true, eligibleTotal: 3 });
    await new Promise<void>((resolve) => setTimeout(resolve, 1100));
    expect(record).not.toHaveBeenCalled();
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
    expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, 'ISSUE_1')).toBeNull();
  });
  it('counts the full result independently of HTTP pages, with no durable writes or consumption', async () => {
    const f = await queueFixture();
    const before = f.db.pragma('data_version', { simple: true });
    const first = await f.app.inject({ method: 'GET', url: '/api/v1/queue?limit=1', headers: f.headers });
    expect(first.statusCode).toBe(200);
    const observation = first.json<QueueObservation>();
    expect(Value.Check(QueueObservation, observation)).toBe(true);
    expect(observation).toMatchObject({ complete: true, valid: true, enabled: false, eligibleTotal: 3, polling: { intervalMs: 15000 } });
    expect(observation.page.items).toHaveLength(1);
    const second = await f.app.inject({ method: 'GET', url: `/api/v1/queue?limit=2&cursor=${observation.page.nextCursor}`, headers: f.headers });
    expect(second.json<QueueObservation>()).toMatchObject({ eligibleTotal: 3, summaryHash: observation.summaryHash, page: { hasMore: false } });
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
    expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, 'ISSUE_1')).toBeNull();
    expect(f.db.pragma('data_version', { simple: true })).toEqual(before);
  });

  it('explains missing, other and multiple assignees without changing them', async () => {
    const f = await queueFixture();
    f.contexts[0]!.assignees = [];
    f.contexts[1]!.assignees = [{ id: 'OTHER', login: 'other' }];
    f.contexts[2]!.assignees.push({ id: 'OTHER', login: 'other' });
    const observed = await f.queue.observe({});
    expect(observed.observation).toMatchObject({ complete: true, eligibleTotal: 0 });
    expect(observed.items.map((item) => item.reasons)).toEqual([
      expect.arrayContaining(['ASSIGNEE_MISSING']), expect.arrayContaining(['ASSIGNEE_OTHER']), expect.arrayContaining(['MULTIPLE_ASSIGNEES']),
    ]);
    expect(f.contexts.map((issue) => issue.assignees.length)).toEqual([0, 1, 2]);
  });

  it('keeps a blocker local to its issue and treats Ready as an observed set', async () => {
    const f = await queueFixture();
    f.contexts[0]!.blockers = [{ id: 'BLOCKER', number: 99, title: 'Dependency', url: 'https://github.com/test-org/repo/issues/99', state: 'OPEN' }];
    const observed = await f.queue.observe({});
    expect(observed.observation).toMatchObject({ complete: true, valid: true, eligibleTotal: 2 });
    expect(observed.items[0]?.reasons).toContain('OPEN_BLOCKERS');
    f.contexts[0]!.blockers[0]!.state = 'CLOSED';
    f.contexts[0]!.assignees = [];
    expect((await f.queue.observe({})).items[0]?.eligible).toBe(false);
    f.contexts[0]!.assignees = [{ id: 'ACCOUNT_test', login: 'test-user' }];
    expect((await f.queue.observe({})).observation.eligibleTotal).toBe(3);
    f.contexts[0]!.memberships[0]!.statusValues[0]!.optionId = 'BACKLOG';
    expect((await f.queue.observe({})).items[0]?.eligible).toBe(false);
    f.contexts[0]!.memberships[0]!.statusValues[0]!.optionId = mapping.statusOptionIds.ready;
    expect((await f.queue.observe({})).observation.eligibleTotal).toBe(3);
  });

  it('rejects closed, foreign, archived and mismatched membership issues individually', async () => {
    const f = await queueFixture();
    f.contexts[0]!.state = 'CLOSED'; f.contexts[1]!.repository.id = 'FOREIGN'; f.items[2]!.archived = true;
    const first = await f.queue.observe({});
    expect(first.observation).toMatchObject({ complete: true, valid: true, eligibleTotal: 0 });
    expect(first.items.map((item) => item.reasons)).toEqual([
      expect.arrayContaining(['ISSUE_CLOSED']), expect.arrayContaining(['REPOSITORY_MISMATCH']), expect.arrayContaining(['ARCHIVED_ITEM']),
    ]);
    f.contexts[0]!.state = 'OPEN'; f.contexts[0]!.memberships[0]!.itemId = 'OTHER_ITEM';
    expect((await f.queue.observe({})).items[0]?.reasons).toContain('PROJECT_MEMBERSHIP_MISSING');
  });

  it('uses numeric priority in either direction, documented position, then number/ID', async () => {
    const f = await queueFixture();
    const details = { ...structuredClone(projectDetails), numberFields: [{ id: 'PRIORITY', name: 'Numeric priority' }] };
    vi.mocked(f.github.getProject).mockImplementation(async () => complete(details));
    f.contexts[0]!.memberships[0]!.numberValues = [{ fieldId: 'PRIORITY', value: 5 }];
    f.contexts[1]!.memberships[0]!.numberValues = [{ fieldId: 'PRIORITY', value: 0 }];
    f.contexts[2]!.memberships[0]!.numberValues = [{ fieldId: 'PRIORITY', value: 5 }];
    f.items[0]!.position = 3; f.items[1]!.position = 2; f.items[2]!.position = 1;
    f.configure({ queueOrder: { priorityFieldId: 'PRIORITY', priorityDirection: 'asc', useBoardPosition: true } });
    expect((await f.queue.observe({})).items.map((item) => item.number)).toEqual([2, 3, 1]);
    f.configure({ queueOrder: { priorityDirection: 'desc' } });
    expect((await f.queue.observe({})).items.map((item) => item.number)).toEqual([3, 1, 2]);
    f.configure({ queueOrder: { useBoardPosition: false } });
    expect((await f.queue.observe({})).items.map((item) => item.number)).toEqual([1, 3, 2]);
    f.contexts[0]!.memberships[0]!.numberValues = [];
    expect((await f.queue.observe({})).items.map((item) => item.number)).toEqual([3, 2, 1]);
  });

  it('makes unavailable priority and undocumented position fallbacks explicit', async () => {
    const f = await queueFixture(); f.items.reverse();
    f.configure({ queueOrder: { priorityFieldId: 'MISSING', useBoardPosition: true } });
    const observed = await f.queue.observe({});
    expect(observed.items.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(observed.observation.order.criterion).toBe('issue-number');
    expect(observed.observation.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(['PRIORITY_VALUE_UNAVAILABLE', 'BOARD_POSITION_UNAVAILABLE']));
  });

  it.each(['partial', 'authentication_invalid', 'rate_limited'] as const)('does not authorize or count %s reads', async (state) => {
    const f = await queueFixture();
    vi.mocked(f.github.listProjectItems).mockResolvedValue({ state, data: f.items, diagnostics: [], retryAtMs: null });
    const observed = await f.queue.observe({});
    expect(observed.observation).toMatchObject({ complete: false, valid: false, eligibleTotal: null });
    expect(observed.items.every((item) => !item.eligible && item.reasons.includes('READ_INCOMPLETE'))).toBe(true);
  });

  it('honors remote reset beyond configured backoff and issues no calls during cooldown', async () => {
    const f = await queueFixture();
    const settings = f.storage.getGlobalConfiguration();
    const changes = { timeDefaults: { pollingIntervalMs: 100, pollingBackoffMaxMs: 500 } };
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes }, changes });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10000);
    try {
      vi.mocked(f.github.listProjectItems).mockResolvedValueOnce({ state: 'rate_limited', data: null, diagnostics: [], retryAtMs: 20000 });
      expect((await f.queue.observe({})).observation.polling).toMatchObject({ intervalMs: 100, backoffMaxMs: 500, retryAtMs: 20000, nextPollAtMs: 20000 });
      const calls = vi.mocked(f.github.getIdentity).mock.calls.length;
      clock.mockReturnValue(19999);
      expect((await f.queue.observe({})).observation).toMatchObject({ complete: false, valid: false, eligibleTotal: null });
      expect(f.github.getIdentity).toHaveBeenCalledTimes(calls);
      clock.mockReturnValue(20000);
      expect((await f.queue.observe({})).observation).toMatchObject({ valid: true, polling: { retryAtMs: null, nextPollAtMs: 20100 } });
    } finally { clock.mockRestore(); }
  });

  it('bounds exponential read backoff using the configured maximum and resets it after success', async () => {
    const f = await queueFixture();
    const settings = f.storage.getGlobalConfiguration();
    const changes = { timeDefaults: { pollingIntervalMs: 100, pollingBackoffMaxMs: 250 } };
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes }, changes });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10000);
    vi.mocked(f.github.listProjectItems).mockResolvedValue({ state: 'partial', data: f.items, diagnostics: [], retryAtMs: null });
    try {
      expect((await f.queue.observe({})).observation.polling.retryAtMs).toBe(10100);
      clock.mockReturnValue(10100);
      expect((await f.queue.observe({})).observation.polling.retryAtMs).toBe(10300);
      clock.mockReturnValue(10300);
      expect((await f.queue.observe({})).observation.polling.retryAtMs).toBe(10550);
      clock.mockReturnValue(10550);
      vi.mocked(f.github.listProjectItems).mockResolvedValueOnce(complete(f.items));
      expect((await f.queue.observe({})).observation.polling.retryAtMs).toBeNull();
      clock.mockReturnValue(10600);
      expect((await f.queue.observe({})).observation.polling.retryAtMs).toBe(10700);
    } finally { clock.mockRestore(); }
  });

  it('invalidates hashes and cursors on quantity, mode, scope and observed account changes', async () => {
    const f = await queueFixture();
    const first = await f.queue.observe({ limit: '1' });
    expect((await f.queue.observe({ projectId: f.projectId })).observation.summaryHash).not.toBe(first.observation.summaryHash);
    f.contexts[1]!.assignees = [];
    await expect(f.queue.observe({ cursor: first.observation.page.nextCursor! })).rejects.toMatchObject({ code: 'QUEUE_CHANGED' });
    const changed = await f.queue.observe({});
    f.configure({ defaultDeliveryMode: 'commit' });
    const modeChanged = await f.queue.observe({});
    expect(modeChanged.observation.summaryHash).not.toBe(changed.observation.summaryHash);
    expect(modeChanged.observation.modesByProject).toEqual([{ projectId: f.projectId, mode: 'commit' }]);
    vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
    const other = await f.queue.observe({});
    expect(other.observation.valid).toBe(false);
    expect(other.observation.summaryHash).not.toBe(modeChanged.observation.summaryHash);
  });

  it('rejects configuration or account changes during IO instead of authorizing mixed observations', async () => {
    const f = await queueFixture();
    vi.mocked(f.github.getProject).mockImplementationOnce(async () => {
      f.configure({ defaultDeliveryMode: 'pr' });
      return complete(structuredClone(projectDetails));
    });
    expect((await f.queue.observe({})).observation).toMatchObject({ complete: false, valid: false, eligibleTotal: null });
    const next = createQueue({ storage: f.storage, github: f.github });
    vi.mocked(f.github.getIdentity).mockResolvedValueOnce(complete({ id: 'ACCOUNT_test', login: 'test-user' }))
      .mockResolvedValueOnce(complete({ id: 'OTHER', login: 'other' }));
    expect((await next.observe({})).observation).toMatchObject({ complete: false, valid: false, eligibleTotal: null });
  });
});

const directories: string[] = [];
const resources: { close(): unknown }[] = [];
const host = '127.0.0.1:4310';
const origin = `http://${host}`;
const bootstrap = { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' };
const profile: ExecutionProfile = { name: 'Test exact profile', executor: 'maestri-omp', provider: 'provider-exact', model: 'model-exact-v2', effort: 'custom-effort', guidance: 'Exact guidance' };
const mapping = { id: 'PVT_test', ownerId: 'OWNER_test', statusFieldId: 'FIELD_status', statusOptionIds: { ready: 'OPT_ready', inProgress: 'OPT_progress', inReview: 'OPT_review', delivered: 'OPT_delivered' } };
const projectDetails: GitHubProjectDetails = { project: { id: mapping.id, owner: { id: mapping.ownerId, login: 'test-org', kind: 'organization' }, number: 1, title: 'Test Project', url: 'https://github.com/orgs/test-org/projects/1', closed: false },
  singleSelectFields: [{ id: mapping.statusFieldId, name: 'Custom status', options: Object.values(mapping.statusOptionIds).map((id) => ({ id, name: id })) }] };
function complete<T>(data: T): GitHubQueryResult<T> { return { state: 'complete', data, diagnostics: [], retryAtMs: null }; }
function fixture(realAdapters = false) {
  const directory = mkdtempSync(join(tmpdir(), 'factory-projects-')); directories.push(directory);
  const storage = openStorage({ dataDirectory: directory, busyTimeoutMs: 25 }); resources.push(storage);
  const inspection: OriginInspection = { state: 'identified', source: { kind: 'local', location: directory }, local: { root: directory, headSha: 'a'.repeat(40), dirty: true }, base: { branch: 'main', sha: 'a'.repeat(40), observedFrom: 'local' }, remote: null,
    diagnostics: [{ code: 'REMOTE_MISSING', message: 'No remote.', recovery: 'Configure remote.' }, { code: 'LOCAL_CHANGES_EXCLUDED', message: 'Dirty excluded.', recovery: 'Use committed base.' }], githubDiagnostics: [], retryAtMs: null, executionReady: false };
  const inspectOrigin = vi.fn(async (): Promise<OriginInspection> => structuredClone(inspection));
  const github: ProjectDependencies['github'] = {
    getIdentity: vi.fn(async () => complete({ id: 'ACCOUNT_test', login: 'test-user' })),
    getProjectOwner: vi.fn(async (id) => complete({ ...projectDetails.project.owner, id })),
    listProjects: vi.fn(async () => complete([projectDetails.project])),
    getProject: vi.fn(async () => complete(structuredClone(projectDetails))),
    listProjectItems: vi.fn(async () => complete([])),
    getIssueContextById: vi.fn(async (id: string) => complete({ id, contentId: id, title: 'Issue fixture', url: 'https://github.com/example/repo/issues/1', kind: 'issue' as const, archived: false, executable: true })),
    validateProjectSelection: vi.fn(async (selected: GitHubProjectSelection): Promise<GitHubQueryResult<GitHubProjectDetails>> => {
      const valid = selected.id === mapping.id && selected.statusFieldId === mapping.statusFieldId && selected.statusOptionIds.every((id) => Object.values(mapping.statusOptionIds).includes(id));
      return valid ? complete(structuredClone(projectDetails)) : { state: 'partial', data: structuredClone(projectDetails), diagnostics: [{ code: 'STATUS_OPTION_INACCESSIBLE', message: 'Invalid mapping.', recovery: 'Select exact IDs.' }], retryAtMs: null };
    }),
  };
  const configuration = loadConfiguration({ FACTORY_DATA_DIR: directory, FACTORY_LOG_LEVEL: 'silent' }, directory);
  const app = createApp(configuration, storage, undefined, realAdapters ? undefined : { github, workspaces: { inspectOrigin } }); resources.push(app);
  const db = new Database(join(directory, 'factory.sqlite')); db.pragma('foreign_keys = ON'); resources.push(db);
  return { app, storage, db, directory, github, inspectOrigin, inspection };
}
type Fixture = ReturnType<typeof fixture>;
async function session(f: Fixture) {
  const r = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: bootstrap, payload: {} }); expect(r.statusCode).toBe(200);
  return { ...bootstrap, cookie: String(r.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': r.json<SessionResponse>().csrfToken };
}
async function register(f: Fixture, headers: Record<string, string>, name = 'Test project', key = randomUUID()) {
  return f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...headers, 'idempotency-key': key }, payload: { name, source: { kind: 'local', location: f.directory }, baseBranch: 'main' } });
}
async function putSettings(f: Fixture, headers: Record<string, string>, body: SettingsUpdate, etag = f.storage.getGlobalConfiguration().etag, key = randomUUID()) {
  return f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'if-match': etag, 'idempotency-key': key }, payload: body });
}
async function putConfiguration(f: Fixture, headers: Record<string, string>, id: string, body: ConfigurationUpdate, etag = f.storage.getConfiguration(id).etag, key = randomUUID()) {
  return f.app.inject({ method: 'PUT', url: `/api/v1/projects/${id}/configuration`, headers: { ...headers, 'if-match': etag, 'idempotency-key': key }, payload: body });
}
afterEach(async () => {
  for (const r of resources.splice(0).reverse()) await r.close();
  for (const d of directories.splice(0)) rmSync(d, { recursive: true });
});

describe('project registration and lightweight catalog', () => {
  it('returns sanitized validation errors keyed to project registration fields', async () => {
    const f = fixture(); const headers = await session(f);
    const response = await register(f, headers, 'x'.repeat(257));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'name', message: 'Verifique este campo.' }] });
    expect(response.body).not.toContain('x'.repeat(257));
  });

  it('registers a dirty local origin without remote, persists its initial revision and preserves origin bytes', async () => {
    const f = fixture(); const headers = await session(f);
    for (const name of ['dirty.txt', 'HEAD', 'index']) writeFileSync(join(f.directory, name), `test bytes ${name} á`);
    const before = ['dirty.txt', 'HEAD', 'index'].map((name) => readFileSync(join(f.directory, name)));
    const r = await register(f, headers); expect(r.statusCode).toBe(201); expect(Value.Check(ProjectRegistered, r.json())).toBe(true);
    const body = r.json<ProjectDetail & { operationId: string }>();
    expect(body.project.id).not.toBe(f.directory); expect(body.project.currentRevisionId).toBeTruthy();
    expect(body.prerequisites.map((p) => p.code)).toEqual(expect.arrayContaining(['REMOTE_UNCONFIRMED', 'PROJECT_REQUIRED', 'PROFILES_REQUIRED', 'LOCAL_CHANGES_EXCLUDED', 'EXECUTION_REVALIDATION_REQUIRED']));
    expect(f.storage.getConfiguration(body.project.id).view.configuration).toMatchObject({ correctionLimit: 2, defaultDeliveryMode: 'icr', githubProject: null, automationEnabled: false, checks: [] });
    expect(f.db.prepare('SELECT count(*) AS n FROM project_revisions WHERE project_id = ?').get(body.project.id)).toEqual({ n: 1 });
    expect(f.storage.getOperation(body.operationId)).toMatchObject({ state: 'succeeded', resource: { id: body.project.id } });
    expect(r.headers.location).toBe(`/api/v1/projects/${body.project.id}`);
    const get = await f.app.inject({ url: String(r.headers.location), headers }); expect(get.statusCode).toBe(200); expect(get.headers.etag).toBe(r.headers.etag);
    expect(['dirty.txt', 'HEAD', 'index'].map((name) => readFileSync(join(f.directory, name)))).toEqual(before);
    expect(f.inspectOrigin).toHaveBeenCalledOnce(); expect(f.github.validateProjectSelection).not.toHaveBeenCalled();
  });
  it('recovers lost registration responses before inspecting again, including after reopen', async () => {
    const f = fixture(); const headers = await session(f); const key = randomUUID();
    const first = await register(f, headers, 'Stable project', key); const firstBody = first.json<ProjectDetail>();
    f.inspectOrigin.mockRejectedValue(new Error('Inspection must not repeat'));
    expect((await register(f, headers, 'Stable project', key)).json()).toEqual(first.json());
    expect((await register(f, headers, 'Changed project', key)).statusCode).toBe(409);
    expect(f.inspectOrigin).toHaveBeenCalledOnce(); expect(f.storage.getEvents({}).items).toHaveLength(1);
    f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory }); resources.push(reopened);
    expect(reopened.listProjects({}).items[0]?.id).toBe(firstBody.project.id);
    expect(reopened.getOperation(key)?.state).toBe('succeeded');
  });
  it('never invents a local identity when the authorized Git context is missing', async () => {
    const f = fixture(true); const headers = await session(f);
    const r = await register(f, headers); expect(r.statusCode).toBe(503); expect(r.json()).toMatchObject({ code: 'ORIGIN_UNAVAILABLE' });
    expect(f.storage.listProjects({}).items).toEqual([]); expect(f.storage.getEvents({}).items).toEqual([]);
  });
  it('stores canonical GitHub identity from inspection rather than trusting caller IDs or folder names', async () => {
    const f = fixture(); const headers = await session(f);
    f.inspection.source = { kind: 'github', location: 'https://github.com/test-org/repository' };
    f.inspection.remote = { name: null, url: f.inspection.source.location, confirmed: true, branch: null, repository: { id: 'REPOSITORY_test', name: 'repository', owner: { id: 'OWNER_test', login: 'test-org' }, url: f.inspection.source.location, defaultBranch: 'main', isPrivate: true, isArchived: false } };
    const r = await f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { name: 'Unrelated name', source: { kind: 'github', location: 'git@github.com:test-org/repository.git' }, baseBranch: 'main' } });
    expect(r.statusCode).toBe(201); expect(r.json<ProjectDetail>().project.source).toMatchObject({ repositoryId: 'REPOSITORY_test', repositoryUrl: 'https://github.com/test-org/repository' });
  });
  it('uses a bounded cursor tied to filters, account, installation and stable name/ID order', async () => {
    const f = fixture(); const headers = await session(f);
    for (const name of ['Equal', 'Equal', 'Other', 'Literal_%']) expect((await register(f, headers, name)).statusCode).toBe(201);
    const first = f.storage.listProjects({ limit: '1', search: 'Equal' }); expect(first.hasMore).toBe(true);
    await register(f, headers, 'Equal'); // New registrations do not enter an existing continuation.
    const second = f.storage.listProjects({ limit: '1', search: 'Equal', cursor: first.nextCursor! });
    expect(second.hasMore).toBe(false); expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(() => f.storage.listProjects({ search: 'Other', cursor: first.nextCursor! })).toThrowError(expect.objectContaining({ code: 'CURSOR_INVALID' }));
    expect(f.storage.listProjects({ search: '_%' }).items).toHaveLength(1);
    const http = await f.app.inject({ url: '/api/v1/projects?limit=2', headers }); expect(http.statusCode).toBe(200);
    expect(http.json<ProjectPage>().items).toHaveLength(2); expect(http.body).not.toMatch(/checks|guidance|headSha|dirty\.txt/);
    expect((await f.app.inject({ url: '/api/v1/projects?limit=101', headers })).statusCode).toBe(400);
    expect((await f.app.inject({ url: '/api/v1/projects?cursor=malformed', headers })).statusCode).toBe(400);
  });
  it('rejects invalid schemas, IDs, missing keys, session and CSRF without writes', async () => {
    const f = fixture(); const headers = await session(f);
    const body = { name: 'Test', source: { kind: 'local', location: f.directory }, baseBranch: 'main' };
    for (const [extra, payload, status] of [
      [{ cookie: '' }, body, 401], [{ 'x-csrf-token': '' }, body, 403], [{ 'idempotency-key': '' }, body, 400],
      [{}, { ...body, name: ' ' }, 400], [{}, { ...body, source: { ...body.source, repositoryId: 'forged' } }, 400], [{}, { ...body, unexpected: true }, 400],
    ] as const) expect((await f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...headers, 'idempotency-key': randomUUID(), ...extra }, payload })).statusCode).toBe(status);
    expect((await f.app.inject({ url: '/api/v1/projects/bad', headers })).statusCode).toBe(400);
    expect((await f.app.inject({ url: `/api/v1/projects/${randomUUID()}`, headers })).statusCode).toBe(404);
    expect(f.storage.listProjects({}).items).toEqual([]);
  });
});

describe('global and aggregate configuration', () => {
  it('starts with empty profiles and preserves exact profiles and omitted nested defaults', async () => {
    const f = fixture(); const headers = await session(f); const initial = f.storage.getGlobalConfiguration(); expect(initial.view.profiles).toEqual([]);
    const first = await putSettings(f, headers, { changes: { designatedHost: 'host-test', maestriSettings: { workspaceId: 'workspace-test' }, timeDefaults: { pollingIntervalMs: 25000 } }, profileChanges: [profile] });
    expect(first.statusCode).toBe(200); expect(Value.Check(SettingsSaved, first.json())).toBe(true);
    const saved = first.json<SettingsView>(); expect(saved.profiles[0]).toMatchObject(profile);
    expect(saved.settings.timeDefaults.passageActiveTimeMs).toBe(initial.view.settings.timeDefaults.passageActiveTimeMs);
    const second = await putSettings(f, headers, { changes: { timeDefaults: { passageActiveTimeMs: 60000 } } }); expect(second.statusCode).toBe(200);
    expect(second.json<SettingsView>().settings).toMatchObject({ designatedHost: 'host-test', maestriSettings: { workspaceId: 'workspace-test' }, timeDefaults: { pollingIntervalMs: 25000, passageActiveTimeMs: 60000 } });
    expect(second.json<SettingsView>().profiles).toEqual(saved.profiles);
    expect((await f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'idempotency-key': randomUUID(), 'if-match': String(second.headers.etag) }, payload: { changes: {}, profileChanges: [{ ...profile, executor: 'unsupported' }] } })).statusCode).toBe(400);
  });
  it('returns 428/412 for missing/stale ETag and recovers the original accepted receipt before CAS', async () => {
    const f = fixture(); const headers = await session(f); const etag = f.storage.getGlobalConfiguration().etag; const key = randomUUID();
    const body = { changes: { designatedHost: 'host-first' } };
    const first = await putSettings(f, headers, body, etag, key); expect(first.statusCode).toBe(200);
    expect((await putSettings(f, headers, { changes: { designatedHost: 'host-other' } }, etag)).statusCode).toBe(412);
    expect((await f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: body })).statusCode).toBe(428);
    expect((await putSettings(f, headers, body, etag, key)).json()).toEqual(first.json());
    expect((await putSettings(f, headers, body, first.headers.etag as string, key)).statusCode).toBe(409);
    expect((await putSettings(f, headers, { changes: {} })).statusCode).toBe(409);
    expect(f.storage.getEvents({}).items).toHaveLength(1);
  });
  it('includes profile revisions and new profiles in the compound ETag of every project editor', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const old = f.storage.getConfiguration(id).etag;
    expect((await putSettings(f, headers, { changes: {}, profileChanges: [profile] })).statusCode).toBe(200);
    expect((await putConfiguration(f, headers, id, { projectChanges: { correctionLimit: 3 } }, old)).statusCode).toBe(412);
    const stored = f.storage.getGlobalConfiguration().view.profiles[0]!; const etag = f.storage.getConfiguration(id).etag;
    expect((await putSettings(f, headers, { changes: {}, profileChanges: [{ ...profile, id: stored.id, effort: 'changed-exactly' }] })).statusCode).toBe(200);
    expect((await putConfiguration(f, headers, id, { projectChanges: { correctionLimit: 3 } }, etag)).statusCode).toBe(412);
    expect(f.storage.getGlobalConfiguration().view.profiles[0]).toMatchObject({ revision: 2, effort: 'changed-exactly' });
  });
  it('atomically commits all project fields, explicit globals, profiles, pointer, receipt and event', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    await putSettings(f, headers, { changes: {}, profileChanges: [profile] });
    const p = f.storage.getGlobalConfiguration().view.profiles[0]!; const old = f.storage.getConfiguration(id);
    const body: ConfigurationUpdate = { projectChanges: { githubProject: mapping, implementerProfileId: p.id, reviewerProfileId: p.id, correctionLimit: 5, defaultDeliveryMode: 'pr', automationEnabled: true, checks: [{ id: 'check', command: 'npm.cmd test', cwdRelative: 'apps/backend', timeoutMs: 1000 }], queueOrder: { priorityDirection: 'desc', useBoardPosition: false }, guidance: 'Project instructions' }, globalChanges: { designatedHost: 'host-test', costDefaults: { limit: { state: 'configured', value: 0, unit: 'USD' } } }, profileChanges: [{ ...profile, id: p.id, effort: 'updated-exact' }] };
    const key = randomUUID(); const r = await putConfiguration(f, headers, id, body, old.etag, key); expect(r.statusCode).toBe(200); expect(Value.Check(ConfigurationSaved, r.json())).toBe(true);
    const view = r.json<ConfigurationView>(); expect(view.configuration).toMatchObject({ revision: 2, correctionLimit: 5, githubProject: mapping, queueOrder: { priorityFieldId: null, priorityDirection: 'desc', useBoardPosition: false } });
    expect(view.configuration.id).not.toBe(old.view.configuration.id); expect(view.settings.designatedHost).toBe('host-test'); expect(view.profiles[0]?.effort).toBe('updated-exact');
    expect(f.db.prepare('SELECT correction_limit FROM project_revisions WHERE id = ?').get(old.view.configuration.id)).toEqual({ correction_limit: 2 });
    expect(f.db.prepare('SELECT count(*) AS n FROM events WHERE operation_id = ? AND project_id = ?').get(key, id)).toEqual({ n: 1 });
    expect(f.storage.getOperation(key)).toMatchObject({ state: 'succeeded', receipt: { revision: 2 } });
    vi.mocked(f.github.validateProjectSelection).mockRejectedValue(new Error('Must recover before remote IO'));
    expect((await putConfiguration(f, headers, id, body, old.etag, key)).json()).toEqual(r.json());
  });
  it.each(['event', 'operation', 'revision', 'pointer'])('rolls back every aggregate when %s persistence fails', async (kind) => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    await putSettings(f, headers, { changes: {}, profileChanges: [profile] }); const p = f.storage.getGlobalConfiguration().view.profiles[0]!;
    const before = f.storage.getConfiguration(id); const events = f.storage.getEvents({}); const key = randomUUID();
    const table = kind === 'event' ? 'events' : kind === 'operation' ? 'operation_requests' : kind === 'revision' ? 'project_revisions' : 'projects';
    f.db.exec(`CREATE TRIGGER fail_write BEFORE ${kind === 'pointer' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    const r = await putConfiguration(f, headers, id, { projectChanges: { correctionLimit: 4 }, globalChanges: { designatedHost: 'must-rollback' }, profileChanges: [{ ...profile, id: p.id, model: 'must-rollback' }] }, before.etag, key);
    expect(r.statusCode).toBe(503); expect(r.body).not.toMatch(/test failure|must-rollback|sqlite|stack/i);
    expect(f.storage.getConfiguration(id)).toEqual(before); expect(f.storage.getEvents({})).toEqual(events); expect(f.storage.getOperation(key)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM project_revisions WHERE project_id = ?').get(id)).toEqual({ n: 1 });
  });
  it('rolls back settings on unknown/duplicate profiles and invalid project profile links', async () => {
    const f = fixture(); const headers = await session(f); const before = f.storage.getGlobalConfiguration();
    const r = await putSettings(f, headers, { changes: { designatedHost: 'must-rollback' }, profileChanges: [{ ...profile, id: randomUUID() }] }); expect(r.statusCode).toBe(404); expect(f.storage.getGlobalConfiguration()).toEqual(before);
    const repeatedId = randomUUID(); expect((await putSettings(f, headers, { changes: {}, profileChanges: [{ ...profile, id: repeatedId }, { ...profile, id: repeatedId }] })).statusCode).toBe(400);
    const id = (await register(f, headers)).json<ProjectDetail>().project.id; const old = f.storage.getConfiguration(id);
    expect((await putConfiguration(f, headers, id, { projectChanges: { implementerProfileId: randomUUID() }, globalChanges: { designatedHost: 'must-rollback' } })).statusCode).toBe(404);
    expect(f.storage.getConfiguration(id)).toEqual(old);
  });
  it.each(['../outside', 'a/../../outside', 'C:\\outside', '\\outside', '/outside', 'a:stream', 'a\u0000b'])('rejects unsafe check cwd %s', async (cwdRelative) => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const r = await putConfiguration(f, headers, id, { projectChanges: { checks: [{ id: 'check', command: 'npm.cmd test', cwdRelative }] } }); expect(r.statusCode).toBe(400); expect(f.storage.getConfiguration(id).view.configuration.revision).toBe(1);
  });
  it.each([-1, 6, 1.5])('rejects invalid correction limit %s', async (correctionLimit) => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    expect((await putConfiguration(f, headers, id, { projectChanges: { correctionLimit } })).statusCode).toBe(400);
  });
  it('rejects invalid, duplicate, incomplete, inaccessible or wrong-owner Status mappings', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    for (const selected of [
      { ...mapping, ownerId: 'different' }, { ...mapping, statusFieldId: 'different' },
      { ...mapping, statusOptionIds: { ...mapping.statusOptionIds, ready: 'unknown' } },
      { ...mapping, statusOptionIds: { ...mapping.statusOptionIds, ready: mapping.statusOptionIds.delivered } },
    ]) expect((await putConfiguration(f, headers, id, { projectChanges: { githubProject: selected } })).statusCode).toBe(400);
    vi.mocked(f.github.validateProjectSelection).mockResolvedValue({ state: 'rate_limited', data: null, diagnostics: [], retryAtMs: Date.now() + 60000 });
    expect((await putConfiguration(f, headers, id, { projectChanges: { githubProject: mapping } })).statusCode).toBe(503);
    expect(f.storage.getConfiguration(id).view.configuration.githubProject).toBeNull();
  });
  it('prevents rewriting history, deleting it, null/missing pointers or linking another project revision', async () => {
    const f = fixture(); const headers = await session(f); const a = (await register(f, headers, 'A')).json<ProjectDetail>().project; const b = (await register(f, headers, 'B')).json<ProjectDetail>().project;
    expect(() => f.db.prepare('UPDATE project_revisions SET correction_limit = 3 WHERE id = ?').run(a.currentRevisionId)).toThrow('IMMUTABLE_RECORD');
    expect(() => f.db.prepare('DELETE FROM project_revisions WHERE id = ?').run(a.currentRevisionId)).toThrow('IMMUTABLE_RECORD');
    expect(() => f.db.prepare('UPDATE projects SET current_revision_id = ? WHERE id = ?').run(b.currentRevisionId, a.id)).toThrow();
    expect(() => f.db.prepare('UPDATE projects SET current_revision_id = NULL WHERE id = ?').run(a.id)).toThrow();
    expect(() => f.db.prepare('INSERT INTO projects(id, name, current_revision_id, revision, created_at_ms, updated_at_ms) VALUES (?, ?, ?, 1, 0, 0)').run(randomUUID(), 'Orphan', randomUUID())).toThrow();
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it('returns real owner/Project fields for an unsaved selection and paginates without silently truncating', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    vi.mocked(f.github.listProjects).mockResolvedValue(complete([projectDetails.project, { ...projectDetails.project, id: 'ZZ-last' }]));
    const url = `/api/v1/projects/${id}/configuration-options?ownerId=${mapping.ownerId}&githubProjectId=${mapping.id}&statusFieldId=${mapping.statusFieldId}&limit=1`;
    const r = await f.app.inject({ url, headers }); expect(r.statusCode).toBe(200); expect(Value.Check(ConfigurationOptions, r.json())).toBe(true);
    const options = r.json<ConfigurationOptions>(); expect(options.completeness).toBe('complete'); expect(options.statusOptions).toHaveLength(4); expect(options.projects.hasMore).toBe(true);
    expect(f.github.getProjectOwner).toHaveBeenCalledWith(mapping.ownerId); expect(f.github.listProjects).toHaveBeenCalledWith({ kind: 'organization', login: 'test-org' });
    const next = await f.app.inject({ url: `${url}&cursor=${options.projects.nextCursor}`, headers }); expect(next.statusCode).toBe(200); expect(next.json<ConfigurationOptions>().projects.items[0]?.id).toBe('ZZ-last');
    vi.mocked(f.github.listProjects).mockResolvedValue(complete([projectDetails.project]));
    expect((await f.app.inject({ url: `${url}&cursor=${options.projects.nextCursor}`, headers })).statusCode).toBe(409);
    expect(f.storage.getEvents({}).items).toHaveLength(1);
  });
  it('reports unavailable option reads explicitly with the production adapter', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    await f.app.close();
    const reopened = openStorage({ dataDirectory: f.directory }); const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), reopened); resources.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: bootstrap, payload: {} });
    const h = { ...bootstrap, cookie: String(response.headers['set-cookie']).split(';')[0]! };
    const r = await app.inject({ url: `/api/v1/projects/${id}/configuration-options`, headers: h }); expect(r.statusCode).toBe(200);
    expect(r.json<ConfigurationOptions>()).toMatchObject({ completeness: 'unavailable', projects: { items: [], hasMore: false }, diagnostics: [{ code: 'CONTEXT_UNAVAILABLE' }] });
  });
  it('persists validated directories and separate time, cost and artifact choices', async () => {
    const f = fixture(); const headers = await session(f);
    // This sandbox denies realpath even for the workspace. Only canonicalization is controlled;
    // stat/access still inspect the actual authorized directory. Production retains realpath.
    const selectedDirectory = process.cwd();
    vi.mocked(directoryFs.realpath).mockResolvedValueOnce(selectedDirectory).mockResolvedValueOnce(selectedDirectory);
    const r = await putSettings(f, headers, { changes: { projectsRoot: selectedDirectory, dataRoot: selectedDirectory,
      timeDefaults: { questionTtl: { state: 'configured', value: 0, unit: 'ms' } },
      costDefaults: { limit: { state: 'configured', value: 0, unit: 'USD' } }, artifactPolicy: { automaticDeletion: false } } });
    expect(r.statusCode, r.body).toBe(200); const view = r.json<SettingsView>();
    expect(view.settings.projectsRoot?.toLowerCase()).toBe(selectedDirectory.toLowerCase()); expect(view.settings.dataRoot.toLowerCase()).toBe(selectedDirectory.toLowerCase());
    expect(view.settings.timeDefaults.questionTtl).toEqual({ state: 'configured', value: 0, unit: 'ms' });
    expect(view.settings.costDefaults.limit).toEqual({ state: 'configured', value: 0, unit: 'USD' }); expect(view.settings.artifactPolicy.automaticDeletion).toBe(false);
    expect((await putSettings(f, headers, { changes: { projectsRoot: null } })).statusCode).toBe(200);
  });
  it.each(['missing-directory', '\\\\server\\share', 'https://example.com', 'invalid\u0000directory'])('rejects unavailable or nonlocal directory %s without partial save', async (projectsRoot) => {
    const f = fixture(); const headers = await session(f); const before = f.storage.getGlobalConfiguration();
    const r = await putSettings(f, headers, { changes: { designatedHost: 'must-rollback', projectsRoot }, profileChanges: [profile] });
    expect(r.statusCode).toBe(400); expect(f.storage.getGlobalConfiguration()).toEqual(before);
  });
  it('rechecks composite revisions after asynchronous mapping validation and refuses all requested writes', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id); const key = randomUUID();
    vi.mocked(f.github.validateProjectSelection).mockImplementation(async () => {
      f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: f.storage.getGlobalConfiguration().etag, body: { changes: {}, profileChanges: [profile] }, changes: {} });
      return complete(structuredClone(projectDetails));
    });
    const r = await putConfiguration(f, headers, id, { projectChanges: { githubProject: mapping, correctionLimit: 4 }, globalChanges: { designatedHost: 'must-not-save' } }, before.etag, key);
    expect(r.statusCode).toBe(412); expect(f.storage.getConfiguration(id).view.configuration).toEqual(before.view.configuration);
    expect(f.storage.getSettings().designatedHost).toBeNull(); expect(f.storage.getOperation(key)).toBeNull();
    expect(f.storage.getGlobalConfiguration().view.profiles).toHaveLength(1);
  });
  it('does not keep confirmed repository IDs when a changed source is inspected without a remote', async () => {
    const f = fixture(); const headers = await session(f);
    const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    f.inspection.source = { kind: 'github', location: 'https://github.com/test-org/repository' };
    f.inspection.remote = { name: null, url: f.inspection.source.location, confirmed: true, branch: null, repository: { id: 'REPOSITORY_test', name: 'repository', owner: { id: 'OWNER_test', login: 'test-org' }, url: f.inspection.source.location, defaultBranch: 'main', isPrivate: true, isArchived: false } };
    expect((await putConfiguration(f, headers, id, { projectChanges: { source: { kind: 'github', location: f.inspection.source.location } } })).statusCode).toBe(200);
    expect(f.storage.getConfiguration(id).view.configuration.source.repositoryId).toBe('REPOSITORY_test');
    f.inspection.remote = null; f.inspection.source = { kind: 'local', location: f.directory };
    const r = await putConfiguration(f, headers, id, { projectChanges: { source: { kind: 'local', location: f.directory }, baseBranch: 'release' } });
    expect(r.statusCode).toBe(200); expect(r.json<ConfigurationView>().configuration.source.repositoryId).toBeUndefined();
    expect(f.inspectOrigin).toHaveBeenLastCalledWith({ source: { kind: 'local', location: f.directory }, baseBranch: 'release' });
  });
  it('preserves configuration and receipts when upgrading an actual version-two database', async () => {
    const f = fixture(); await f.app.close(); f.db.close();
    // A historical fixture is constructed from the unmodified first two migrations.
    const old = join(f.directory, 'old.sqlite'); const db = new Database(old);
    const { applyMigrations, loadMigrations } = await import('../../apps/controller/src/modules/storage/migrations.js');
    const { seedSettings } = await import('../../apps/controller/src/modules/storage/settings.js');
    const { readSettings } = await import('../../apps/controller/src/modules/storage/settings.js');
    const { saveTimeDefaults, settingsETag, readOperation } = await import('../../apps/controller/src/modules/storage/operations.js');
    try {
      applyMigrations(db, loadMigrations().slice(0, 2), () => seedSettings(db, f.directory));
      expect(db.pragma('user_version', { simple: true })).toBe(2);
      const settings = readSettings(db);
      const accepted = saveTimeDefaults(db, { operationId: randomUUID(), expectedRevision: settingsETag(settings.installationId, settings.revision), timeDefaults: settings.timeDefaults });
      const identity = db.prepare('SELECT installation_id FROM factory_settings').get();
      applyMigrations(db, loadMigrations(), () => { throw new Error('Must not reseed'); });
      expect(db.pragma('user_version', { simple: true })).toBe(16); expect(db.prepare('SELECT installation_id FROM factory_settings').get()).toEqual(identity);
      expect(db.prepare('SELECT * FROM projects').all()).toEqual([]); expect(db.prepare('SELECT * FROM execution_profiles').all()).toEqual([]);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(readOperation(db, accepted.operationId)).toEqual(accepted);
    } finally { db.close(); }
  });
  it('returns a sanitized unavailable response under a finite SQLite write lock', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id); const key = randomUUID();
    f.db.exec('BEGIN IMMEDIATE');
    try {
      const r = await putConfiguration(f, headers, id, { projectChanges: { correctionLimit: 0 }, globalChanges: { designatedHost: 'must-not-save' } }, before.etag, key);
      expect(r.statusCode).toBe(503); expect(r.body).not.toMatch(/sqlite|locked|must-not-save/i);
    } finally { f.db.exec('ROLLBACK'); }
    expect(f.storage.getConfiguration(id)).toEqual(before); expect(f.storage.getOperation(key)).toBeNull();
    expect((await putConfiguration(f, headers, id, { projectChanges: { correctionLimit: 0 } })).statusCode).toBe(200);
  });
  it('rejects secret-shaped Maestri settings and credential-bearing origin URLs without retaining the input', async () => {
    const f = fixture(true); const headers = await session(f); const marker = 'SYNTHETIC_SECRET_CREDENTIAL';
    const settings = await f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'if-match': f.storage.getGlobalConfiguration().etag, 'idempotency-key': randomUUID() }, payload: { changes: { maestriSettings: { token: marker } } } });
    expect(settings.statusCode).toBe(400); expect(settings.body).not.toContain(marker);
    const registration = await f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { name: 'Test', source: { kind: 'github', location: `https://${marker}@github.com/test-org/repository` }, baseBranch: 'main' } });
    expect(registration.statusCode).toBe(400); expect(registration.body).not.toContain(marker);
    expect(f.storage.getEvents({}).items).toEqual([]); expect(f.storage.listProjects({}).items).toEqual([]);
    expect(JSON.stringify(f.storage.getGlobalConfiguration())).not.toContain(marker);
  });
  it('enforces explicit aggregate changes in the public storage contract as well as HTTP', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id);
    const { id: _id, projectId: _projectId, revision: _revision, createdAtMs: _created, ...configuration } = before.view.configuration;
    const context = { operationId: randomUUID(), expectedRevision: before.etag, projectId: id, body: { projectChanges: { correctionLimit: 4 } } };
    expect(() => f.storage.saveConfiguration({ ...context, configuration: { ...configuration, correctionLimit: 4 }, globalChanges: { designatedHost: 'unrequested' } })).toThrowError(expect.objectContaining({ code: 'UNREQUESTED_GLOBAL_CHANGE' }));
    expect(() => f.storage.saveConfiguration({ ...context, configuration: { ...configuration, correctionLimit: 4, guidance: 'unrequested' }, globalChanges: {} })).toThrowError(expect.objectContaining({ code: 'UNREQUESTED_PROJECT_CHANGE' }));
    expect(f.storage.getConfiguration(id)).toEqual(before);
  });

  it('keeps an unconfigured or partial queue distinct from an empty complete queue', async () => {
    const f = fixture(); const headers = await session(f); await register(f, headers);
    const response = await f.app.inject({ method: 'GET', url: '/api/v1/queue?limit=25', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ complete: false, valid: false, eligibleTotal: null, page: { items: [], hasMore: false }, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'PROJECT_NOT_READY' })]) });
    expect(response.headers.etag).toBeTruthy();
  });

  it('pauses new queue starts through the durable settings receipt while preserving incomplete candidates', async () => {
    const f = fixture(); const headers = await session(f); const projectId = (await register(f, headers)).json<ProjectDetail>().project.id;
    f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('ACCOUNT_test', 'test-user', Date.now(), Date.now(), Date.now());
    f.db.prepare('UPDATE factory_settings SET automation_enabled=1,account_id=?,designated_host=?,revision=revision+1').run('ACCOUNT_test', hostname());
    const before = await f.app.inject({ method: 'GET', url: '/api/v1/queue', headers });
    expect(before.json().enabled).toBe(true);
    const operationId = randomUUID();
    const paused = await f.app.inject({ method: 'PUT', url: '/api/v1/queue', headers: { ...headers, 'if-match': String(before.headers.etag), 'idempotency-key': operationId }, payload: {
      enabled: false, scope: { kind: 'account', projectIds: [projectId] },
    } });
    expect(paused.statusCode).toBe(200);
    expect(paused.json()).toMatchObject({ operationId, queue: { enabled: false, complete: false }, receipt: { revision: expect.any(Number), eventCursor: expect.any(String) } });
    expect(f.storage.getGlobalConfiguration().view.settings.automationEnabled).toBe(false);
  });

  it('projects live issues, excludes drafts and pull requests, and pages candidates without turning multiples into assignments', async () => {
    const f = fixture(); const headers = await session(f); const projectId = (await register(f, headers)).json<ProjectDetail>().project.id;
    f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('ACCOUNT_test', 'test-user', Date.now(), Date.now(), Date.now());
    f.db.prepare('UPDATE factory_settings SET account_id=?,designated_host=?,revision=revision+1').run('ACCOUNT_test', hostname());
    const current = f.storage.getConfiguration(projectId);
    const { id: _id, projectId: _projectId, revision: _revision, createdAtMs: _created, ...currentConfiguration } = current.view.configuration;
    const configuration = { ...currentConfiguration, source: { kind: 'local' as const, location: f.directory, repositoryId: 'REPO_test', repositoryUrl: 'https://github.com/test-org/repo' }, githubProject: mapping, automationEnabled: true };
    f.storage.saveConfiguration({ operationId: randomUUID(), projectId, expectedRevision: current.etag,
      body: { projectChanges: { source: { kind: 'local', location: f.directory }, githubProject: mapping, automationEnabled: true } }, configuration, globalChanges: {} });
    const projectItems: ProjectItem[] = [
      { id: 'ITEM_1', archived: false, kind: 'issue', contentId: 'ISSUE_1', title: 'Eligible issue', url: 'https://github.com/test-org/repo/issues/1', executable: true },
      { id: 'ITEM_2', archived: false, kind: 'issue', contentId: 'ISSUE_2', title: 'Multiple assignees', url: 'https://github.com/test-org/repo/issues/2', executable: true },
      { id: 'ITEM_3', archived: false, kind: 'draft', contentId: 'DRAFT_3', title: 'Draft issue', url: null, executable: false },
      { id: 'ITEM_4', archived: false, kind: 'pull_request', contentId: 'PR_4', title: 'Pull request card', url: 'https://github.com/test-org/repo/pull/4', executable: false },
    ];
    const issue = (id: string, number: number, assignees: IssueContext['assignees']): IssueContext => ({ id, number, url: `https://github.com/test-org/repo/issues/${number}`, title: projectItems[number - 1]?.title ?? 'Issue', body: '## Acceptance criteria\n- [ ] Keep queue state durable', state: 'OPEN',
      repository: { id: 'REPO_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repo', url: 'https://github.com/test-org/repo', defaultBranch: 'main', isArchived: false, isPrivate: true },
      assignees, comments: [], blockers: [], memberships: [{ itemId: `ITEM_${number}`, projectId: mapping.id, archived: false, statusValues: [{ fieldId: mapping.statusFieldId, optionId: mapping.statusOptionIds.ready, name: 'Ready' }] }], references: [] });
    const contexts = new Map<string, IssueContext>([
      ['ISSUE_1', issue('ISSUE_1', 1, [{ id: 'ACCOUNT_test', login: 'test-user' }])],
      ['ISSUE_2', issue('ISSUE_2', 2, [{ id: 'ACCOUNT_test', login: 'test-user' }, { id: 'ACCOUNT_other', login: 'other-user' }])],
    ]);
    vi.mocked(f.github.listProjectItems).mockResolvedValue(complete(projectItems));
    vi.mocked(f.github.getIssueContextById).mockImplementation(async (id) => {
      const context = contexts.get(id);
      return context ? complete(context) : { state: 'inaccessible', data: null, diagnostics: [], retryAtMs: null };
    });
    const first = await f.app.inject({ method: 'GET', url: '/api/v1/queue?limit=2', headers });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ complete: true, valid: true, eligibleTotal: 1, page: { items: expect.arrayContaining([
      expect.objectContaining({ issueId: 'ISSUE_1', eligible: true, ready: true, assignees: [{ id: 'ACCOUNT_test', login: 'test-user' }] }),
      expect.objectContaining({ issueId: 'ISSUE_2', eligible: false, reasons: expect.arrayContaining(['ASSIGNEE_MISMATCH']) }),
    ]), hasMore: true } });
    const cursor = first.json().page.nextCursor as string;
    const second = await f.app.inject({ method: 'GET', url: `/api/v1/queue?limit=2&cursor=${encodeURIComponent(cursor)}`, headers });
    expect(second.statusCode).toBe(200);
    expect(second.json().page.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'draft', eligible: false, reasons: expect.arrayContaining(['DRAFT_ITEM']) }),
      expect.objectContaining({ kind: 'pull_request', eligible: false, reasons: expect.arrayContaining(['PULL_REQUEST']) }),
    ]));
  });
});
