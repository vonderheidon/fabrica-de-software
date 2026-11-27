import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import * as directoryFs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConfigurationOptions, ConfigurationSaved, ConfigurationView, ExecutionCatalog, GitHubSetupOptions, NativeSelectionResult, ProjectRegistered, SettingsSaved, ToolOptions, HttpQueueObservation as QueueObservation,
  SettingsView, type ConfigurationUpdate, type ExecutionProfile, type ProfileChanges, type GitHubProjectDetails, type GitHubProjectSelection, type GitHubQueryResult,
  type IssueContext, type OriginInspection, type ProjectDetail, type ProjectItem, type ProjectPage, type SessionResponse, type SettingsUpdate,
} from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createProjectDeletionPersistence } from '../../apps/controller/src/modules/storage/project-deletions.js';
import { createProjects, type ProjectDependencies } from '../../apps/controller/src/modules/projects/index.js';
import { createQueue } from '../../apps/controller/src/modules/projects/queue.js';
import { createToolDetector } from '../../apps/controller/src/modules/tools/index.js';

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
  function configureProject(targetProjectId: string, changes: ConfigurationUpdate['project_changes']) {
    const current = f.storage.getConfiguration(targetProjectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...fields } = current.view.configuration;
    const configuration = { ...fields, ...changes, source: changes.source ? { ...changes.source, repository_id: 'REPO_test', repository_url: 'https://github.com/test-org/repo' } : fields.source,
      queue_order: { ...fields.queue_order, ...changes.queue_order } };
    f.storage.saveConfiguration({ operationId: randomUUID(), projectId: targetProjectId, expectedRevision: current.etag,
      body: { project_changes: changes }, configuration, globalChanges: {} });
  }
  const configure = (changes: ConfigurationUpdate['project_changes']) => configureProject(projectId, changes);
  configure({ source: { kind: 'local', location: f.directory }, github_project: mapping, automation_enabled: true });
  const configuredSource = f.storage.getConfiguration(projectId).view.configuration.source;
  f.inspectOrigin.mockResolvedValue({ state: 'identified', source: { kind: configuredSource.kind, location: configuredSource.location },
    local: { root: f.directory, headSha: 'a'.repeat(40), dirty: false }, base: { branch: 'main', sha: 'a'.repeat(40), observedFrom: 'local' },
    remote: { name: 'origin', url: 'https://github.com/test-org/repo', confirmed: true,
      repository: { id: 'REPO_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repo', url: 'https://github.com/test-org/repo', defaultBranch: 'main', isArchived: false, isPrivate: true },
      branch: { repositoryId: 'REPO_test', name: 'main', sha: 'a'.repeat(40) } },
    diagnostics: [], githubDiagnostics: [], retryAtMs: null, executionReady: false });
  const contexts: IssueContext[] = [1, 2, 3].map((number) => ({
    id: `ISSUE_${number}`, number, url: `https://github.com/test-org/repo/issues/${number}`, title: `Issue ${number}`, body: 'Goal\n## Acceptance criteria\n- Observable result', state: 'OPEN',
    repository: { id: 'REPO_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repo', url: 'https://github.com/test-org/repo', defaultBranch: 'main', isArchived: false, isPrivate: true },
    assignees: [{ id: 'ACCOUNT_test', login: 'test-user' }], blockers: [], comments: [], references: [],
    memberships: [{ itemId: `ITEM_${number}`, projectId: mapping.id, archived: false, statusValues: [{ fieldId: mapping.status_field_id, optionId: mapping.status_option_ids.ready, name: 'Ready' }] }],
  }));
  const items: ProjectItem[] = contexts.map((issue) => ({ id: `ITEM_${issue.number}`, archived: false, kind: 'issue', contentId: issue.id, title: issue.title, url: issue.url, executable: true }));
  vi.mocked(f.github.listProjectItems).mockImplementation(async () => complete(structuredClone(items)));
  vi.mocked(f.github.getIssueContextById).mockImplementation(async (id) => complete(structuredClone(contexts.find((issue) => issue.id === id)!)));
  const queue = createQueue({ storage: f.storage, github: f.github, workspaces: { inspectOrigin: f.inspectOrigin } });
  return { ...f, headers, projectId, contexts, items, queue, configure, configureProject };
}

describe('complete Ready observations without dispatch', () => {
  it('refuses automatic work when the default controller account context is unavailable, even with configured automation', async () => {
    const f = await queueFixture();
    const settings = f.storage.getGlobalConfiguration();
    const changes = { automation_enabled: true, projects_root: f.directory };
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes }, changes });
    const record = vi.spyOn(f.storage, 'recordQueueObservations');
    const response = await f.app.inject({ method: 'GET', url: '/api/v1/queue', headers: f.headers });
    expect(response.json<QueueObservation>()).toMatchObject({ enabled: true, valid: true, eligible_total: 3 });
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
    expect(observation).toMatchObject({ complete: true, valid: true, enabled: false, eligible_total: 3, polling: { interval_ms: 15000 } });
    expect(observation.page.items).toHaveLength(1);
    const second = await f.app.inject({ method: 'GET', url: `/api/v1/queue?limit=2&cursor=${observation.page.next_cursor}`, headers: f.headers });
    expect(second.json<QueueObservation>()).toMatchObject({ eligible_total: 3, summary_hash: observation.summary_hash, page: { has_more: false } });
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
    f.contexts[0]!.memberships[0]!.statusValues[0]!.optionId = mapping.status_option_ids.ready;
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

  it('sorts positions when enabled and complete, then breaks ties by number and identity', async () => {
    const f = await queueFixture();
    f.contexts[0]!.number = 7;
    f.contexts[1]!.number = 7;
    f.contexts[2]!.number = 3;
    f.items[0]!.position = 2; f.items[1]!.position = 2; f.items[2]!.position = 1;
    const observed = await f.queue.observe({});
    expect(observed.items.map((item) => item.number)).toEqual([3, 7, 7]);
    expect(observed.items.map((item) => item.issueId)).toEqual(['ISSUE_3', 'ISSUE_1', 'ISSUE_2']);
    expect(observed.items.every((item) => !('value' in item.order))).toBe(true);
    expect(observed.observation.order.criterion).toBe('project-position');
  });

  it('uses number and identity when positions are absent or disabled, without a priority diagnostic', async () => {
    const f = await queueFixture(); f.items.reverse();
    const observed = await f.queue.observe({});
    expect(observed.items.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(observed.observation.order.criterion).toBe('issue-number');
    expect(observed.observation.diagnostics.map((entry) => entry.code)).toContain('BOARD_POSITION_UNAVAILABLE');
    expect(observed.observation.diagnostics.map((entry) => entry.code)).not.toContain('PRIORITY_VALUE_UNAVAILABLE');

    f.items[0]!.position = 1; f.items[1]!.position = 2; f.items[2]!.position = 3;
    f.configure({ queue_order: { use_board_position: false } });
    expect((await f.queue.observe({})).items.map((item) => item.number)).toEqual([1, 2, 3]);
    expect((await f.queue.observe({})).observation.order.criterion).toBe('issue-number');
  });

  it('orders projects by ID and falls back for the whole project when any returned item lacks a position', async () => {
    const f = await queueFixture();
    const secondId = (await register(f, f.headers, 'Second project')).json<ProjectDetail>().project.id;
    const secondMapping = { ...mapping, id: 'PVT_second' };
    f.configureProject(secondId, { source: { kind: 'local', location: f.directory }, github_project: secondMapping, automation_enabled: true });
    const repository = structuredClone(f.contexts[0]!.repository);
    const secondContexts: IssueContext[] = [6, 4, 5].map((number) => ({
      ...structuredClone(f.contexts[0]!), id: `SECOND_ISSUE_${number}`, number, url: `https://github.com/test-org/repo/issues/${number}`,
      repository: structuredClone(repository), memberships: [{ itemId: `SECOND_ITEM_${number}`, projectId: secondMapping.id, archived: false,
        statusValues: [{ fieldId: secondMapping.status_field_id, optionId: secondMapping.status_option_ids.ready, name: 'Ready' }] }],
    }));
    const secondItems: ProjectItem[] = [
      { id: 'SECOND_ITEM_6', archived: false, kind: 'issue', contentId: 'SECOND_ISSUE_6', title: 'Issue 6', url: 'https://github.com/test-org/repo/issues/6', executable: true, position: 1 },
      { id: 'SECOND_ITEM_4', archived: false, kind: 'issue', contentId: 'SECOND_ISSUE_4', title: 'Issue 4', url: 'https://github.com/test-org/repo/issues/4', executable: true, position: 2 },
      { id: 'SECOND_ITEM_5', archived: true, kind: 'issue', contentId: 'SECOND_ISSUE_5', title: 'Issue 5', url: 'https://github.com/test-org/repo/issues/5', executable: false },
      { id: 'DRAFT_Z', archived: false, kind: 'draft', contentId: null, title: 'Draft Z', url: null, executable: false },
      { id: 'DRAFT_A', archived: false, kind: 'draft', contentId: null, title: 'Draft A', url: null, executable: false },
    ];
    for (const item of f.items) item.position = item.id === 'ITEM_3' ? 1 : 2;
    vi.mocked(f.github.listProjectItems).mockImplementation(async (id) => complete(structuredClone(id === secondMapping.id ? secondItems : f.items)));
    vi.mocked(f.github.getProject).mockImplementation(async (id) => complete({ ...structuredClone(projectDetails), project: { ...projectDetails.project, id } }));
    vi.mocked(f.github.getIssueContextById).mockImplementation(async (id) => complete(structuredClone(
      [...f.contexts, ...secondContexts].find((issue) => issue.id === id)!,
    )));

    const observed = await f.queue.observe({ limit: '1' });
    expect(observed.observation.page.items).toHaveLength(1);
    expect(observed.observation.page.items[0]?.projectId).toBe([f.projectId, secondId].sort()[0]);
    expect(observed.observation.page.items.some((item) => item.itemId === 'SECOND_ITEM_5')).toBe(false);
    expect([...new Set(observed.items.map((item) => item.projectId))]).toEqual([f.projectId, secondId].sort());
    expect(observed.items.filter((item) => item.projectId === f.projectId).map((item) => item.number)).toEqual([3, 1, 2]);
    const secondRows = observed.items.filter((item) => item.projectId === secondId);
    expect(secondRows.map((item) => item.number)).toEqual([4, 5, 6, null, null]);
    expect(secondRows.map((item) => item.itemId)).toEqual(['SECOND_ITEM_4', 'SECOND_ITEM_5', 'SECOND_ITEM_6', 'DRAFT_A', 'DRAFT_Z']);
    expect(secondRows.every((item) => item.order.criterion === 'Número crescente e ID')).toBe(true);
  });

  it('invalidates the existing authorization when the effective candidate sequence changes', async () => {
    const f = await queueFixture();
    const authorized = await f.queue.observe({});
    f.items[0]!.position = 3; f.items[1]!.position = 2; f.items[2]!.position = 1;
    const current = await f.queue.observe({});
    expect(current.items.map((item) => item.number)).toEqual([3, 2, 1]);
    expect(current.observation.summaryHash).not.toBe(authorized.observation.summaryHash);
    await expect(f.queue.save({ enabled: true, scope: authorized.observation.scope, observationId: authorized.observation.observationId!,
      authorizedSummaryHash: authorized.observation.summaryHash! }, { operationId: randomUUID(), expectedRevision: authorized.etag }))
      .rejects.toMatchObject({ code: 'QUEUE_SUMMARY_CHANGED', current: { observation: { summaryHash: current.observation.summaryHash } } });
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
    expect(f.db.prepare('SELECT count(*) AS count FROM queue_consumptions').get()).toEqual({ count: 0 });
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
    const changes = { time_defaults: { polling_interval_ms: 100, polling_backoff_max_ms: 500 } };
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes }, changes });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10000);
    try {
      vi.mocked(f.github.listProjectItems).mockResolvedValueOnce({ state: 'rate_limited', data: null, diagnostics: [], retryAtMs: 20000 });
      expect((await f.queue.observe({})).observation.polling).toMatchObject({ intervalMs: 100, backoffMaxMs: 500, retryAtMs: 20000, nextPollAtMs: 20000 });
      const calls = vi.mocked(f.github.listProjectItems).mock.calls.length;
      clock.mockReturnValue(19999);
      expect((await f.queue.observe({})).observation).toMatchObject({ complete: false, valid: false, eligibleTotal: null });
      expect(f.github.listProjectItems).toHaveBeenCalledTimes(calls);
      clock.mockReturnValue(20000);
      expect((await f.queue.observe({})).observation).toMatchObject({ valid: true, polling: { retryAtMs: null, nextPollAtMs: 20100 } });
    } finally { clock.mockRestore(); }
  });

  it('bounds exponential read backoff using the configured maximum and resets it after success', async () => {
    const f = await queueFixture();
    const settings = f.storage.getGlobalConfiguration();
    const changes = { time_defaults: { polling_interval_ms: 100, polling_backoff_max_ms: 250 } };
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
    await expect(f.queue.observe({ cursor: first.observation.page.next_cursor! })).rejects.toMatchObject({ code: 'QUEUE_CHANGED' });
    const changed = await f.queue.observe({});
    f.configure({ default_delivery_mode: 'commit' });
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
      f.configure({ default_delivery_mode: 'pr' });
      return complete(structuredClone(projectDetails));
    });
    expect((await f.queue.observe({})).observation).toMatchObject({ complete: false, valid: false, eligibleTotal: null });
    const next = createQueue({ storage: f.storage, github: f.github, workspaces: { inspectOrigin: f.inspectOrigin } });
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
const profile: ExecutionProfile = { name: 'Test exact profile', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider-exact', model: 'model-exact-v2', effort: 'custom-effort', guidance: 'Exact guidance' };
type ProfileInput = ExecutionProfile & { id?: string };
function profileCommands(profiles: readonly ProfileInput[]): ProfileChanges {
  return profiles.map((profile) => {
    if (profile.id) return { action: 'update' as const, id: profile.id, changes: {
      name: profile.name, provider: profile.provider, model: profile.model,
      effort: profile.effort, guidance: profile.guidance,
    } };
    return { action: 'create' as const, profile: {
      name: profile.name, profile_type: profile.profile_type ?? 'implementer', executor: profile.executor,
      provider: profile.provider, model: profile.model, effort: profile.effort, guidance: profile.guidance,
    } };
  });
}
type ProfileChangesInput = ProfileChanges | ProfileInput[];
function normalizeProfileChanges(profiles: ProfileChangesInput | undefined): ProfileChanges | undefined {
  if (profiles === undefined) return undefined;
  if (profiles.length === 0) return [];
  return 'action' in profiles[0]! ? profiles as ProfileChanges : profileCommands(profiles as ProfileInput[]);
}
const profileCatalog: ExecutionCatalog = { state: 'loaded', executor: 'maestri-omp', executor_version: 'fixture', observed_at_ms: 0,
  models: [
    { provider: 'provider-exact', provider_name: 'provider-exact', model: 'model-exact-v2', model_name: 'Exact model', efforts: ['custom-effort', 'changed-exactly', 'updated-exact'] },
    { provider: 'provider-exact', provider_name: 'provider-exact', model: 'must-rollback', model_name: 'Rollback fixture', efforts: ['custom-effort'] },
    { provider: 'provider-exact', provider_name: 'provider-exact', model: 'plain-model', model_name: 'Plain model', efforts: [] },
  ] };
const mapping = { id: 'PVT_test', owner_id: 'OWNER_test', status_field_id: 'FIELD_status', status_option_ids: { backlog: 'OPT_backlog', ready: 'OPT_ready', in_progress: 'OPT_progress', in_review: 'OPT_review', delivered: 'OPT_delivered' } };
const projectDetails: GitHubProjectDetails = { project: { id: mapping.id, owner: { id: mapping.owner_id, login: 'test-org', kind: 'organization' }, number: 1, title: 'Test Project', url: 'https://github.com/orgs/test-org/projects/1', closed: false },
  singleSelectFields: [{ id: mapping.status_field_id, name: 'Status', options: [
    { id: mapping.status_option_ids.backlog, name: 'Backlog' }, { id: mapping.status_option_ids.ready, name: 'Ready' },
    { id: mapping.status_option_ids.in_progress, name: 'In progress' }, { id: mapping.status_option_ids.in_review, name: 'In review' },
    { id: mapping.status_option_ids.delivered, name: 'Done' },
  ] }] };
function complete<T>(data: T): GitHubQueryResult<T> { return { state: 'complete', data, diagnostics: [], retryAtMs: null }; }
function fixture(realAdapters = false, selectionCallbacks: Pick<ProjectDependencies, 'selectProjectsDirectory' | 'selectGitHubExecutable' | 'selectExecutable' | 'toolDetector'> = {}, execution: ProjectDependencies['execution'] | null | undefined = undefined) {
  const directory = mkdtempSync(join(tmpdir(), 'factory-projects-')); directories.push(directory);
  const storage = openStorage({ dataDirectory: directory, busyTimeoutMs: 25 }); resources.push(storage);
  const inspection: OriginInspection = { state: 'identified', source: { kind: 'local', location: directory }, local: { root: directory, headSha: 'a'.repeat(40), dirty: true }, base: { branch: 'main', sha: 'a'.repeat(40), observedFrom: 'local' }, remote: null,
    diagnostics: [{ code: 'REMOTE_MISSING', message: 'No remote.', recovery: 'Configure remote.' }, { code: 'LOCAL_CHANGES_EXCLUDED', message: 'Dirty excluded.', recovery: 'Use committed base.' }], githubDiagnostics: [], retryAtMs: null, executionReady: false };
  const inspectOrigin = vi.fn(async (): Promise<OriginInspection> => structuredClone(inspection));
  const listBranches = vi.fn(async () => ({branches:['feature/local-only','main'],state:'complete' as const,message:null}));
  const github: ProjectDependencies['github'] = {
    getIdentity: vi.fn(async () => complete({ id: 'ACCOUNT_test', login: 'test-user' })),
    getProjectOwner: vi.fn(async (id) => complete({ ...projectDetails.project.owner, id })),
    listProjects: vi.fn(async () => complete([projectDetails.project])),
    getProject: vi.fn(async () => complete(structuredClone(projectDetails))),
    listProjectItems: vi.fn(async () => complete([])),
    getIssueContextById: vi.fn(async (id: string) => complete({ id, contentId: id, title: 'Issue fixture', url: 'https://github.com/example/repo/issues/1', kind: 'issue' as const, archived: false, executable: true })),
    validateProjectSelection: vi.fn(async (selected: GitHubProjectSelection): Promise<GitHubQueryResult<GitHubProjectDetails>> => {
      const valid = selected.id === mapping.id && selected.statusFieldId === mapping.status_field_id && selected.statusOptionIds.every((id) => Object.values(mapping.status_option_ids).includes(id));
      return valid ? complete(structuredClone(projectDetails)) : { state: 'partial', data: structuredClone(projectDetails), diagnostics: [{ code: 'STATUS_OPTION_INACCESSIBLE', message: 'Invalid mapping.', recovery: 'Select exact IDs.' }], retryAtMs: null };
    }),
  };
  const githubSetup: NonNullable<ProjectDependencies['githubSetup']> = {
    resolveExecutable: vi.fn(async () => ({ state: 'not_found' as const, path: null, version: null, diagnostics: [] })),
    validateExecutable: vi.fn(async (path: string) => ({ state: 'observed' as const, path, version: '2.70.0', diagnostics: [] })),
    activateExecutable: vi.fn(),
    getAuthenticationAccounts: vi.fn(async () => ({ state: 'observed' as const, accounts: [], diagnostics: [] })),
  };
  const configuration = loadConfiguration({ FACTORY_DATA_DIR: directory, FACTORY_LOG_LEVEL: 'silent' }, directory);
  const resolvedExecution = execution === undefined ? { getCatalog: vi.fn(async () => structuredClone(profileCatalog)) } : execution;
  const app = createApp(configuration, storage, undefined, realAdapters
    ? { ...selectionCallbacks, ...(resolvedExecution ? { execution: resolvedExecution } : {}) }
    : { github, githubSetup, workspaces: { inspectOrigin,listBranches }, ...selectionCallbacks, ...(resolvedExecution ? { execution: resolvedExecution } : {}) }); resources.push(app);
  const db = new Database(join(directory, 'factory.sqlite')); db.pragma('foreign_keys = ON'); resources.push(db);
  createProjectDeletionPersistence(db);
  return { app, storage, db, directory, github, githubSetup, inspectOrigin,listBranches, inspection, execution: resolvedExecution };
}
type Fixture = ReturnType<typeof fixture>;
async function session(f: Fixture) {
  const r = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: bootstrap, payload: {} }); expect(r.statusCode).toBe(200);
  return { ...bootstrap, cookie: String(r.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': r.json<SessionResponse>().csrf_token };
}
async function register(f: Fixture, headers: Record<string, string>, name = 'Test project', key = randomUUID()) {
  return f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...headers, 'idempotency-key': key }, payload: { name, source: { kind: 'local', location: f.directory }, base_branch: 'main' } });
}
type SettingsTestCommand = Omit<SettingsUpdate, 'profile_changes'> & { profile_changes?: ProfileChangesInput };
async function putSettings(f: Fixture, headers: Record<string, string>, body: SettingsTestCommand, etag = f.storage.getGlobalConfiguration().etag, key = randomUUID()) {
  const profileChanges = normalizeProfileChanges(body.profile_changes);
  const payload = { ...body, ...(profileChanges === undefined ? {} : { profile_changes: profileChanges }) };
  return f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'if-match': etag, 'idempotency-key': key }, payload });
}
async function selectSetting(f: Fixture, headers: Record<string, string>, payload: Record<string, unknown>) {
  return f.app.inject({ method: 'POST', url: '/api/v1/settings/selections', headers, payload });
}
describe('GitHub executable and account observation', () => {
  it('returns sanitized active-account observations without binding or writing settings', async () => {
    const f = fixture(); const headers = await session(f);
    const before = f.db.pragma('data_version', { simple: true });
    const path = 'C:\\Program Files\\GitHub CLI\\gh.exe';
    vi.mocked(f.githubSetup.resolveExecutable).mockResolvedValueOnce({
      state: 'observed', path, version: '2.70.0', diagnostics: [],
    });
    vi.mocked(f.githubSetup.getAuthenticationAccounts).mockResolvedValueOnce({ state: 'observed', diagnostics: [], accounts: [
      { login: 'test-user', active: true, valid: true },
      { login: 'inactive-user', active: false, valid: true },
      { login: 'invalid-user', active: false, valid: false },
    ] });

    const response = await f.app.inject({ url: '/api/v1/settings/github-options', headers });

    expect(response.statusCode).toBe(200);
    const options = response.json<GitHubSetupOptions>();
    expect(Value.Check(GitHubSetupOptions, options)).toBe(true);
    expect(options).toMatchObject({ executable: { state: 'observed', path, version: '2.70.0' }, linked_account: null,
      observed_account: { id: 'ACCOUNT_test', login: 'test-user' },
      accounts: [
        { id: 'ACCOUNT_test', login: 'test-user', active: true, valid: true, eligible: true },
        { id: 'inactive-user', login: 'inactive-user', active: false, valid: true, eligible: false },
        { id: 'invalid-user', login: 'invalid-user', active: false, valid: false, eligible: false },
      ], diagnostics: [{ code: 'GITHUB_AUTH_NEEDS_ATTENTION' }, { code: 'GITHUB_INACTIVE_ACCOUNTS' }] });
    expect(f.storage.getSettings().account_id).toBeNull();
    expect(f.storage.getSettings().automation_enabled).toBe(false);
    expect(f.db.pragma('data_version', { simple: true })).toBe(before);
  });

  it('keeps the linked account separate from the active account reported by GitHub CLI', async () => {
    const f = fixture(); const headers = await session(f); const path = 'C:\\Program Files\\GitHub CLI\\gh.exe';
    f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)')
      .run('LINKED_ACCOUNT', 'linked-user', Date.now(), Date.now(), Date.now());
    f.db.prepare("UPDATE factory_settings SET account_id='LINKED_ACCOUNT',revision=revision+1").run();
    vi.mocked(f.githubSetup.resolveExecutable).mockResolvedValueOnce({
      state: 'observed', path, version: '2.70.0', diagnostics: [],
    });
    vi.mocked(f.githubSetup.getAuthenticationAccounts).mockResolvedValueOnce({ state: 'observed', diagnostics: [],
      accounts: [{ login: 'test-user', active: true, valid: true }] });

    const response = await f.app.inject({ url: '/api/v1/settings/github-options', headers });

    expect(response.json<GitHubSetupOptions>()).toMatchObject({ linked_account: { id: 'LINKED_ACCOUNT', login: 'linked-user' },
      observed_account: { id: 'ACCOUNT_test', login: 'test-user' },
      accounts: [{ id: 'ACCOUNT_test', login: 'test-user', active: true, valid: true, eligible: true }],
      diagnostics: [{ code: 'GITHUB_ACCOUNT_MISMATCH' }] });
    expect(f.storage.getSettings().account_id).toBe('LINKED_ACCOUNT');
  });

  it('persists a validated executable as an isolated settings operation and exposes it on the next query', async () => {
    const f = fixture(); const headers = await session(f); const path = 'C:\\Tools\\GitHub CLI\\gh.exe'; const key = randomUUID();
    const etag = f.storage.getGlobalConfiguration().etag;
    const body: SettingsUpdate = { changes: {}, gh_executable_path: path };
    const saved = await putSettings(f, headers, body, etag, key);

    expect(saved.statusCode).toBe(200);
    const response = saved.json<SettingsSaved>();
    expect(f.githubSetup.validateExecutable).toHaveBeenCalledWith(path);
    expect(f.githubSetup.activateExecutable).toHaveBeenCalledWith({ state: 'observed', path, version: '2.70.0', diagnostics: [] });
    expect(f.storage.getGitHubExecutablePath()).toBe(path);
    expect(response.settings).not.toHaveProperty('gh_executable_path');
    const operation = await f.app.inject({ url: `/api/v1/operations/${response.operation_id}`, headers });
    expect(operation.statusCode).toBe(200);
    expect(operation.json()).toMatchObject({ operation_id: response.operation_id, kind: 'settings.update', state: 'succeeded', receipt: response.receipt });
    const replay = await putSettings(f, headers, body, etag, key);
    expect(replay.json<SettingsSaved>().operation_id).toBe(response.operation_id);
    expect(f.githubSetup.validateExecutable).toHaveBeenCalledOnce();

    vi.mocked(f.githubSetup.resolveExecutable).mockImplementationOnce(async savedPath => ({
      state: 'observed', path: savedPath ?? '', version: '2.70.0', diagnostics: [],
    }));
    const options = await f.app.inject({ url: '/api/v1/settings/github-options', headers });
    expect(vi.mocked(f.githubSetup.resolveExecutable).mock.calls.at(-1)?.[0]).toBe(path);
    expect(options.json<GitHubSetupOptions>().executable).toMatchObject({ state: 'observed', path, version: '2.70.0' });
    await reopenController(f);
    expect(f.storage.getGitHubExecutablePath()).toBe(path);
    expect(f.storage.getOperation(response.operation_id)?.state).toBe('succeeded');
  });

  it('rejects invalid or mixed executable saves without changing the stored path', async () => {
    const f = fixture(); const headers = await session(f); const etag = f.storage.getGlobalConfiguration().etag;
    vi.mocked(f.githubSetup.validateExecutable).mockResolvedValueOnce({
      state: 'unavailable', path: null, version: null, diagnostics: [{ code: 'GH_VERSION_QUERY_FAILED', message: 'safe', recovery: 'safe' }],
    });
    const invalid = await putSettings(f, headers, { changes: {}, gh_executable_path: 'C:\\missing\\gh.exe' }, etag);
    expect(invalid.statusCode).toBe(400);
    expect(f.storage.getGitHubExecutablePath()).toBeNull();
    expect(f.githubSetup.activateExecutable).not.toHaveBeenCalled();

    const combined = await putSettings(f, headers, { changes: { automation_enabled: true }, gh_executable_path: 'C:\\valid\\gh.exe' }, etag);
    expect(combined.statusCode).toBe(400);
    expect(f.storage.getSettings().automation_enabled).toBe(false);
    expect(f.storage.getGitHubExecutablePath()).toBeNull();
    expect(f.githubSetup.validateExecutable).toHaveBeenCalledTimes(1);
  });
});
type ConfigurationTestCommand = Omit<ConfigurationUpdate, 'profile_changes'> & { profile_changes?: ProfileChangesInput };
async function putConfiguration(f: Fixture, headers: Record<string, string>, id: string, body: ConfigurationTestCommand, etag = f.storage.getConfiguration(id).etag, key = randomUUID()) {
  const profileChanges = normalizeProfileChanges(body.profile_changes);
  const payload = { ...body, ...(profileChanges === undefined ? {} : { profile_changes: profileChanges }) };
  return f.app.inject({ method: 'PUT', url: `/api/v1/projects/${id}/configuration`, headers: { ...headers, 'if-match': etag, 'idempotency-key': key }, payload });
}
async function reopenController(f: Fixture): Promise<void> {
  const previousApp = f.app;
  const previousStorage = f.storage;
  await previousApp.close();
  previousStorage.close();
  for (const resource of [previousApp, previousStorage]) {
    const index = resources.indexOf(resource);
    if (index >= 0) resources.splice(index, 1);
  }
  const storage = openStorage({ dataDirectory: f.directory, busyTimeoutMs: 25 }); resources.push(storage);
  const configuration = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory);
  const app = createApp(configuration, storage, undefined, { github: f.github, workspaces: { inspectOrigin: f.inspectOrigin } }); resources.push(app);
  f.storage = storage;
  f.app = app;
}
afterEach(async () => {
  for (const r of resources.splice(0).reverse()) await r.close();
  for (const d of directories.splice(0)) rmSync(d, { recursive: true });
  const originalFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  vi.mocked(directoryFs.realpath).mockImplementation(originalFs.realpath);
  vi.restoreAllMocks();
});

describe('project registration and lightweight catalog', () => {
  it('returns sanitized validation errors keyed to project registration fields', async () => {
    const f = fixture(); const headers = await session(f);
    const response = await register(f, headers, 'x'.repeat(257));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field_errors: [{ field: 'name', message: 'Verifique este campo.' }] });
    expect(response.body).not.toContain('x'.repeat(257));
  });

  it('registers a dirty local origin without remote, persists its initial revision and preserves origin bytes', async () => {
    const f = fixture(); const headers = await session(f);
    for (const name of ['dirty.txt', 'HEAD', 'index']) writeFileSync(join(f.directory, name), `test bytes ${name} á`);
    const before = ['dirty.txt', 'HEAD', 'index'].map((name) => readFileSync(join(f.directory, name)));
    const r = await register(f, headers); expect(r.statusCode).toBe(201); expect(Value.Check(ProjectRegistered, r.json())).toBe(true);
    const body = r.json<ProjectDetail & { operation_id: string }>();
    expect(body.project.id).not.toBe(f.directory); expect(body.project.current_revision_id).toBeTruthy();
    expect(body.prerequisites.map((p) => p.code)).toEqual(expect.arrayContaining(['REMOTE_UNCONFIRMED', 'PROJECT_REQUIRED', 'PROFILES_REQUIRED', 'LOCAL_CHANGES_EXCLUDED', 'EXECUTION_REVALIDATION_REQUIRED']));
    const configuration = f.storage.getConfiguration(body.project.id).view.configuration;
    expect(configuration).toMatchObject({ correction_limit: 2, default_delivery_mode: 'icr', github_project: null, automation_enabled: false });
    expect(configuration).not.toHaveProperty('checks');
    expect(f.db.prepare('SELECT count(*) AS n FROM project_revisions WHERE project_id = ?').get(body.project.id)).toEqual({ n: 1 });
    expect(f.storage.getOperation(body.operation_id)).toMatchObject({ state: 'succeeded', resource: { id: body.project.id } });
    expect(r.headers.location).toBe(`/api/v1/projects/${body.project.id}`);
    const get = await f.app.inject({ url: String(r.headers.location), headers }); expect(get.statusCode).toBe(200); expect(get.headers.etag).toBe(r.headers.etag);
    expect(['dirty.txt', 'HEAD', 'index'].map((name) => readFileSync(join(f.directory, name)))).toEqual(before);
    expect(f.inspectOrigin).toHaveBeenCalledOnce(); expect(f.github.validateProjectSelection).not.toHaveBeenCalled();
  });
  it('lists branches through the authenticated API without persisting an operation',async () => {
    const f=fixture(); const headers=await session(f);
    const source={kind:'local',location:f.directory};
    const before=f.db.prepare('SELECT count(*) AS n FROM operation_requests').get();
    const denied=await f.app.inject({method:'POST',url:'/api/v1/branches',payload:{source},headers:{...headers,'x-csrf-token':''}});
    expect(denied.statusCode).toBe(403);expect(f.listBranches).not.toHaveBeenCalled();
    const response=await f.app.inject({method:'POST',url:'/api/v1/branches',payload:{source},headers});
    expect(response.statusCode,response.body).toBe(200);
    expect(response.json()).toMatchObject({state:'complete',branches:['feature/local-only','main']});
    expect(f.listBranches).toHaveBeenCalledWith(source);
    expect(f.db.prepare('SELECT count(*) AS n FROM operation_requests').get()).toEqual(before);
  });
  it.each(['new','existing'] as const)('persists the %s Branch de entrega default without a name, and reads an older name as ignored', async kind => {
    const f = fixture(); const headers = await session(f); const registered = await register(f,headers);
    const project = registered.json<ProjectDetail>().project;
    const before = f.storage.getConfiguration(project.id);
    const delivery_branch = { kind };
    const named = await f.app.inject({ method:'PUT',url:`/api/v1/projects/${project.id}/configuration`,
      headers:{ ...headers,'if-match':before.etag,'idempotency-key':randomUUID() },payload:{ project_changes:{ delivery_branch:{ kind,name:'release/validacao' } } } });
    expect(named.statusCode).toBe(400);
    const response = await f.app.inject({ method:'PUT',url:`/api/v1/projects/${project.id}/configuration`,
      headers:{ ...headers,'if-match':before.etag,'idempotency-key':randomUUID() },payload:{ project_changes:{ delivery_branch } } });
    expect(response.statusCode,response.body).toBe(200);
    const revisionId = f.storage.getConfiguration(project.id).view.configuration.id;
    expect(f.storage.getConfiguration(project.id).view.configuration).toMatchObject({ base_branch:before.view.configuration.base_branch,delivery_branch });
    expect(f.db.prepare('SELECT delivery_branch_json FROM project_revisions WHERE id=?').get(revisionId)).toEqual({ delivery_branch_json:JSON.stringify(delivery_branch) });
    // A revision written before the per-attempt name kept a fixed branch name; revisions are immutable, so the old row is simulated in this disposable database.
    f.db.exec('DROP TRIGGER project_revision_update_immutable');
    f.db.prepare('UPDATE project_revisions SET delivery_branch_json=? WHERE id=?').run(JSON.stringify({ kind,name:'feat/inicio-projeto' }),revisionId);
    expect(f.storage.getConfiguration(project.id).view.configuration.delivery_branch).toEqual(delivery_branch);
  });
  it.each(['remote', 'published_base', 'board'] as const)('requires repository and board identity but permits an unpublished local base: %s', async missing => {
    const f = fixture(); const headers = await session(f); const registration = await register(f, headers);
    const project = registration.json<ProjectDetail>().project;
    const expectedCode = missing === 'remote' ? 'REMOTE_UNCONFIRMED' : missing === 'published_base' ? 'CODE_NOT_PUBLISHED' : 'PROJECT_REQUIRED';
    const projectFields = missing === 'remote' ? {} : { source: { kind: 'local' as const, location: f.directory } };
    if (missing !== 'remote') {
      const repository = { id: 'REPOSITORY_test', name: 'repository', owner: { id: 'OWNER_test', login: 'test-org' },
        url: 'https://github.com/test-org/repository', defaultBranch: 'main', isPrivate: true, isArchived: false };
      f.inspection.remote = { name: 'origin', url: repository.url, confirmed: true, repository,
        branch: missing === 'published_base' ? null : { repositoryId: repository.id, name: 'main', sha: 'a'.repeat(40) } };
      f.inspection.diagnostics = missing === 'published_base'
        ? [{ code: 'BRANCH_NOT_FOUND', message: 'The selected base has no published commit.', recovery: 'Publish the configured base branch.' }]
        : [];
    }
    if (missing === 'published_base') {
      const beforeMapping = f.storage.getConfiguration(project.id);
      const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = beforeMapping.view.configuration;
      f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: beforeMapping.etag, projectId: project.id,
        body: { project_changes: { github_project: mapping } }, configuration: { ...configuration, github_project: mapping }, globalChanges: {} });
    }
    const current = f.storage.getConfiguration(project.id);
    const eventCount = f.storage.getEvents({}).items.length;
    const etag = f.storage.getConfiguration(project.id).etag;
    const response = await f.app.inject({ method: 'PUT', url: `/api/v1/projects/${project.id}/configuration`,
      headers: { ...headers, 'if-match': etag, 'idempotency-key': randomUUID() },
      payload: { project_changes: { ...projectFields, automation_enabled: true } } });
    if (missing === 'published_base') {
      expect(response.statusCode).toBe(200);
      expect(f.storage.getConfiguration(project.id).view.configuration.automation_enabled).toBe(true);
      return;
    }
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: expectedCode, affected_requirements: ['RF-15'] });
    expect(f.storage.getConfiguration(project.id).view.configuration.automation_enabled).toBe(false);
    expect(f.storage.getConfiguration(project.id).etag).toBe(current.etag);
    expect(f.storage.getEvents({}).items).toHaveLength(eventCount);
  });
  it('registers an existing local project when its GitHub base has no published commit and reports the missing requirement', async () => {
    const f = fixture(); const headers = await session(f);
    const repository = { id: 'REPOSITORY_test', name: 'repository', owner: { id: 'OWNER_test', login: 'test-org' },
      url: 'https://github.com/test-org/repository', defaultBranch: 'main', isPrivate: true, isArchived: false };
    f.inspection.remote = { name: 'origin', url: repository.url, confirmed: true, repository, branch: null };
    f.inspection.diagnostics = [{ code: 'BRANCH_NOT_FOUND', message: 'The selected base has no published commit.', recovery: 'Publish the configured base branch.' }];
    const response = await register(f, headers, 'Local project awaiting first push');
    expect(response.statusCode).toBe(201);
    expect(response.json<ProjectDetail>().prerequisites).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CODE_NOT_PUBLISHED', message: expect.stringContaining('branch-base'), recovery: expect.stringContaining('Publique') }),
    ]));
    expect(response.json<ProjectDetail>().prerequisites.map(item => item.code)).not.toContain('REMOTE_UNCONFIRMED');
    expect(f.storage.getConfiguration(response.json<ProjectDetail>().project.id).view.configuration.automation_enabled).toBe(false);
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
    f.inspection.source = { kind: 'local', location: f.directory };
    f.inspection.remote = { name: 'origin', url: 'git@github.com:test-org/repository.git', confirmed: true, branch: null, repository: { id: 'REPOSITORY_test', name: 'repository', owner: { id: 'OWNER_test', login: 'test-org' }, url: 'https://github.com/test-org/repository', defaultBranch: 'main', isPrivate: true, isArchived: false } };
    const r = await f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { name: 'Unrelated name', source: { kind: 'local', location: f.directory }, base_branch: 'main' } });
    expect(r.statusCode).toBe(201); expect(r.json<ProjectDetail>().project.source).toMatchObject({ repository_id: 'REPOSITORY_test', repository_url: 'https://github.com/test-org/repository' });
  });
  it('uses a bounded cursor tied to filters, account, installation and stable name/ID order', async () => {
    const f = fixture(); const headers = await session(f);
    for (const name of ['Equal', 'Equal', 'Other', 'Literal_%']) expect((await register(f, headers, name)).statusCode).toBe(201);
    const first = f.storage.listProjects({ limit: '1', search: 'Equal' }); expect(first.has_more).toBe(true);
    await register(f, headers, 'Equal'); // New registrations do not enter an existing continuation.
    const second = f.storage.listProjects({ limit: '1', search: 'Equal', cursor: first.next_cursor! });
    expect(second.has_more).toBe(false); expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(() => f.storage.listProjects({ search: 'Other', cursor: first.next_cursor! })).toThrowError(expect.objectContaining({ code: 'CURSOR_INVALID' }));
    expect(f.storage.listProjects({ search: '_%' }).items).toHaveLength(1);
    const http = await f.app.inject({ url: '/api/v1/projects?limit=2', headers }); expect(http.statusCode).toBe(200);
    expect(http.json<ProjectPage>().items).toHaveLength(2); expect(http.body).not.toMatch(/checks|guidance|headSha|dirty\.txt/);
    expect((await f.app.inject({ url: '/api/v1/projects?limit=101', headers })).statusCode).toBe(400);
    expect((await f.app.inject({ url: '/api/v1/projects?cursor=malformed', headers })).statusCode).toBe(400);
  });
  it('rejects invalid schemas, IDs, missing keys, session and CSRF without writes', async () => {
    const f = fixture(); const headers = await session(f);
    const body = { name: 'Test', source: { kind: 'local', location: f.directory }, base_branch: 'main' };
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
  it.each(['designatedHost', 'dataRoot', 'maestriSettings', 'designated_host', 'data_root', 'maestri_settings_json'])('rejects retired editable field %s on both aggregate routes without side effects', async field => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id); const events = f.storage.getEvents({});
    const changes = { projects_root: null, [field]: 'forbidden-override' };
    for (const [url, payload, etag] of [
      ['/api/v1/settings', { changes }, f.storage.getGlobalConfiguration().etag],
      [`/api/v1/projects/${id}/configuration`, { project_changes: {}, globalChanges: changes }, before.etag],
    ] as const) {
      const response = await f.app.inject({ method: 'PUT', url, headers: { ...headers, 'if-match': etag, 'idempotency-key': randomUUID() }, payload });
      expect(response.statusCode).toBe(400);
    }
    expect(() => f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: f.storage.getGlobalConfiguration().etag, body: { changes }, changes })).toThrow();
    expect(f.storage.getConfiguration(id)).toEqual(before); expect(f.storage.getEvents({})).toEqual(events);
  });
  it('starts with empty profiles and preserves exact profiles and omitted nested defaults', async () => {
    const f = fixture(); const headers = await session(f); const initial = f.storage.getGlobalConfiguration(); expect(initial.view.profiles).toEqual([]);
    const first = await putSettings(f, headers, { changes: { time_defaults: { polling_interval_ms: 25000 } }, profile_changes: [profile] });
    expect(first.statusCode).toBe(200); expect(Value.Check(SettingsSaved, first.json())).toBe(true);
    const saved = first.json<SettingsView>(); expect(saved.profiles[0]).toMatchObject(profile);
    expect(saved.settings.time_defaults.passage_active_time_ms).toBe(initial.view.settings.time_defaults.passage_active_time_ms);
    const second = await putSettings(f, headers, { changes: { time_defaults: { passage_active_time_ms: 60000 } } }); expect(second.statusCode).toBe(200);
    expect(second.json<SettingsView>().settings).toMatchObject({ time_defaults: { polling_interval_ms: 25000, passage_active_time_ms: 60000 } });
    expect(second.json<SettingsView>().profiles).toEqual(saved.profiles);
    expect((await f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'idempotency-key': randomUUID(), 'if-match': String(second.headers.etag) }, payload: { changes: {}, profile_changes: [{ ...profile, executor: 'unsupported' }] } })).statusCode).toBe(400);
  });
  it('returns 428/412 for missing/stale ETag and recovers the original accepted receipt before CAS', async () => {
    const f = fixture(); const headers = await session(f); const etag = f.storage.getGlobalConfiguration().etag; const key = randomUUID();
    const body = { changes: { time_defaults: { polling_interval_ms: 21000 } } };
    const first = await putSettings(f, headers, body, etag, key); expect(first.statusCode).toBe(200);
    expect((await putSettings(f, headers, { changes: { time_defaults: { polling_interval_ms: 22000 } } }, etag)).statusCode).toBe(412);
    expect((await f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: body })).statusCode).toBe(428);
    expect((await putSettings(f, headers, body, etag, key)).json()).toEqual(first.json());
    expect((await putSettings(f, headers, body, first.headers.etag as string, key)).statusCode).toBe(409);
    expect((await putSettings(f, headers, { changes: {} })).statusCode).toBe(409);
    expect(f.storage.getEvents({}).items).toHaveLength(1);
  });
  it.each(['events', 'operation_requests'] as const)('rolls back settings, profile, operation and receipt when %s persistence fails', async (table) => {
    const f = fixture(); const headers = await session(f); const before = f.storage.getGlobalConfiguration(); const key = randomUUID();
    const body: SettingsUpdate = { changes: { time_defaults: { polling_interval_ms: 23000 } }, profile_changes: profileCommands([profile]) };
    f.db.exec(`CREATE TRIGGER fail_settings_save BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    const response = await putSettings(f, headers, body, before.etag, key);
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toMatch(/test failure|sqlite|stack/i);
    expect(f.storage.getGlobalConfiguration()).toEqual(before);
    expect(f.storage.getOperation(key)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM operation_requests WHERE operation_id = ?').get(key)).toEqual({ n: 0 });
    expect(f.db.prepare('SELECT count(*) AS n FROM events WHERE operation_id = ?').get(key)).toEqual({ n: 0 });
  });
  it('commits one settings operation and event for concurrent requests with the same ID', async () => {
    const f = fixture(); const headers = await session(f); const before = f.storage.getGlobalConfiguration(); const key = randomUUID();
    const body: SettingsUpdate = { changes: { time_defaults: { polling_interval_ms: 23000 } }, profile_changes: profileCommands([profile]) };
    const [first, second] = await Promise.all([
      putSettings(f, headers, body, before.etag, key),
      putSettings(f, headers, body, before.etag, key),
    ]);
    expect(first.statusCode).toBe(200); expect(second.statusCode).toBe(200);
    expect(first.json<SettingsSaved>().receipt).toEqual(second.json<SettingsSaved>().receipt);
    expect(first.json<SettingsSaved>().operation_id).toBe(key); expect(second.json<SettingsSaved>().operation_id).toBe(key);
    expect(f.storage.getGlobalConfiguration().view.settings.revision).toBe(before.view.settings.revision + 1);
    expect(f.storage.getGlobalConfiguration().view.profiles).toHaveLength(1);
    expect(f.db.prepare('SELECT count(*) AS n FROM operation_requests WHERE operation_id = ?').get(key)).toEqual({ n: 1 });
    expect(f.db.prepare('SELECT count(*) AS n FROM events WHERE operation_id = ?').get(key)).toEqual({ n: 1 });
  });
  it('recovers the original settings receipt after reopen before path validation and stale CAS', async () => {
    const f = fixture(); const headers = await session(f); const etag = f.storage.getGlobalConfiguration().etag; const key = randomUUID();
    const body: SettingsUpdate = { changes: { projects_root: f.directory } };
    vi.mocked(directoryFs.realpath).mockClear().mockResolvedValueOnce(f.directory);
    const first = await putSettings(f, headers, body, etag, key);
    expect(first.statusCode).toBe(200);
    const receipt = first.json<SettingsSaved>().receipt;
    vi.mocked(directoryFs.realpath).mockClear().mockRejectedValue(new Error('Path validation must not repeat'));
    await reopenController(f);
    const currentHeaders = await session(f);
    const replay = await putSettings(f, currentHeaders, body, etag, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json<SettingsSaved>().receipt).toEqual(receipt);
    expect(replay.json<SettingsSaved>().operation_id).toBe(key);
    expect(directoryFs.realpath).not.toHaveBeenCalled();
    const operation = await f.app.inject({ url: `/api/v1/operations/${key}`, headers: currentHeaders });
    expect(operation.statusCode).toBe(200);
    expect(operation.json()).toMatchObject({ operation_id: key, state: 'succeeded', receipt });
    expect(f.db.prepare('SELECT count(*) AS n FROM events WHERE operation_id = ?').get(key)).toEqual({ n: 1 });
  });
  it('includes profile revisions and new profiles in the compound ETag of every project editor', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const old = f.storage.getConfiguration(id).etag;
    expect((await putSettings(f, headers, { changes: {}, profile_changes: [profile] })).statusCode).toBe(200);
    expect((await putConfiguration(f, headers, id, { project_changes: { correction_limit: 3 } }, old)).statusCode).toBe(412);
    const stored = f.storage.getGlobalConfiguration().view.profiles[0]!; const etag = f.storage.getConfiguration(id).etag;
    expect((await putSettings(f, headers, { changes: {}, profile_changes: [{ ...profile, id: stored.id, effort: 'changed-exactly' }] })).statusCode).toBe(200);
    expect((await putConfiguration(f, headers, id, { project_changes: { correction_limit: 3 } }, etag)).statusCode).toBe(412);
    expect(f.storage.getGlobalConfiguration().view.profiles[0]).toMatchObject({ revision: 2, effort: 'changed-exactly' });
  });
  it('atomically commits all project fields, explicit globals, profiles, pointer, receipt and event', async () => {
    const f = fixture(); const headers = await session(f);
    const repository = { id: 'REPOSITORY_test', name: 'repository', owner: { id: 'OWNER_test', login: 'test-org' },
      url: 'https://github.com/test-org/repository', defaultBranch: 'main', isPrivate: true, isArchived: false };
    f.inspection.remote = { name: 'origin', url: repository.url, confirmed: true, repository,
      branch: { repositoryId: repository.id, name: 'main', sha: 'a'.repeat(40) } };
    f.inspection.diagnostics = [{ code: 'LOCAL_CHANGES_EXCLUDED', message: 'Dirty excluded.', recovery: 'Use committed base.' }];
    const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    await putSettings(f, headers, { changes: {}, profile_changes: [profile] });
    const p = f.storage.getGlobalConfiguration().view.profiles[0]!; const old = f.storage.getConfiguration(id);
     const body: ConfigurationUpdate = { project_changes: { github_project: mapping, implementer_profile_id: p.id, reviewer_profile_id: p.id, correction_limit: 5, default_delivery_mode: 'pr', automation_enabled: true, queue_order: { use_board_position: false }, guidance: 'Project instructions' }, global_changes: { time_defaults: { passage_active_time_ms: 123456 } }, profile_changes: profileCommands([{ ...profile, id: p.id, effort: 'updated-exact' }]) };
    const key = randomUUID(); const r = await putConfiguration(f, headers, id, body, old.etag, key); expect(r.statusCode).toBe(200); expect(Value.Check(ConfigurationSaved, r.json())).toBe(true);
    const view = r.json<ConfigurationView>(); expect(view.configuration).toMatchObject({ revision: 2, correction_limit: 5, github_project: mapping, queue_order: { use_board_position: false } });
    expect(view.configuration.queue_order).toEqual({ use_board_position: false });
    const queueJson = f.db.prepare('SELECT queue_order_json FROM project_revisions WHERE id = ?').get(view.configuration.id) as { queue_order_json: string };
    expect(JSON.parse(queueJson.queue_order_json)).toEqual({ useBoardPosition: false });
    expect(view.configuration.id).not.toBe(old.view.configuration.id); expect(view.settings.designated_host).toBe(old.view.settings.designated_host); expect(view.profiles[0]?.effort).toBe('updated-exact');
    expect(f.db.prepare('SELECT correction_limit FROM project_revisions WHERE id = ?').get(old.view.configuration.id)).toEqual({ correction_limit: 2 });
    expect(f.db.prepare('SELECT count(*) AS n FROM events WHERE operation_id = ? AND project_id = ?').get(key, id)).toEqual({ n: 1 });
    expect(f.storage.getOperation(key)).toMatchObject({ state: 'succeeded', receipt: { revision: 2 } });
    vi.mocked(f.github.validateProjectSelection).mockRejectedValue(new Error('Must recover before remote IO'));
    await reopenController(f);
    expect(f.storage.getConfiguration(id).view.configuration.queue_order).toEqual({ use_board_position: false });
    const currentHeaders = await session(f);
    const replay = await putConfiguration(f, currentHeaders, id, body, old.etag, key);
    expect(replay.statusCode).toBe(200); expect(replay.json()).toEqual(r.json());
    expect(f.github.validateProjectSelection).toHaveBeenCalledOnce();
    const operation = await f.app.inject({ url: `/api/v1/operations/${key}`, headers: currentHeaders });
    expect(operation.statusCode).toBe(200); expect(operation.json()).toMatchObject({ operation_id: key, state: 'succeeded', receipt: r.json<ConfigurationSaved>().receipt });
  });
  it('rejects a saved operation ID when the project resource or account context changes', async () => {
    const f = fixture(); const headers = await session(f);
    const firstId = (await register(f, headers, 'First')).json<ProjectDetail>().project.id;
    const secondId = (await register(f, headers, 'Second')).json<ProjectDetail>().project.id;
    const body: ConfigurationUpdate = { project_changes: { correction_limit: 4 } };
    const key = randomUUID(); const original = f.storage.getConfiguration(firstId);
    const accepted = await putConfiguration(f, headers, firstId, body, original.etag, key);
    expect(accepted.statusCode).toBe(200);
    const eventsBefore = f.db.prepare('SELECT count(*) AS n FROM events').get();
    expect((await putConfiguration(f, headers, secondId, body, f.storage.getConfiguration(secondId).etag, key)).statusCode).toBe(409);
    expect(f.db.prepare('SELECT count(*) AS n FROM events').get()).toEqual(eventsBefore);
    f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)')
      .run('ACCOUNT_changed', 'changed-user', Date.now(), Date.now(), Date.now());
    f.db.prepare("UPDATE factory_settings SET account_id='ACCOUNT_changed', revision=revision+1 WHERE id='local'").run();
    expect((await putConfiguration(f, headers, firstId, body, original.etag, key)).statusCode).toBe(409);
    expect(f.db.prepare('SELECT count(*) AS n FROM events').get()).toEqual(eventsBefore);
    expect(f.db.prepare('SELECT count(*) AS n FROM events WHERE operation_id = ?').get(key)).toEqual({ n: 1 });
  });
  it.each(['event', 'operation', 'revision', 'pointer'])('rolls back every aggregate when %s persistence fails', async (kind) => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    await putSettings(f, headers, { changes: {}, profile_changes: [profile] }); const p = f.storage.getGlobalConfiguration().view.profiles[0]!;
    const before = f.storage.getConfiguration(id); const events = f.storage.getEvents({}); const key = randomUUID();
    const table = kind === 'event' ? 'events' : kind === 'operation' ? 'operation_requests' : kind === 'revision' ? 'project_revisions' : 'projects';
    f.db.exec(`CREATE TRIGGER fail_write BEFORE ${kind === 'pointer' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    const r = await putConfiguration(f, headers, id, { project_changes: { correction_limit: 4 }, global_changes: { time_defaults: { polling_interval_ms: 23000 } }, profile_changes: [{ ...profile, id: p.id, model: 'must-rollback' }] }, before.etag, key);
    expect(r.statusCode).toBe(503); expect(r.body).not.toMatch(/test failure|must-rollback|sqlite|stack/i);
    expect(f.storage.getConfiguration(id)).toEqual(before); expect(f.storage.getEvents({})).toEqual(events); expect(f.storage.getOperation(key)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM project_revisions WHERE project_id = ?').get(id)).toEqual({ n: 1 });
  });
  it('rolls back settings on unknown/duplicate profiles and invalid project profile links', async () => {
    const f = fixture(); const headers = await session(f); const before = f.storage.getGlobalConfiguration();
    const r = await putSettings(f, headers, { changes: { time_defaults: { polling_interval_ms: 23000 } }, profile_changes: [{ ...profile, id: randomUUID() }] }); expect(r.statusCode).toBe(404); expect(f.storage.getGlobalConfiguration()).toEqual(before);
    const repeatedId = randomUUID(); expect((await putSettings(f, headers, { changes: {}, profile_changes: [{ ...profile, id: repeatedId }, { ...profile, id: repeatedId }] })).statusCode).toBe(400);
    const id = (await register(f, headers)).json<ProjectDetail>().project.id; const old = f.storage.getConfiguration(id);
    expect((await putConfiguration(f, headers, id, { project_changes: { implementer_profile_id: randomUUID() }, global_changes: { time_defaults: { polling_interval_ms: 23000 } } })).statusCode).toBe(404);
    expect(f.storage.getConfiguration(id)).toEqual(old);
  });
  it('rejects retired manual check definitions directly, nested and combined before writes or execution', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id); const globalBefore = f.storage.getGlobalConfiguration();
    const count = (table: 'events' | 'operation_requests' | 'attempts' | 'preparations' | 'preparation_revisions') =>
      f.db.prepare<[], { n: number }>(`SELECT count(*) AS n FROM ${table}`).get()!.n;
    const beforeCounts = { events: count('events'), operations: count('operation_requests'), attempts: count('attempts'), preparations: count('preparations'), revisions: count('preparation_revisions') };
    const execution = f.execution;
    if (!execution) throw new Error('The controlled execution fixture is required.');
    f.inspectOrigin.mockClear(); vi.mocked(f.github.validateProjectSelection).mockClear(); vi.mocked(execution.getCatalog).mockClear();
    const definitions = [{ id: 'check', command: 'npm.cmd test', cwd_relative: '.' }];
    const payloads: Record<string, unknown>[] = [
      { project_changes: { checks: definitions } },
      { project_changes: { source: { kind: 'local', location: f.directory, checks: definitions } } },
      { project_changes: { correction_limit: 4, checks: definitions }, global_changes: { time_defaults: { polling_interval_ms: 23000 }, checks: definitions } },
      { project_changes: { correction_limit: '4' } },
    ];
    for (const payload of payloads) {
      const response = await f.app.inject({ method: 'PUT', url: `/api/v1/projects/${id}/configuration`,
        headers: { ...headers, 'if-match': before.etag, 'idempotency-key': randomUUID() }, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ code: string }>().code).toBe('VALIDATION_FAILED');
    }
    expect(f.storage.getConfiguration(id)).toEqual(before);
    expect(f.storage.getGlobalConfiguration()).toEqual(globalBefore);
    expect({ events: count('events'), operations: count('operation_requests'), attempts: count('attempts'), preparations: count('preparations'), revisions: count('preparation_revisions') }).toEqual(beforeCounts);
    expect(f.inspectOrigin).not.toHaveBeenCalled(); expect(f.github.validateProjectSelection).not.toHaveBeenCalled();
    expect(execution.getCatalog).not.toHaveBeenCalled();
  });
  it('saves and reopens only the remaining project configuration fields', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id);
    const response = await putConfiguration(f, headers, id, { project_changes: { base_branch: 'release', correction_limit: 1, guidance: 'Current guidance' } }, before.etag);
    expect(response.statusCode).toBe(200);
    const expected = f.storage.getConfiguration(id).view.configuration;
    expect(expected).toMatchObject({ base_branch: 'release', correction_limit: 1, guidance: 'Current guidance' });
    expect(expected).not.toHaveProperty('checks');
    const columns = f.db.prepare<[], { name: string }>("PRAGMA table_info('project_revisions')").all().map(column => column.name);
    expect(columns).not.toContain('checks_json');
    const revision = f.db.prepare<[string], Record<string, unknown>>('SELECT * FROM project_revisions WHERE id=?').get(expected.id);
    expect(revision).not.toHaveProperty('checks_json');
    await f.app.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
      const restored = reopened.getConfiguration(id).view.configuration;
      expect(restored).toEqual(expected);
      expect(restored).not.toHaveProperty('checks');
      expect(JSON.stringify(restored)).not.toContain('"checks"');
    } finally { reopened.close(); }
  });
  it.each([-1, 6, 1.5])('rejects invalid correction limit %s', async (correctionLimit) => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    expect((await putConfiguration(f, headers, id, { project_changes: { correction_limit: correctionLimit } })).statusCode).toBe(400);
  });
  it('rejects invalid, duplicate, incomplete, inaccessible or wrong-owner Status mappings', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    for (const selected of [
      { ...mapping, owner_id: 'different' }, { ...mapping, status_field_id: 'different' },
      { ...mapping, status_option_ids: { ...mapping.status_option_ids, ready: 'unknown' } },
      { ...mapping, status_option_ids: { ...mapping.status_option_ids, ready: mapping.status_option_ids.delivered } },
    ]) expect((await putConfiguration(f, headers, id, { project_changes: { github_project: selected } })).statusCode).toBe(400);
    vi.mocked(f.github.validateProjectSelection).mockResolvedValue({ state: 'rate_limited', data: null, diagnostics: [], retryAtMs: Date.now() + 60000 });
    expect((await putConfiguration(f, headers, id, { project_changes: { github_project: mapping } })).statusCode).toBe(503);
    expect(f.storage.getConfiguration(id).view.configuration.github_project).toBeNull();
  });
  it('rejects existing option IDs when observed names, order or mapped identities are incompatible', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const validOptions = projectDetails.singleSelectFields[0]!.options;
    const mismatches: GitHubProjectDetails[] = [
      { ...projectDetails, singleSelectFields: [{ ...projectDetails.singleSelectFields[0]!, options: validOptions.map((option, index) => ({ ...option, name: index === 0 ? 'Icebox' : option.name })) }] },
      { ...projectDetails, singleSelectFields: [{ ...projectDetails.singleSelectFields[0]!, options: [...validOptions].reverse() }] },
      { ...projectDetails, singleSelectFields: [{ ...projectDetails.singleSelectFields[0]!, options: validOptions.map((option, index) => ({ ...option, id: validOptions[(index + 1) % validOptions.length]!.id })) }] },
    ];
    for (const details of mismatches) {
      vi.mocked(f.github.validateProjectSelection).mockResolvedValue(complete(details));
      const response = await putConfiguration(f, headers, id, { project_changes: { github_project: mapping } });
      expect(response.statusCode).toBe(400);
      expect(f.storage.getConfiguration(id).view.configuration.github_project).toBeNull();
    }
  });
  it('prevents rewriting history, deleting it, null/missing pointers or linking another project revision', async () => {
    const f = fixture(); const headers = await session(f); const a = (await register(f, headers, 'A')).json<ProjectDetail>().project; const b = (await register(f, headers, 'B')).json<ProjectDetail>().project;
    expect(() => f.db.prepare('UPDATE project_revisions SET correction_limit = 3 WHERE id = ?').run(a.current_revision_id)).toThrow('IMMUTABLE_RECORD');
    expect(() => f.db.prepare('DELETE FROM project_revisions WHERE id = ?').run(a.current_revision_id)).toThrow('IMMUTABLE_RECORD');
    expect(() => f.db.prepare('UPDATE projects SET current_revision_id = ? WHERE id = ?').run(b.current_revision_id, a.id)).toThrow();
    expect(() => f.db.prepare('UPDATE projects SET current_revision_id = NULL WHERE id = ?').run(a.id)).toThrow();
    expect(() => f.db.prepare('INSERT INTO projects(id, name, current_revision_id, revision, created_at_ms, updated_at_ms) VALUES (?, ?, ?, 1, 0, 0)').run(randomUUID(), 'Orphan', randomUUID())).toThrow();
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it('returns real owner/Project fields for an unsaved selection and paginates without silently truncating', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    vi.mocked(f.github.listProjects).mockResolvedValue(complete([projectDetails.project, { ...projectDetails.project, id: 'ZZ-last' }]));
    const url = `/api/v1/projects/${id}/configuration-options?owner_id=${mapping.owner_id}&github_project_id=${mapping.id}&status_field_id=${mapping.status_field_id}&limit=1`;
    const r = await f.app.inject({ url, headers }); expect(r.statusCode).toBe(200); expect(Value.Check(ConfigurationOptions, r.json())).toBe(true);
    const options = r.json<ConfigurationOptions>(); expect(options.completeness).toBe('complete'); expect(options.status_options).toHaveLength(5); expect(options.projects.has_more).toBe(true);
    expect(f.github.getProjectOwner).toHaveBeenCalledWith(mapping.owner_id); expect(f.github.listProjects).toHaveBeenCalledWith({ kind: 'organization', login: 'test-org' });
    const next = await f.app.inject({ url: `${url}&cursor=${options.projects.next_cursor}`, headers }); expect(next.statusCode).toBe(200); expect(next.json<ConfigurationOptions>().projects.items[0]?.id).toBe('ZZ-last');
    vi.mocked(f.github.listProjects).mockResolvedValue(complete([projectDetails.project]));
    expect((await f.app.inject({ url: `${url}&cursor=${options.projects.next_cursor}`, headers })).statusCode).toBe(409);
    expect(f.storage.getEvents({}).items).toHaveLength(1);
  });
  it('reports unavailable option reads explicitly with the production adapter', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    await f.app.close();
    const reopened = openStorage({ dataDirectory: f.directory }); const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), reopened); resources.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: bootstrap, payload: {} });
    const h = { ...bootstrap, cookie: String(response.headers['set-cookie']).split(';')[0]! };
    const r = await app.inject({ url: `/api/v1/projects/${id}/configuration-options`, headers: h }); expect(r.statusCode).toBe(200);
    expect(r.json<ConfigurationOptions>()).toMatchObject({ completeness: 'unavailable', projects: { items: [], has_more: false }, diagnostics: [{ code: 'CONTEXT_UNAVAILABLE' }] });
  });
  it('exposes only fixed native selections, validates the candidates and never saves them implicitly', async () => {
    const directoryBase = mkdtempSync(join(tmpdir(), 'selection paths - ')); directories.push(directoryBase);
    const selectedDirectory = join(directoryBase, 'projetos á café'); mkdirSync(selectedDirectory);
    const executableDirectory = join(directoryBase, 'ferramentas á'); mkdirSync(executableDirectory);
    const selectedExecutable = join(executableDirectory, 'gh.exe'); writeFileSync(selectedExecutable, 'fixture executable');
    const selectProjectsDirectory = vi.fn(async () => selectedDirectory);
    const selectGitHubExecutable = vi.fn(async () => selectedExecutable);
    const f = fixture(false, { selectProjectsDirectory, selectGitHubExecutable }); const headers = await session(f);
    const openProbe = vi.spyOn(directoryFs, 'open');

    const folder = await selectSetting(f, headers, { kind: 'projects_root' });
    expect(folder.statusCode).toBe(200);
    expect(Value.Check(NativeSelectionResult, folder.json())).toBe(true);
    expect(folder.json()).toMatchObject({ state: 'selected', kind: 'projects_root', path: selectedDirectory });
    expect(openProbe.mock.calls.some(([path, flags, mode]) => String(path).includes('.nova-fabrica-write-probe-') && flags === 'wx' && mode === 0o600)).toBe(true);
    expect(await directoryFs.readdir(selectedDirectory)).toEqual([]);
    const executable = await selectSetting(f, headers, { kind: 'gh_executable' });
    expect(executable.statusCode).toBe(200);
    expect(executable.json()).toMatchObject({ state: 'selected', kind: 'gh_executable', path: selectedExecutable });
    const projectDirectory = await selectSetting(f, headers, { kind: 'project_directory' });
    expect(projectDirectory.statusCode).toBe(200);
    expect(projectDirectory.json()).toMatchObject({ state: 'selected', kind: 'project_directory', path: selectedDirectory });
    expect(selectProjectsDirectory).toHaveBeenCalledTimes(2); expect(selectGitHubExecutable).toHaveBeenCalledTimes(1);
    expect(f.storage.getSettings().projects_root).toBeNull();
    expect(f.db.prepare('SELECT projects_root_confirmed_at_ms FROM factory_settings').get()).toEqual({ projects_root_confirmed_at_ms: null });
    expect(f.db.prepare('SELECT count(*) AS count FROM operation_requests').get()).toEqual({ count: 0 });

    const invalidRequest = await selectSetting(f, headers, { kind: 'projects_root', path: selectedDirectory, command: 'whoami', argv: ['--version'] });
    expect(invalidRequest.statusCode).toBe(400);
    expect(selectProjectsDirectory).toHaveBeenCalledTimes(2);
    openProbe.mockRestore();
  });

  it('accepts and validates each of the four managed executable kinds independently', async () => {
    const directoryBase = mkdtempSync(join(tmpdir(), 'native tools - ')); directories.push(directoryBase);
    const names = ['git.exe', 'maestri.exe', 'omp.exe', 'pwsh.exe'];
    const executableDirectory = join(directoryBase, 'Ferramentas ç'); mkdirSync(executableDirectory);
    const paths = names.map(name => { const path = join(executableDirectory, name); writeFileSync(path, 'native fixture'); return path; });
    const selected = [...paths];
    const selectExecutable = vi.fn(async () => selected.shift() ?? null);
    const toolDetector = createToolDetector({ platform: 'win32', stat: async () => ({ isFile: () => true }), access: async () => {},
      run: async () => 'tool version 1.0' });
    const f = fixture(false, { selectExecutable, toolDetector }); const headers = await session(f);
    const kinds = ['git_executable', 'maestri_executable', 'omp_executable', 'powershell_executable'] as const;

    for (const [index, kind] of kinds.entries()) {
      const response = await selectSetting(f, headers, { kind });
      expect(response.statusCode).toBe(200);
      expect(Value.Check(NativeSelectionResult, response.json())).toBe(true);
      expect(response.json()).toEqual({ state: 'selected', kind, path: paths[index], observed_at_ms: expect.any(Number) });
    }
    expect(selectExecutable).toHaveBeenCalledTimes(4);
    expect(f.storage.getGlobalConfiguration().view.tool_preferences.git.preferred_path).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS count FROM operation_requests').get()).toEqual({ count: 0 });
  });

  it('saves only validated executable preferences with server timestamps and stable replay identity', async () => {
    const toolDetector = createToolDetector({ platform: 'win32', stat: async () => ({ isFile: () => true }), access: async () => {},
      run: async () => 'version 1.0', clock: () => 9876 });
    const f = fixture(false, { toolDetector }); const headers = await session(f);
    const preferences: NonNullable<SettingsUpdate['tool_preferences']> = {
      format_version: 1,
      git: { preferred_path: 'C:\\Program Files ç\\git.exe', last_validated_at_ms: null },
      maestri: { preferred_path: 'C:\\Program Files ç\\maestri.exe', last_validated_at_ms: null },
      omp: { preferred_path: 'C:\\Program Files ç\\omp.exe', last_validated_at_ms: null },
      powershell: { preferred_path: 'C:\\Program Files ç\\pwsh.exe', last_validated_at_ms: null },
    };
    const command: SettingsUpdate = { changes: {}, tool_preferences: preferences };
    const key = randomUUID();
    const expectedRevision = f.storage.getGlobalConfiguration().etag;
    const saved = await putSettings(f, headers, command, expectedRevision, key);
    expect(saved.statusCode).toBe(200);
    const body = saved.json<SettingsSaved>();
    expect(body.tool_preferences).toMatchObject({
      format_version: 1,
      git: { preferred_path: 'C:\\Program Files ç\\git.exe', last_validated_at_ms: 9876 },
      maestri: { preferred_path: 'C:\\Program Files ç\\maestri.exe', last_validated_at_ms: 9876 },
      omp: { preferred_path: 'C:\\Program Files ç\\omp.exe', last_validated_at_ms: 9876 },
      powershell: { preferred_path: 'C:\\Program Files ç\\pwsh.exe', last_validated_at_ms: 9876 },
    });
    expect(f.storage.getGitHubExecutablePath()).toBeNull();
    const replay = await putSettings(f, headers, command, expectedRevision, key);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json<SettingsSaved>().operation_id).toBe(body.operation_id);
  });

  it('reports validated local candidates separately from Maestri connection state', async () => {
    const toolDetector = createToolDetector({ platform: 'win32', environment: () => ({ PATH: 'C:\\Program Files ç\\Tools' }),
      stat: async () => ({ isFile: () => true }), access: async () => {}, run: async () => 'tool version 1.0' });
    const execution: NonNullable<ProjectDependencies['execution']> = {
      getCatalog: vi.fn(async () => structuredClone(profileCatalog)),
      preflight: vi.fn(async () => ({ ready: false, code: 'CONTEXT_MISSING' as const, ompVersion: null })),
    };
    const f = fixture(false, { toolDetector }, execution); const headers = await session(f);

    const response = await f.app.inject({ url: '/api/v1/settings/tool-options', headers });

    expect(response.statusCode).toBe(200);
    const body = response.json<ToolOptions>();
    for (const tool of ['git', 'maestri', 'omp', 'gh'] as const) {
      expect(body.tools[tool].state).toBe('available');
      expect(body.tools[tool].candidates[0]?.path).toContain('Program Files ç');
      expect(body.tools[tool].candidates[0]?.version).toBe('tool version 1.0');
    }
    expect(body.tools.powershell.state).toBe('ambiguous');
    expect(body.tools.powershell.candidates).toHaveLength(2);
    expect(body.maestri_connection).toEqual({ state: 'unavailable', diagnostic: 'CONTEXT_MISSING' });
  });

  it('reports unavailable and cancelled selections without changing the saved root', async () => {
    const unavailable = fixture(); const unavailableHeaders = await session(unavailable);
    const missing = await selectSetting(unavailable, unavailableHeaders, { kind: 'projects_root' });
    expect(missing.statusCode).toBe(200);
    expect(missing.json()).toMatchObject({ state: 'unavailable', kind: 'projects_root', diagnostic: 'NATIVE_SELECTION_UNAVAILABLE' });

    const selectProjectsDirectory = vi.fn(async () => null);
    const f = fixture(false, { selectProjectsDirectory }); const headers = await session(f);
    const before = f.storage.getGlobalConfiguration();
    const cancelled = await selectSetting(f, headers, { kind: 'projects_root' });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toEqual({ state: 'cancelled', kind: 'projects_root' });
    expect(f.storage.getGlobalConfiguration()).toEqual(before);
  });

  it('rejects a selected root replaced by a junction or symlink before save writes into its target', async () => {
    let selectedDirectory = '';
    const selectProjectsDirectory = vi.fn(async () => selectedDirectory);
    const f = fixture(false, { selectProjectsDirectory }); const headers = await session(f);
    selectedDirectory = join(f.directory, 'raiz escolhida á'); const outside = join(f.directory, 'fora da raiz');
    const previousRoot = join(f.directory, 'raiz anterior'); mkdirSync(previousRoot); mkdirSync(selectedDirectory); mkdirSync(outside);
    expect((await putSettings(f, headers, { changes: { projects_root: previousRoot } })).statusCode).toBe(200);
    const previousConfirmation = f.db.prepare('SELECT projects_root_confirmed_at_ms FROM factory_settings').get();
    const selection = await selectSetting(f, headers, { kind: 'projects_root' });
    expect(selection.json()).toMatchObject({ state: 'selected', path: selectedDirectory });
    vi.mocked(directoryFs.realpath).mockImplementation(async path => String(path) === selectedDirectory ? outside : String(path));
    const saved = await putSettings(f, headers, { changes: { projects_root: selectedDirectory } });
    expect(saved.statusCode).toBe(400);
    expect(f.storage.getSettings().projects_root).toBe(previousRoot);
    expect(f.db.prepare('SELECT projects_root_confirmed_at_ms FROM factory_settings').get()).toEqual(previousConfirmation);
    expect(await directoryFs.readdir(outside)).toEqual([]);
  });

  it('opens only one selector across kinds and sessions while the first native window is unresolved', async () => {
    let completeSelection: ((value: string | null) => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const selectProjectsDirectory = vi.fn(() => new Promise<string | null>((resolve) => { completeSelection = resolve; markStarted?.(); }));
    const f = fixture(false, { selectProjectsDirectory }); const firstHeaders = await session(f); const secondHeaders = await session(f);
    const first = selectSetting(f, firstHeaders, { kind: 'projects_root' });
    await started;
    const second = await selectSetting(f, secondHeaders, { kind: 'gh_executable' });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: 'NATIVE_SELECTION_IN_PROGRESS', message: 'Já existe uma seleção em andamento. Conclua ou cancele a janela aberta e tente novamente.' });
    expect(selectProjectsDirectory).toHaveBeenCalledTimes(1);
    completeSelection?.(null);
    expect((await first).json()).toMatchObject({ state: 'cancelled' });
  });

  it('removes the handler deadline only from native selection', async () => {
    const f = fixture(false, { selectProjectsDirectory: async () => null });
    const limits = new Map<string, number>();
    f.app.addHook('onRequest', async (request) => {
      limits.set(request.routeOptions.url ?? '', request.routeOptions.handlerTimeout);
    });
    const headers = await session(f);
    const response = await f.app.inject({ method: 'POST', url: '/api/v1/settings/selections', headers, payload: { kind: 'projects_root' } });
    expect(response.statusCode).toBe(200);
    expect(limits.get('/api/v1/settings/selections')).toBe(0);
    expect(limits.get('/api/v1/session')).toBe(15_000);
  });

  it('keeps the picker open without a deadline and preserves exclusivity until user cancellation', async () => {
    let completeSelection: ((value: string | null) => void) | undefined;
    let receivedSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const selectProjectsDirectory = vi.fn((signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise<string | null>((resolve) => { completeSelection = resolve; markStarted?.(); });
    });
    const f = fixture(false, { selectProjectsDirectory });
    const selections = createProjects({ storage: f.storage, github: f.github, workspaces: { inspectOrigin: f.inspectOrigin }, directoryBase: f.directory, selectProjectsDirectory });
    vi.useFakeTimers();
    try {
      const first = selections.selectSetting({ kind: 'projects_root' });
      await started;
      await vi.advanceTimersByTimeAsync(600_000);
      expect(receivedSignal?.aborted).toBe(false);
      await expect(selections.selectSetting({ kind: 'gh_executable' })).rejects.toMatchObject({ statusCode: 409, code: 'NATIVE_SELECTION_IN_PROGRESS' });
      completeSelection?.(null);
      expect(await first).toMatchObject({ state: 'cancelled', kind: 'projects_root' });
      expect(f.storage.getSettings().projects_root).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('requests native closure on client cancellation and ignores the late path', async () => {
    let completeSelection: ((value: string | null) => void) | undefined;
    let receivedSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const selectProjectsDirectory = vi.fn((signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise<string | null>((resolve) => { completeSelection = resolve; markStarted?.(); });
    });
    const f = fixture(false, { selectProjectsDirectory });
    const selections = createProjects({ storage: f.storage, github: f.github, workspaces: { inspectOrigin: f.inspectOrigin }, directoryBase: f.directory, selectProjectsDirectory });
    const client = new AbortController();
    const pending = selections.selectSetting({ kind: 'projects_root' }, client.signal);
    await started;
    client.abort();
    expect(receivedSignal?.aborted).toBe(true);
    await expect(selections.selectSetting({ kind: 'gh_executable' })).rejects.toMatchObject({ statusCode: 409, code: 'NATIVE_SELECTION_CANCELLED' });
    completeSelection?.(f.directory);
    expect(await pending).toMatchObject({ state: 'unavailable', kind: 'projects_root', diagnostic: 'NATIVE_SELECTION_CANCELLED' });
    expect(f.storage.getSettings().projects_root).toBeNull();
  });

  it('persists validated directories and separate time and artifact choices', async () => {
    const f = fixture(); const headers = await session(f);
    // This sandbox denies realpath even for the workspace. Only canonicalization is controlled;
    // stat/access still inspect the actual authorized directory. Production retains realpath.
    const selectedDirectory = process.cwd();
    vi.mocked(directoryFs.realpath).mockResolvedValueOnce(selectedDirectory);
    const r = await putSettings(f, headers, { changes: { projects_root: selectedDirectory,
      time_defaults: { question_ttl: { state: 'configured', value: 0, unit: 'ms' } },
      artifact_policy: { automatic_deletion: false } } });
    expect(r.statusCode, r.body).toBe(200); const view = r.json<SettingsView>();
    expect(view.settings.projects_root?.toLowerCase()).toBe(selectedDirectory.toLowerCase());
    expect(view.settings.time_defaults.question_ttl).toEqual({ state: 'configured', value: 0, unit: 'ms' });
    expect(view.settings).not.toHaveProperty('costDefaults'); expect(view.settings.artifact_policy.automatic_deletion).toBe(false);
    expect(f.db.prepare('SELECT projects_root_confirmed_at_ms FROM factory_settings').get()).toMatchObject({ projects_root_confirmed_at_ms: expect.any(Number) });
    expect((await putSettings(f, headers, { changes: { projects_root: null } })).statusCode).toBe(200);
    expect(f.db.prepare('SELECT projects_root_confirmed_at_ms FROM factory_settings').get()).toEqual({ projects_root_confirmed_at_ms: null });
  });

  it('changes only the future projects root and clears its confirmation when removed', async () => {
    const f = fixture(); const headers = await session(f);
    writeFileSync(join(f.directory, 'existing-project-data.txt'), 'preserve this project data');
    const projectId = (await register(f, headers)).json<ProjectDetail>().project.id;
    const projectBefore = f.storage.getConfiguration(projectId);
    const firstRoot = join(f.directory, 'root one'); const secondRoot = join(f.directory, 'root café two');
    mkdirSync(firstRoot); mkdirSync(secondRoot);
    expect((await putSettings(f, headers, { changes: { projects_root: firstRoot } })).statusCode).toBe(200);
    const firstConfirmation = f.db.prepare('SELECT projects_root_confirmed_at_ms FROM factory_settings').get() as { projects_root_confirmed_at_ms: number | null };
    expect(firstConfirmation.projects_root_confirmed_at_ms).not.toBeNull();
    expect((await putSettings(f, headers, { changes: { projects_root: secondRoot } })).statusCode).toBe(200);
    expect(f.storage.getSettings().projects_root).toBe(secondRoot);
    expect(f.db.prepare('SELECT projects_root_confirmed_at_ms FROM factory_settings').get()).toMatchObject({ projects_root_confirmed_at_ms: expect.any(Number) });
    const projectAfter = f.storage.getConfiguration(projectId);
    expect(projectAfter.view.configuration).toEqual(projectBefore.view.configuration);
    expect(projectAfter.view.configuration.source.location).toBe(f.directory);
    expect(readFileSync(join(f.directory, 'existing-project-data.txt'), 'utf8')).toBe('preserve this project data');
    expect((await putSettings(f, headers, { changes: { projects_root: null } })).statusCode).toBe(200);
    expect(f.db.prepare('SELECT projects_root_confirmed_at_ms FROM factory_settings').get()).toEqual({ projects_root_confirmed_at_ms: null });
    expect(f.storage.getConfiguration(projectId).view.configuration).toEqual(projectBefore.view.configuration);
  });
  it.each(['missing-directory', '\\\\server\\share', 'https://example.com', 'invalid\u0000directory'])('rejects unavailable or nonlocal directory %s without partial save', async (projectsRoot) => {
    const f = fixture(); const headers = await session(f); const before = f.storage.getGlobalConfiguration();
    const r = await putSettings(f, headers, { changes: { time_defaults: { polling_interval_ms: 23000 }, projects_root: projectsRoot }, profile_changes: [profile] });
    expect(r.statusCode).toBe(400); expect(f.storage.getGlobalConfiguration()).toEqual(before);
  });
  it('rechecks composite revisions after asynchronous mapping validation and refuses all requested writes', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id); const key = randomUUID();
    vi.mocked(f.github.validateProjectSelection).mockImplementation(async () => {
      f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: f.storage.getGlobalConfiguration().etag, body: { changes: {}, profile_changes: profileCommands([profile]) }, changes: {} });
      return complete(structuredClone(projectDetails));
    });
    const r = await putConfiguration(f, headers, id, { project_changes: { github_project: mapping, correction_limit: 4 }, global_changes: { time_defaults: { polling_interval_ms: 24000 } } }, before.etag, key);
    expect(r.statusCode).toBe(412); expect(f.storage.getConfiguration(id).view.configuration).toEqual(before.view.configuration);
    expect(f.storage.getSettings().time_defaults).toEqual(before.view.settings.time_defaults); expect(f.storage.getOperation(key)).toBeNull();
    expect(f.storage.getGlobalConfiguration().view.profiles).toHaveLength(1);
  });
  it('keeps the confirmed repository when a changed Pasta do projeto is not a clone of it', async () => {
    const f = fixture(); const headers = await session(f);
    f.inspection.remote = { name: 'origin', url: 'https://github.com/test-org/repository', confirmed: true, branch: null, repository: { id: 'REPOSITORY_test', name: 'repository', owner: { id: 'OWNER_test', login: 'test-org' }, url: 'https://github.com/test-org/repository', defaultBranch: 'main', isPrivate: true, isArchived: false } };
    const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    expect(f.storage.getConfiguration(id).view.configuration.source.repository_id).toBe('REPOSITORY_test');
    f.inspection.remote = null;
    const r = await putConfiguration(f, headers, id, { project_changes: { source: { kind: 'local', location: f.directory }, base_branch: 'release' } });
    expect(r.statusCode).toBe(409); expect(r.json<{ code: string }>().code).toBe('PROJECT_FOLDER_NOT_CLONE');
    expect(f.storage.getConfiguration(id).view.configuration.source.repository_id).toBe('REPOSITORY_test');
  });
  it('returns a sanitized unavailable response under a finite SQLite write lock', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id); const key = randomUUID();
    f.db.exec('BEGIN IMMEDIATE');
    try {
      const r = await putConfiguration(f, headers, id, { project_changes: { correction_limit: 0 }, global_changes: { time_defaults: { polling_interval_ms: 24000 } } }, before.etag, key);
      expect(r.statusCode).toBe(503); expect(r.body).not.toMatch(/sqlite|locked|must-not-save/i);
    } finally { f.db.exec('ROLLBACK'); }
    expect(f.storage.getConfiguration(id)).toEqual(before); expect(f.storage.getOperation(key)).toBeNull();
    expect((await putConfiguration(f, headers, id, { project_changes: { correction_limit: 0 } })).statusCode).toBe(200);
  });
  it('rejects secret-shaped Maestri settings and credential-bearing origin URLs without retaining the input', async () => {
    const f = fixture(true); const headers = await session(f); const marker = 'SYNTHETIC_SECRET_CREDENTIAL';
    const settings = await f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'if-match': f.storage.getGlobalConfiguration().etag, 'idempotency-key': randomUUID() }, payload: { changes: { maestriSettings: { token: marker } } } });
    expect(settings.statusCode).toBe(400); expect(settings.body).not.toContain(marker);
    const registration = await f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { name: 'Test', source: { kind: 'github', location: `https://${marker}@github.com/test-org/repository` }, base_branch: 'main' } });
    expect(registration.statusCode).toBe(400); expect(registration.body).not.toContain(marker);
    expect(f.storage.getEvents({}).items).toEqual([]); expect(f.storage.listProjects({}).items).toEqual([]);
    expect(JSON.stringify(f.storage.getGlobalConfiguration())).not.toContain(marker);
  });
  it('enforces explicit aggregate changes in the public storage contract as well as HTTP', async () => {
    const f = fixture(); const headers = await session(f); const id = (await register(f, headers)).json<ProjectDetail>().project.id;
    const before = f.storage.getConfiguration(id);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = before.view.configuration;
    const context = { operationId: randomUUID(), expectedRevision: before.etag, projectId: id, body: { project_changes: { correction_limit: 4 } } };
    expect(() => f.storage.saveConfiguration({ ...context, configuration: { ...configuration, correction_limit: 4 }, globalChanges: { time_defaults: { polling_interval_ms: 25000 } } })).toThrowError(expect.objectContaining({ code: 'UNREQUESTED_GLOBAL_CHANGE' }));
    expect(() => f.storage.saveConfiguration({ ...context, configuration: { ...configuration, correction_limit: 4, guidance: 'unrequested' }, globalChanges: {} })).toThrowError(expect.objectContaining({ code: 'UNREQUESTED_PROJECT_CHANGE' }));
    expect(f.storage.getConfiguration(id)).toEqual(before);
  });

  it('excludes disabled incomplete projects globally but reports their prerequisites in a scoped observation', async () => {
    const f = fixture(); const headers = await session(f); const projectId = (await register(f, headers)).json<ProjectDetail>().project.id;
    const response = await f.app.inject({ method: 'GET', url: '/api/v1/queue?limit=25', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ complete: true, valid: false, eligible_total: 0, page: { items: [], has_more: false } });
    expect(response.json().diagnostics).not.toContainEqual(expect.objectContaining({ code: 'PROJECT_NOT_READY' }));
    const scoped = await f.app.inject({ method: 'GET', url: `/api/v1/queue?project_id=${projectId}`, headers });
    expect(scoped.json()).toMatchObject({ complete: false, valid: false, eligible_total: null, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'PROJECT_REQUIRED' })]) });
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
      enabled: false, scope: { kind: 'account', project_ids: [projectId] },
    } });
    expect(paused.statusCode).toBe(200);
    expect(paused.json()).toMatchObject({ operation_id: operationId, queue: { enabled: false, complete: true }, receipt: { revision: expect.any(Number), event_cursor: expect.any(String) } });
    expect(f.storage.getGlobalConfiguration().view.settings.automation_enabled).toBe(false);
  });

  it('projects live issues, excludes drafts and pull requests, and pages candidates without turning multiples into assignments', async () => {
    const f = fixture(); const headers = await session(f); const projectId = (await register(f, headers)).json<ProjectDetail>().project.id;
    f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('ACCOUNT_test', 'test-user', Date.now(), Date.now(), Date.now());
    f.db.prepare('UPDATE factory_settings SET account_id=?,designated_host=?,revision=revision+1').run('ACCOUNT_test', hostname());
    const current = f.storage.getConfiguration(projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...currentConfiguration } = current.view.configuration;
    const configuration = { ...currentConfiguration, source: { kind: 'local' as const, location: f.directory, repository_id: 'REPO_test', repository_url: 'https://github.com/test-org/repo' }, github_project: mapping, automation_enabled: true };
    f.storage.saveConfiguration({ operationId: randomUUID(), projectId, expectedRevision: current.etag,
      body: { project_changes: { source: { kind: 'local', location: f.directory }, github_project: mapping, automation_enabled: true } }, configuration, globalChanges: {} });
    vi.mocked(f.inspectOrigin).mockResolvedValue({ state: 'identified', source: { kind: 'local', location: f.directory },
      local: { root: f.directory, headSha: 'a'.repeat(40), dirty: false }, base: { branch: 'main', sha: 'a'.repeat(40), observedFrom: 'local' },
      remote: { name: 'origin', url: 'https://github.com/test-org/repo', confirmed: true,
        repository: { id: 'REPO_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repo', url: 'https://github.com/test-org/repo', defaultBranch: 'main', isArchived: false, isPrivate: true },
        branch: { repositoryId: 'REPO_test', name: 'main', sha: 'a'.repeat(40) } },
      diagnostics: [], githubDiagnostics: [], retryAtMs: null, executionReady: false });
    const projectItems: ProjectItem[] = [
      { id: 'ITEM_1', archived: false, kind: 'issue', contentId: 'ISSUE_1', title: 'Eligible issue', url: 'https://github.com/test-org/repo/issues/1', executable: true },
      { id: 'ITEM_2', archived: false, kind: 'issue', contentId: 'ISSUE_2', title: 'Multiple assignees', url: 'https://github.com/test-org/repo/issues/2', executable: true },
      { id: 'ITEM_3', archived: false, kind: 'draft', contentId: 'DRAFT_3', title: 'Draft issue', url: null, executable: false },
      { id: 'ITEM_4', archived: false, kind: 'pull_request', contentId: 'PR_4', title: 'Pull request card', url: 'https://github.com/test-org/repo/pull/4', executable: false },
    ];
    const issue = (id: string, number: number, assignees: IssueContext['assignees']): IssueContext => ({ id, number, url: `https://github.com/test-org/repo/issues/${number}`, title: projectItems[number - 1]?.title ?? 'Issue', body: '## What to build\nPreserve the queue.\n## Acceptance criteria\n- [ ] Keep queue state durable', state: 'OPEN',
      repository: { id: 'REPO_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repo', url: 'https://github.com/test-org/repo', defaultBranch: 'main', isArchived: false, isPrivate: true },
      assignees, comments: [], blockers: [], memberships: [{ itemId: `ITEM_${number}`, projectId: mapping.id, archived: false, statusValues: [{ fieldId: mapping.status_field_id, optionId: mapping.status_option_ids.ready, name: 'Ready' }] }], references: [] });
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
    expect(first.json()).toMatchObject({ complete: true, valid: true, eligible_total: 1, page: { items: expect.arrayContaining([
      expect.objectContaining({ issue_id: 'ISSUE_1', eligible: true, ready: true, assignees: [{ id: 'ACCOUNT_test', login: 'test-user' }] }),
      expect.objectContaining({ issue_id: 'ISSUE_2', eligible: false, reasons: expect.arrayContaining(['ASSIGNEE_MISMATCH']) }),
    ]), has_more: true } });
    const cursor = first.json().page.next_cursor as string;
    const second = await f.app.inject({ method: 'GET', url: `/api/v1/queue?limit=2&cursor=${encodeURIComponent(cursor)}`, headers });
    expect(second.statusCode).toBe(200);
    expect(second.json().page.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'draft', eligible: false, reasons: expect.arrayContaining(['DRAFT_ITEM']) }),
      expect.objectContaining({ kind: 'pull_request', eligible: false, reasons: expect.arrayContaining(['PULL_REQUEST']) }),
    ]));
  });
});

describe('OMP execution catalog observation', () => {
  it('returns a fresh exact catalog through the protected settings route without persisting it', async () => {
    const catalog: ExecutionCatalog = { state: 'loaded', executor: 'maestri-omp', executor_version: '19.0.0-beta.1', observed_at_ms: 10,
      models: [
        { provider: 'provider-a', provider_name: 'provider-a', model: 'reasoning', model_name: 'Reasoning', efforts: ['low', 'high'] },
        { provider: 'provider-b', provider_name: 'provider-b', model: 'plain', model_name: 'Plain', efforts: [] },
      ] };
    const execution: NonNullable<ProjectDependencies['execution']> = { getCatalog: vi.fn(async () => structuredClone(catalog)) };
    const f = fixture(false, {}, execution); const headers = await session(f);
    const dataVersion = f.db.pragma('data_version', { simple: true });
    const first = await f.app.inject({ url: '/api/v1/settings/execution-options', headers });
    const second = await f.app.inject({ url: '/api/v1/settings/execution-options', headers });
    expect(first.statusCode).toBe(200); expect(second.statusCode).toBe(200);
    expect(Value.Check(ExecutionCatalog, first.json())).toBe(true);
    expect(first.json()).toEqual(catalog); expect(second.json()).toEqual(catalog);
    expect(execution.getCatalog).toHaveBeenCalledTimes(2);
    expect(f.db.pragma('data_version', { simple: true })).toBe(dataVersion);
    expect(f.storage.getGlobalConfiguration().view.profiles).toEqual([]);
    expect((await f.app.inject({ url: '/api/v1/settings/execution-options?provider=provider-a', headers })).statusCode).toBe(400);
    expect(execution.getCatalog).toHaveBeenCalledTimes(2);
  });

  it('reports missing or failed execution context as unavailable without exposing runtime errors', async () => {
    const absent = fixture(false, {}, null); const absentHeaders = await session(absent);
    const unavailable = await absent.app.inject({ url: '/api/v1/settings/execution-options', headers: absentHeaders });
    expect(unavailable.statusCode).toBe(200);
    expect(unavailable.json<ExecutionCatalog>()).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'EXECUTION_UNAVAILABLE' }] });

    const execution: NonNullable<ProjectDependencies['execution']> = { getCatalog: vi.fn(async () => { throw new Error('private runtime output'); }) };
    const failed = fixture(false, {}, execution); const failedHeaders = await session(failed);
    const response = await failed.app.inject({ url: '/api/v1/settings/execution-options', headers: failedHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json<ExecutionCatalog>()).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'OMP_CATALOG_UNAVAILABLE' }] });
    expect(response.body).not.toContain('private runtime output');
  });

  it('creates typed profiles from exact catalog choices, defaults omitted guidance, and returns live counts', async () => {
    const f = fixture(); const headers = await session(f);
    const response = await putSettings(f, headers, { changes: {}, profile_changes: [{ action: 'create', profile: {
      name: 'Plain reviewer', profile_type: 'reviewer', executor: 'maestri-omp', provider: 'provider-exact', model: 'plain-model', effort: null,
    } }] });
    expect(response.statusCode).toBe(200);
    const saved = response.json<SettingsSaved>();
    expect(saved.profiles[0]).toMatchObject({ name: 'Plain reviewer', profile_type: 'reviewer', guidance: '', effort: null });
    expect(saved.profile_counts).toEqual({ all: 1, implementer: 0, reviewer: 1 });
    expect(saved.profiles[0]).not.toHaveProperty('name_key');
    expect(saved.profiles[0]).not.toHaveProperty('deleted_at_ms');
    if (!f.execution) throw new Error('EXECUTION_FIXTURE_MISSING');
    expect(vi.mocked(f.execution.getCatalog)).toHaveBeenCalledTimes(1);
  });

  it('allows name and guidance patches while the catalog is unavailable, but blocks choice edits', async () => {
    const f = fixture(); const headers = await session(f);
    expect((await putSettings(f, headers, { changes: {}, profile_changes: [profile] })).statusCode).toBe(200);
    const saved = f.storage.getGlobalConfiguration().view.profiles[0];
    if (!saved) throw new Error('PROFILE_NOT_FOUND');
    if (!f.execution) throw new Error('EXECUTION_FIXTURE_MISSING');
    const calls = vi.mocked(f.execution.getCatalog).mock.calls.length;
    vi.mocked(f.execution.getCatalog).mockResolvedValue({ state: 'unavailable', observed_at_ms: 1,
      diagnostics: [{ code: 'OMP_OFFLINE', message: 'Catalog unavailable.', recovery: 'Restore OMP and retry.' }] });
    const before = f.storage.getGlobalConfiguration();
    const rename: ProfileChanges = [{ action: 'update', id: saved.id, changes: { name: 'Renamed profile', guidance: 'Keep the current model.' } }];
    const accepted = await putSettings(f, headers, { changes: {}, profile_changes: rename }, before.etag);
    expect(accepted.statusCode).toBe(200);
    expect(vi.mocked(f.execution.getCatalog)).toHaveBeenCalledTimes(calls);
    const afterRename = f.storage.getGlobalConfiguration();
    expect(afterRename.view.profiles[0]).toMatchObject({ name: 'Renamed profile', provider: saved.provider, model: saved.model, effort: saved.effort, guidance: 'Keep the current model.' });
    const attemptedChange: ProfileChanges = [{ action: 'update', id: saved.id, changes: { model: 'replacement-model' } }];
    const rejected = await putSettings(f, headers, { changes: {}, profile_changes: attemptedChange }, afterRename.etag);
    expect(rejected.statusCode).toBe(503);
    expect(rejected.body).not.toContain('Catalog unavailable.');
    expect(f.storage.getGlobalConfiguration()).toEqual(afterRename);
  });

  it('preserves a saved combination absent from a loaded catalog on a name patch', async () => {
    const f = fixture(); const headers = await session(f);
    expect((await putSettings(f, headers, { changes: {}, profile_changes: [profile] })).statusCode).toBe(200);
    const saved = f.storage.getGlobalConfiguration().view.profiles[0];
    if (!saved || !f.execution) throw new Error('PROFILE_FIXTURE_MISSING');
    vi.mocked(f.execution.getCatalog).mockResolvedValue({ state: 'loaded', executor: 'maestri-omp', executor_version: 'fixture-2', observed_at_ms: 2,
      models: [{ provider: 'different-provider', provider_name: 'different-provider', model: 'available-only', model_name: 'Available', efforts: ['medium'] }] });
    const response = await putSettings(f, headers, { changes: {}, profile_changes: [{ action: 'update', id: saved.id, changes: { name: 'Preserved absent model' } }] });
    expect(response.statusCode).toBe(200);
    expect(f.storage.getGlobalConfiguration().view.profiles[0]).toMatchObject({ name: 'Preserved absent model', provider: saved.provider, model: saved.model, effort: saved.effort });
  });

  it('rejects invalid catalog combinations and old replacement-list requests without writes', async () => {
    const f = fixture(); const headers = await session(f); const before = f.storage.getGlobalConfiguration();
    const invalid: ProfileChanges = [{ action: 'create', profile: { name: 'Invalid effort', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider-exact', model: 'plain-model', effort: 'high', guidance: '' } }];
    expect((await putSettings(f, headers, { changes: {}, profile_changes: invalid })).statusCode).toBe(400);
    const legacy = await f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'if-match': before.etag, 'idempotency-key': randomUUID() },
      payload: { changes: {}, profile_changes: [{ name: 'Legacy form', executor: 'maestri-omp', provider: 'provider-exact', model: 'model-exact-v2', effort: 'custom-effort', guidance: '' }] } });
    expect(legacy.statusCode).toBe(400);
    expect(f.storage.getGlobalConfiguration()).toEqual(before);
    expect(f.storage.getEvents({}).items).toEqual([]);
  });

  it('serializes equivalent live names under concurrent creates and preserves accents and internal spaces', async () => {
    const f = fixture(); const headers = await session(f); const etag = f.storage.getGlobalConfiguration().etag;
    const create = (name: string): ProfileChanges => [{ action: 'create', profile: { name, profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider-exact', model: 'model-exact-v2', effort: 'custom-effort', guidance: '' } }];
    const [first, second] = await Promise.all([
      putSettings(f, headers, { changes: {}, profile_changes: create(' Perfil A ') }, etag, randomUUID()),
      putSettings(f, headers, { changes: {}, profile_changes: create('perfil a') }, etag, randomUUID()),
    ]);
    expect([first.statusCode, second.statusCode].filter((status) => status === 200)).toHaveLength(1);
    expect([first.statusCode, second.statusCode].every((status) => status === 200 || status === 409 || status === 412)).toBe(true);
    const afterConcurrent = f.storage.getGlobalConfiguration();
    expect(afterConcurrent.view.profiles).toHaveLength(1);
    const createAccent = await putSettings(f, headers, { changes: {}, profile_changes: create('Revisão  avançada') }, afterConcurrent.etag);
    expect(createAccent.statusCode).toBe(200);
    const afterAccent = f.storage.getGlobalConfiguration();
    const createWithoutAccent = await putSettings(f, headers, { changes: {}, profile_changes: create('revisao  avancada') }, afterAccent.etag);
    expect(createWithoutAccent.statusCode).toBe(200);
    expect(f.storage.getGlobalConfiguration().view.profiles.map((item) => item.name)).toEqual(expect.arrayContaining(['Revisão  avançada', 'revisao  avancada']));
  });

  it('blocks profile type changes and deletion while a current project default still references the profile', async () => {
    const f = fixture(); const headers = await session(f); expect((await putSettings(f, headers, { changes: {}, profile_changes: [profile] })).statusCode).toBe(200);
    const saved = f.storage.getGlobalConfiguration(); const profileId = saved.view.profiles[0]?.id;
    if (!profileId) throw new Error('PROFILE_NOT_FOUND');
    const projectId = (await register(f, headers)).json<ProjectDetail>().project.id;
    const unconfigured = f.storage.getConfiguration(projectId);
    const assigned = await putConfiguration(f, headers, projectId, { project_changes: { implementer_profile_id: profileId } }, unconfigured.etag);
    expect(assigned.statusCode).toBe(200);

    const currentSettings = f.storage.getGlobalConfiguration();
    const typeChange: ProfileChanges = [{ action: 'update', id: profileId, changes: { profile_type: 'reviewer' } }];
    const typeResponse = await putSettings(f, headers, { changes: {}, profile_changes: typeChange }, currentSettings.etag);
    expect(typeResponse.statusCode).toBe(409);
    expect(typeResponse.json()).toMatchObject({ code: 'PROFILE_TYPE_CHANGE_BLOCKED', facts: { blocking_project_ids: projectId } });
    const afterTypeRejection = f.storage.getGlobalConfiguration();
    const deletion = await putSettings(f, headers, { changes: {}, profile_changes: [{ action: 'delete', id: profileId }] }, afterTypeRejection.etag);
    expect(deletion.statusCode).toBe(409);
    expect(deletion.json()).toMatchObject({ code: 'PROFILE_DELETE_BLOCKED', facts: { blocking_project_ids: projectId } });
    const project = f.storage.getConfiguration(projectId);
    const beforeAggregateRejection = f.storage.getGlobalConfiguration();
    const aggregateDelete = await putConfiguration(f, headers, projectId, { project_changes: { correction_limit: 3 }, profile_changes: [{ action: 'delete', id: profileId }] }, project.etag);
    expect(aggregateDelete.statusCode).toBe(409);
    expect(f.storage.getConfiguration(projectId)).toEqual(project);
    expect(f.storage.getGlobalConfiguration()).toEqual(beforeAggregateRejection);
  });
});

describe('onboarding facts and durable completion', () => {
  function observeEligibleAccount(f: Fixture): void {
    vi.mocked(f.githubSetup.resolveExecutable).mockResolvedValue({ state: 'observed', path: 'C:\\Tools\\GitHub CLI\\gh.exe', version: '2.70.0', diagnostics: [] });
    vi.mocked(f.githubSetup.getAuthenticationAccounts).mockResolvedValue({ state: 'observed', diagnostics: [],
      accounts: [{ login: 'test-user', active: true, valid: true }] });
  }

  async function prepareCompletion(f: Fixture, headers: Record<string, string>): Promise<void> {
    observeEligibleAccount(f);
    const binding = await putSettings(f, headers, { changes: {}, account_binding: { action: 'bind', account_id: 'ACCOUNT_test' } });
    expect(binding.statusCode).toBe(200);
    expect(f.storage.getGlobalConfiguration().view.onboarding.first_incomplete_step).toBe('projects_root');
    const directory = await putSettings(f, headers, { changes: { projects_root: f.directory } });
    expect(directory.statusCode).toBe(200);
    expect(f.storage.getGlobalConfiguration().view.onboarding.first_incomplete_step).toBe('profiles');
    const reviewer: ExecutionProfile = { ...profile, name: 'Test exact reviewer', profile_type: 'reviewer' };
    const profiles = await putSettings(f, headers, { changes: {}, profile_changes: [profile, reviewer] });
    expect(profiles.statusCode).toBe(200);
    expect(f.storage.getGlobalConfiguration().view).toMatchObject({
      profile_counts: { all: 2, implementer: 1, reviewer: 1 }, onboarding: { first_incomplete_step: null },
    });
    expect(f.storage.getGlobalConfiguration().view.onboarding.prerequisites).toEqual([]);
  }

  it('derives the first incomplete step and host selection capabilities without GitHub or OMP reads', async () => {
    const selectProjectsDirectory = vi.fn(async () => null);
    const selectGitHubExecutable = vi.fn(async () => null);
    const f = fixture(false, { selectProjectsDirectory, selectGitHubExecutable }); const headers = await session(f);
    const before = f.db.pragma('data_version', { simple: true });
    const response = await f.app.inject({ url: '/api/v1/settings', headers });
    expect(response.statusCode).toBe(200);
    expect(Value.Check(SettingsView, response.json())).toBe(true);
    expect(response.json<SettingsView>()).toMatchObject({
      profile_counts: { all: 0, implementer: 0, reviewer: 0 },
      onboarding: { suppressed: false, completed_at_ms: null, first_incomplete_step: 'github' },
      selection_capabilities: { projects_root: { available: true }, gh_executable: { available: true } },
      event_cursor: expect.any(String),
    });
    expect(response.json<SettingsView>().onboarding.prerequisites.map(({ code }) => code)).toEqual([
      'ACCOUNT_UNOBSERVED', 'PROJECTS_ROOT_REQUIRED', 'IMPLEMENTER_PROFILE_REQUIRED', 'REVIEWER_PROFILE_REQUIRED',
    ]);
    expect(f.github.getIdentity).not.toHaveBeenCalled();
    expect(f.githubSetup.resolveExecutable).not.toHaveBeenCalled();
    expect(f.githubSetup.getAuthenticationAccounts).not.toHaveBeenCalled();
    expect(f.execution?.getCatalog).not.toHaveBeenCalled();
    expect(f.db.pragma('data_version', { simple: true })).toBe(before);

    const project = await register(f, headers);
    const projectId = project.json<ProjectDetail>().project.id;
    const configuration = await f.app.inject({ url: `/api/v1/projects/${projectId}/configuration`, headers });
    expect(configuration.statusCode).toBe(200);
    expect(Value.Check(ConfigurationView, configuration.json())).toBe(true);
    expect(configuration.json<ConfigurationView>()).toMatchObject({ onboarding: { first_incomplete_step: 'github' },
      selection_capabilities: { projects_root: { available: true }, gh_executable: { available: true } } });
  });

  it('persists suppression independently and rejects client supplied completion facts', async () => {
    const f = fixture(); const headers = await session(f);
    const suppressed = await putSettings(f, headers, { changes: {}, onboarding_changes: { suppressed: true } });
    expect(suppressed.statusCode).toBe(200);
    expect(suppressed.json<SettingsSaved>().onboarding).toMatchObject({ suppressed: true, completed_at_ms: null, first_incomplete_step: 'github' });
    expect(suppressed.json<SettingsSaved>().onboarding.prerequisites.map(({ code }) => code)).toEqual([
      'ACCOUNT_UNOBSERVED', 'PROJECTS_ROOT_REQUIRED', 'IMPLEMENTER_PROFILE_REQUIRED', 'REVIEWER_PROFILE_REQUIRED',
    ]);
    const operationCount = f.db.prepare('SELECT count(*) AS count FROM operation_requests').get() as { count: number };
    const eventCount = f.db.prepare('SELECT count(*) AS count FROM events').get() as { count: number };
    for (const onboarding_changes of [
      { completed_at_ms: 0 }, { first_incomplete_step: 'profiles' }, { ready: true }, { complete: false }, {},
    ]) {
      const invalid = await f.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers,
        'if-match': f.storage.getGlobalConfiguration().etag, 'idempotency-key': randomUUID() }, payload: { changes: {}, onboarding_changes } });
      expect(invalid.statusCode).toBe(400);
    }
    expect(f.db.prepare('SELECT count(*) AS count FROM operation_requests').get()).toEqual(operationCount);
    expect(f.db.prepare('SELECT count(*) AS count FROM events').get()).toEqual(eventCount);
    const reopenedView = await f.app.inject({ url: '/api/v1/settings', headers });
    expect(reopenedView.json<SettingsView>().onboarding).toMatchObject({ suppressed: true, completed_at_ms: null, first_incomplete_step: 'github' });
  });

  it('revalidates account and writable root, completes atomically, and recovers the original receipt without another validation', async () => {
    const f = fixture(); const headers = await session(f); await prepareCompletion(f, headers);
    if (!f.execution) throw new Error('EXECUTION_FIXTURE_INCOMPLETE');
    const catalogCalls = vi.mocked(f.execution.getCatalog).mock.calls.length;
    vi.mocked(f.execution.getCatalog).mockResolvedValue({ state: 'unavailable', observed_at_ms: 50,
      diagnostics: [{ code: 'OMP_OFFLINE', message: 'Unavailable after profile save.', recovery: 'Retry catalog observation.' }] });
    const before = {
      projects: (f.db.prepare('SELECT count(*) AS count FROM projects').get() as { count: number }).count,
      projectCreations: (f.db.prepare('SELECT count(*) AS count FROM project_creations').get() as { count: number }).count,
      attempts: (f.db.prepare('SELECT count(*) AS count FROM attempts').get() as { count: number }).count,
      queueConsumptions: (f.db.prepare('SELECT count(*) AS count FROM queue_consumptions').get() as { count: number }).count,
      passages: (f.db.prepare('SELECT count(*) AS count FROM passages').get() as { count: number }).count,
      resources: (f.db.prepare('SELECT count(*) AS count FROM resources').get() as { count: number }).count,
      publicationRequests: (f.db.prepare('SELECT count(*) AS count FROM publication_requests').get() as { count: number }).count,
      publicationUpgrades: (f.db.prepare('SELECT count(*) AS count FROM publication_upgrades').get() as { count: number }).count,
      effects: (f.db.prepare('SELECT count(*) AS count FROM effects').get() as { count: number }).count,
      operations: (f.db.prepare('SELECT count(*) AS count FROM operation_requests').get() as { count: number }).count,
      automationEnabled: f.storage.getSettings().automation_enabled,
    };
    expect(before).toMatchObject({ projects: 0, projectCreations: 0, attempts: 0, queueConsumptions: 0,
      passages: 0, resources: 0, publicationRequests: 0, publicationUpgrades: 0, effects: 0, automationEnabled: false });
    const etag = f.storage.getGlobalConfiguration().etag;
    const key = randomUUID(); const command: SettingsUpdate = { changes: {}, onboarding_changes: { complete: true } };
    const completed = await putSettings(f, headers, command, etag, key);
    expect(completed.statusCode).toBe(200);
    expect(Value.Check(SettingsSaved, completed.json())).toBe(true);
    const saved = completed.json<SettingsSaved>();
    expect(saved.onboarding).toMatchObject({ suppressed: false, first_incomplete_step: null, completed_at_ms: expect.any(Number), prerequisites: [] });
    expect(saved.operation_id).toBe(key);
    expect(f.execution.getCatalog).toHaveBeenCalledTimes(catalogCalls);
    expect(f.githubSetup.getAuthenticationAccounts).toHaveBeenCalled();
    expect(f.github.getIdentity).toHaveBeenCalled();
    expect(f.storage.getSettings().automation_enabled).toBe(false);
    expect((f.db.prepare('SELECT count(*) AS count FROM projects').get() as { count: number }).count).toBe(before.projects);
    expect((f.db.prepare('SELECT count(*) AS count FROM project_creations').get() as { count: number }).count).toBe(before.projectCreations);
    expect((f.db.prepare('SELECT count(*) AS count FROM attempts').get() as { count: number }).count).toBe(before.attempts);
    expect((f.db.prepare('SELECT count(*) AS count FROM queue_consumptions').get() as { count: number }).count).toBe(before.queueConsumptions);
    expect((f.db.prepare('SELECT count(*) AS count FROM passages').get() as { count: number }).count).toBe(before.passages);
    expect((f.db.prepare('SELECT count(*) AS count FROM resources').get() as { count: number }).count).toBe(before.resources);
    expect((f.db.prepare('SELECT count(*) AS count FROM publication_requests').get() as { count: number }).count).toBe(before.publicationRequests);
    expect((f.db.prepare('SELECT count(*) AS count FROM publication_upgrades').get() as { count: number }).count).toBe(before.publicationUpgrades);
    expect((f.db.prepare('SELECT count(*) AS count FROM effects').get() as { count: number }).count).toBe(before.effects);
    expect((f.db.prepare('SELECT count(*) AS count FROM operation_requests').get() as { count: number }).count).toBe(before.operations + 1);

    const authCalls = vi.mocked(f.githubSetup.getAuthenticationAccounts).mock.calls.length;
    const identityCalls = vi.mocked(f.github.getIdentity).mock.calls.length;
    const replay = await putSettings(f, headers, command, etag, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json<SettingsSaved>().receipt).toEqual(saved.receipt);
    expect(replay.json<SettingsSaved>().operation_id).toBe(saved.operation_id);
    expect(vi.mocked(f.githubSetup.getAuthenticationAccounts)).toHaveBeenCalledTimes(authCalls);
    expect(vi.mocked(f.github.getIdentity)).toHaveBeenCalledTimes(identityCalls);
    expect(f.execution.getCatalog).toHaveBeenCalledTimes(catalogCalls);
  });

  it('keeps a failed completion uncommitted when account or folder validation fails', async () => {
    const f = fixture(); const headers = await session(f); await prepareCompletion(f, headers);
    const etag = f.storage.getGlobalConfiguration().etag;
    vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER_ACCOUNT', login: 'other-user' }));
    const accountFailure = await putSettings(f, headers, { changes: {}, onboarding_changes: { complete: true } }, etag);
    expect(accountFailure.statusCode).toBe(409);
    expect(f.storage.getGlobalConfiguration().view.onboarding.completed_at_ms).toBeNull();
    expect(f.db.prepare("SELECT count(*) AS count FROM operation_requests WHERE operation_kind='settings.onboarding.update'").get()).toEqual({ count: 0 });

    vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'ACCOUNT_test', login: 'test-user' }));
    vi.mocked(directoryFs.realpath).mockRejectedValueOnce(Object.assign(new Error('path unavailable'), { code: 'ENOENT' }));
    const folderFailure = await putSettings(f, headers, { changes: {}, onboarding_changes: { complete: true } }, etag);
    expect(folderFailure.statusCode).toBe(409);
    expect(f.storage.getGlobalConfiguration().view.onboarding.completed_at_ms).toBeNull();
    expect(f.db.prepare("SELECT count(*) AS count FROM operation_requests WHERE operation_kind='settings.onboarding.update'").get()).toEqual({ count: 0 });
  });

  it('rejects completion when the shared settings revision changes during external validation', async () => {
    const f = fixture(); const headers = await session(f); await prepareCompletion(f, headers);
    const etag = f.storage.getGlobalConfiguration().etag;
    vi.mocked(f.github.getIdentity).mockImplementationOnce(async () => {
      const concurrentSave = await putSettings(f, headers, { changes: { projects_root: f.directory } });
      expect(concurrentSave.statusCode).toBe(200);
      return complete({ id: 'ACCOUNT_test', login: 'test-user' });
    });
    const completion = await putSettings(f, headers, { changes: {}, onboarding_changes: { complete: true } }, etag);
    expect(completion.statusCode).toBe(412);
    expect(f.storage.getGlobalConfiguration().view.onboarding.completed_at_ms).toBeNull();
    expect(f.db.prepare("SELECT count(*) AS count FROM operation_requests WHERE operation_kind='settings.onboarding.update'").get()).toEqual({ count: 0 });
  });

  it('rolls back the completion marker and receipt when the event cannot be committed', async () => {
    const f = fixture(); const headers = await session(f); await prepareCompletion(f, headers);
    f.db.exec(`CREATE TRIGGER fail_onboarding_event BEFORE INSERT ON events WHEN NEW.event_type='settings.onboarding.updated'
      BEGIN SELECT RAISE(ABORT, 'fixture event failure'); END`);
    const beforeRevision = f.storage.getSettings().revision;
    const beforeOperations = f.db.prepare('SELECT count(*) AS count FROM operation_requests').get();
    const beforeEvents = f.db.prepare('SELECT count(*) AS count FROM events').get();
    const response = await putSettings(f, headers, { changes: {}, onboarding_changes: { complete: true } });
    expect(response.statusCode).toBe(503);
    expect(f.storage.getSettings().revision).toBe(beforeRevision);
    expect(f.storage.getGlobalConfiguration().view.onboarding.completed_at_ms).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS count FROM operation_requests').get()).toEqual(beforeOperations);
    expect(f.db.prepare('SELECT count(*) AS count FROM events').get()).toEqual(beforeEvents);
  });

  it('keeps completion historical and reports later account, folder, and profile pendencies', async () => {
    const f = fixture(); const headers = await session(f); await prepareCompletion(f, headers);
    const completed = await putSettings(f, headers, { changes: {}, onboarding_changes: { complete: true } });
    expect(completed.statusCode).toBe(200);
    const completionTime = completed.json<SettingsSaved>().onboarding.completed_at_ms;
    vi.mocked(directoryFs.realpath).mockRejectedValueOnce(Object.assign(new Error('path unavailable'), { code: 'ENOENT' }));
    const folderCheck = await f.app.inject({ method: 'POST', url: '/api/v1/diagnostics?scope=host',
      headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { checks: ['configuration'] } });
    expect(folderCheck.statusCode).toBe(202);
    const folderOperation = folderCheck.json<{ operation_id: string }>();
    await vi.waitFor(() => expect(f.storage.getOperation(folderOperation.operation_id)?.state).toBe('succeeded'));
    const folderReport = await f.app.inject({ url: '/api/v1/diagnostics?scope=host', headers });
    expect(folderReport.json<{ reports: Array<{ diagnostics: Array<{ code: string; state: string }> }> }>().reports[0]?.diagnostics)
      .toMatchObject([{ code: 'PROJECTS_ROOT_UNAVAILABLE', state: 'blocked' }]);
    const profiles = f.storage.getGlobalConfiguration().view.profiles;
    const profileDeletion = await putSettings(f, headers, { changes: {}, profile_changes: profiles.map(({ id }) => ({ action: 'delete' as const, id })) });
    expect(profileDeletion.statusCode).toBe(200);
    const rootRemoval = await putSettings(f, headers, { changes: { projects_root: null } });
    expect(rootRemoval.statusCode).toBe(200);
    const current = await f.app.inject({ url: '/api/v1/settings', headers });
    expect(current.json<SettingsView>().onboarding).toEqual({ suppressed: false, completed_at_ms: completionTime, first_incomplete_step: null, prerequisites: [] });
    expect(current.json<SettingsView>().profile_counts).toEqual({ all: 0, implementer: 0, reviewer: 0 });

    const diagnostics = await f.app.inject({ url: '/api/v1/diagnostics?scope=host', headers });
    expect(diagnostics.statusCode).toBe(200);
    const diagnosticView = diagnostics.json<{ diagnostics: Array<{ code: string }> }>();
    expect(diagnosticView.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'ONBOARDING_PROJECTS_ROOT_REQUIRED', 'ONBOARDING_IMPLEMENTER_PROFILE_REQUIRED', 'ONBOARDING_REVIEWER_PROFILE_REQUIRED',
    ]));
    vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER_ACCOUNT', login: 'other-user' }));
    const identity = await f.app.inject({ method: 'POST', url: '/api/v1/diagnostics?scope=host',
      headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { checks: ['github_identity'] } });
    expect(identity.statusCode).toBe(202);
    const accepted = identity.json<{ operation_id: string }>();
    await vi.waitFor(() => expect(f.storage.getOperation(accepted.operation_id)?.state).toBe('succeeded'));
    const report = await f.app.inject({ url: '/api/v1/diagnostics?scope=host', headers });
    expect(report.json().reports[0]?.diagnostics).toMatchObject([{ code: 'ACCOUNT_MISMATCH', state: 'blocked' }]);
    expect(f.storage.getGlobalConfiguration().view.onboarding.completed_at_ms).toBe(completionTime);
    expect(f.storage.getGlobalConfiguration().view.onboarding.first_incomplete_step).toBeNull();
  });
});
