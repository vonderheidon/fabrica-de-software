import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OriginRequest, PreparationCreated, type GitHubProjectDetails, type GitHubQueryResult, type IssueContext, type OriginInspection, type PreparationChoices, type PreparationUpdate, type SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createPreparations, type PreparationDependencies } from '../../apps/controller/src/modules/projects/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

const resources: { close(): unknown }[] = []; const directories: string[] = [];
const host = '127.0.0.1:4310'; const origin = `http://${host}`;
const baseSha = 'a'.repeat(40);
const complete = <T>(data: T): GitHubQueryResult<T> => ({ state: 'complete', data, diagnostics: [], retryAtMs: null });
const mapping = { id: 'PVT_test', owner_id: 'OWNER_test', status_field_id: 'FIELD_status', status_option_ids: { backlog: 'BACKLOG', ready: 'READY', in_progress: 'PROGRESS', in_review: 'REVIEW', delivered: 'DELIVERED' } };
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'factory-preparations-')); directories.push(directory);
  const storage = openStorage({ dataDirectory: directory, busyTimeoutMs: 20 }); resources.push(storage);
  const db = new Database(join(directory, 'factory.sqlite')); db.pragma('foreign_keys = ON'); resources.push(db);
  // Explicit fixture observation only. Production does not select or fabricate an account here.
  db.prepare('INSERT INTO accounts(github_account_id, login, observed_at_ms, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)').run('ACCOUNT_test', 'test-user', 1, 1, 1);
  db.prepare("UPDATE factory_settings SET account_id = 'ACCOUNT_test'").run();
  storage.saveSettings({ operationId: randomUUID(), expectedRevision: storage.getGlobalConfiguration().etag,
    body: { changes: { projects_root: directory }, profile_changes: [{ action: 'create', profile: { name: 'Exact profile', profile_type: 'implementer', executor: 'maestri-omp', provider: 'exact-provider', model: 'exact-model', effort: 'exact-effort', guidance: 'Exact profile guidance' } }] },
    changes: { projects_root: directory } });
  const profile = storage.getGlobalConfiguration().view.profiles[0]!;
  const repository = { id: 'R_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repository', url: 'https://github.com/test-org/repository', defaultBranch: 'main', isArchived: false, isPrivate: true };
  const registration = storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
    body: { name: 'Project', source: { kind: 'github', location: repository.url }, base_branch: 'main' },
    source: { kind: 'github', location: repository.url, repository_id: repository.id, repository_url: repository.url }, originNotes: [] });
  const projectId = registration.resource.id;
  const previous = storage.getConfiguration(projectId);
  const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = previous.view.configuration;
  const changes = { github_project: mapping, implementer_profile_id: profile.id, reviewer_profile_id: profile.id, guidance: 'Project guidance' };
  storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: previous.etag, projectId,
    body: { project_changes: changes }, configuration: { ...configuration, ...changes }, globalChanges: {} });
  const issue: IssueContext = { id: 'I_test', number: 17, url: `${repository.url}/issues/17`, title: 'Executable issue', body: '## Objetivo\nDeliver an observable feature.\n## Critérios de aceite\n- Same text\n- Same text',
    state: 'OPEN', repository, assignees: [{ id: 'ACCOUNT_test', login: 'test-user' }], comments: [{ id: 'C_test', url: `${repository.url}/issues/17#issuecomment-1`, body: 'Free comment\n## Acceptance criteria\n- ac-999: not scope', author: null, updatedAt: '2026-10-16T00:00:00Z' }], blockers: [],
    memberships: [{ itemId: 'ITEM_test', projectId: mapping.id, archived: false, statusValues: [{ fieldId: mapping.status_field_id, optionId: mapping.status_option_ids.ready, name: 'Ready' }] }], references: [] };
  const project: GitHubProjectDetails = { project: { id: mapping.id, number: 1, title: 'Project', url: 'https://github.com/orgs/test-org/projects/1', owner: { id: mapping.owner_id, login: 'test-org', kind: 'organization' }, closed: false }, singleSelectFields: [{ id: mapping.status_field_id, name: 'Status', options: [
    { id: mapping.status_option_ids.backlog, name: 'Backlog' }, { id: mapping.status_option_ids.ready, name: 'Ready' },
    { id: mapping.status_option_ids.in_progress, name: 'In progress' }, { id: mapping.status_option_ids.in_review, name: 'In review' },
    { id: mapping.status_option_ids.delivered, name: 'Done' },
  ] }] };
  const observation: OriginInspection = { state: 'identified', source: configuration.source, local: null, base: { branch: 'main', sha: baseSha, observedFrom: 'github' },
    remote: { name: null, url: repository.url, confirmed: true, repository, branch: { repositoryId: repository.id, name: 'main', sha: baseSha } }, diagnostics: [], githubDiagnostics: [], retryAtMs: null, executionReady: false };
  const github: PreparationDependencies['github'] = {
    getIdentity: vi.fn(async () => complete({ id: 'ACCOUNT_test', login: 'test-user' })),
    getIssueContextById: vi.fn(async () => complete(structuredClone(issue))),
    getProject: vi.fn(async () => complete(structuredClone(project))),
    listProjectItems: vi.fn(async () => complete([
      { id: 'ITEM_test', kind: 'issue' as const, archived: false, contentId: issue.id, title: issue.title, url: issue.url, executable: true, status: { fieldId: mapping.status_field_id, optionId: mapping.status_option_ids.ready } },
      { id: 'ITEM_ready2', kind: 'issue' as const, archived: false, contentId: 'I_second', title: 'Second Ready issue', url: issue.url, executable: true, status: { fieldId: mapping.status_field_id, optionId: mapping.status_option_ids.ready } },
      { id: 'ITEM_pr', kind: 'pull_request' as const, archived: false, contentId: 'PR_test', title: 'Pull request', url: `${repository.url}/pull/20`, executable: false },
    ])),
  };
  const workspaces = { inspectOrigin: vi.fn<PreparationDependencies['workspaces']['inspectOrigin']>(async () => structuredClone(observation)) };
  const dependencies = { storage, github, workspaces };
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: directory, FACTORY_LOG_LEVEL: 'silent' }, directory), storage, undefined, undefined, dependencies); resources.push(app);
  return { directory, storage, db, projectId, issue, project, profile, observation, github, workspaces, app, preparations: createPreparations(dependencies) };
}
type Fixture = ReturnType<typeof fixture>;
async function session(f: Fixture) {
  const r = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {} });
  expect(r.statusCode).toBe(200);
  return { host, origin, 'content-type': 'application/json', cookie: String(r.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': r.json<SessionResponse>().csrf_token };
}
const choices: PreparationChoices = { issue_id: 'I_test', delivery_mode: 'icr', guidance: 'Attempt guidance', overrides: {} };
async function create(f: Fixture, body = choices, key = randomUUID()) {
  const headers = await session(f);
  return f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/preparations`, headers: { ...headers, 'idempotency-key': key }, payload: body });
}
async function update(f: Fixture, id: string, body: PreparationUpdate, etag?: string, key = randomUUID()) {
  const headers = await session(f);
  return f.app.inject({ method: 'PUT', url: `/api/v1/preparations/${id}`, headers: { ...headers, ...(etag ? { 'if-match': etag } : {}), 'idempotency-key': key }, payload: body });
}
afterEach(async () => {
  for (const resource of resources.splice(0).reverse()) await resource.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('persistent preparation HTTP contracts', () => {
  it('passes the closed origin inspection contract for a configured repository', async () => {
    const f = fixture();
    const response = await create(f);
    expect(response.statusCode).toBe(201);
    const inspection = vi.mocked(f.workspaces.inspectOrigin).mock.calls[0];
    expect(inspection).toBeDefined();
    expect(Value.Check(OriginRequest, inspection?.[0])).toBe(true);
  });
  it('captures typed choices, effective values, occurrence criteria, effects and origins without changing defaults', async () => {
    const f = fixture(); const before = f.storage.getConfiguration(f.projectId);
    const response = await create(f, { ...choices, delivery_mode: 'pr', overrides: { correction_limit: 0, checks: [], time_defaults: { ...before.view.settings.time_defaults, polling_interval_ms: 2000 } } });
    expect(response.statusCode, response.body).toBe(201); expect(Value.Check(PreparationCreated, response.json())).toBe(true);
    const result = response.json<PreparationCreated>(); const p = result.preparation;
    expect(p).toMatchObject({ revision: 1, can_start: false, delivery_mode: 'pr', base_sha: baseSha,
      effective_configuration: { configuration: { correction_limit: 0 }, origins: { correction_limit: 'preparation', checks: 'preparation', time_defaults: 'preparation', base_branch: 'project' }, guidance: 'Project guidance\nAttempt guidance' } });
    expect(p.criteria_preview.criteria.map((c) => [c.id, c.text])).toEqual([['ac-1', 'Same text'], ['ac-2', 'Same text']]);
    expect(p.prerequisites.map((p) => p.code)).toEqual(['PUBLICATION_TARGET_REQUIRED', 'EXECUTOR_REVALIDATION_REQUIRED']);
    expect(p.effects_preview.find((e) => e.kind === 'push')?.requested).toBe(true);
    const after = f.storage.getConfiguration(f.projectId);
    expect(after.etag).toBe(before.etag); expect(after.view.configuration).toEqual(before.view.configuration);
    expect(after.view.settings).toEqual(before.view.settings); expect(after.view.profiles).toEqual(before.view.profiles);
    expect(f.storage.getOperation(result.operation_id)).toMatchObject({ state: 'succeeded', resource: { type: 'preparation', id: p.id }, receipt: result.receipt });
    expect(response.headers.location).toBe(`/api/v1/preparations/${p.id}`);
    const get = await f.app.inject({ url: String(response.headers.location), headers: await session(f) });
    expect(get.statusCode).toBe(200); expect(get.headers.etag).toBe(response.headers.etag);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/attempts', headers: await session(f), payload: {} })).statusCode).toBe(400);
  });
  it('requires session, CSRF, closed DTOs and typed overrides', async () => {
    const f = fixture(); const headers = await session(f); const url = `/api/v1/projects/${f.projectId}/preparations`;
    expect((await f.app.inject({ method: 'POST', url, headers: { host, origin }, payload: choices })).statusCode).toBe(401);
    expect((await f.app.inject({ method: 'POST', url, headers: { ...headers, 'x-csrf-token': '' }, payload: choices })).statusCode).toBe(403);
    for (const overrides of [{ arbitraryCommand: 'private-marker' }, { correction_limit: 6 }, { costDefaults: { attemptCost: 9 } }]) {
      const r = await create(f, { ...choices, overrides } as PreparationChoices); expect(r.statusCode).toBe(400); expect(r.body).not.toContain('private-marker');
    }
    const r = await create(f, { ...choices, overrides: { checks: [{ id: 'check', command: 'npm test', cwd_relative: '../escape' }] } });
    expect(r.statusCode).toBe(400);
  });
  it('uses CAS and a durable receipt; every save invalidates the previous summary', async () => {
    const f = fixture(); const initial = await create(f); const p = initial.json<PreparationCreated>().preparation;
    expect((await update(f, p.id, { changes: { guidance: 'Edited' } })).statusCode).toBe(428);
    const key = randomUUID(); const body = { changes: { guidance: 'Edited' } };
    const saved = await update(f, p.id, body, String(initial.headers.etag), key); expect(saved.statusCode, saved.body).toBe(200);
    const current = saved.json<PreparationCreated>(); expect(current.preparation.revision).toBe(2); expect(current.preparation.summary_hash).not.toBe(p.summary_hash);
    const recovered = await update(f, p.id, body, String(initial.headers.etag), key);
    expect(recovered.statusCode).toBe(200); expect(recovered.json<PreparationCreated>().receipt).toEqual(current.receipt);
    expect((await update(f, p.id, { changes: { guidance: 'Another' } }, String(initial.headers.etag))).statusCode).toBe(412);
    expect((await update(f, p.id, { changes: { guidance: 'Changed payload' } }, String(initial.headers.etag), key)).statusCode).toBe(409);
    await expect(f.preparations.revalidateSummary({ preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summary_hash })).rejects.toMatchObject({ code: 'SUMMARY_CHANGED' });
    f.storage.close(); const reopened = openStorage({ dataDirectory: f.directory }); resources.push(reopened);
    expect(reopened.getPreparation(p.id).view).toMatchObject({ revision: 2, guidance: 'Edited' });
    expect(reopened.getOperation(key)).toMatchObject({ state: 'succeeded', receipt: current.receipt });
  });
  it('recovers a lost create response and never adds another preparation or event', async () => {
    const f = fixture(); const key = randomUUID(); const first = await create(f, choices, key);
    const before = f.storage.getEvents({}).items.length;
    const recovered = await create(f, choices, key); expect(recovered.statusCode).toBe(201);
    expect(recovered.json<PreparationCreated>().preparation.id).toBe(first.json<PreparationCreated>().preparation.id);
    expect(f.storage.getEvents({}).items).toHaveLength(before);
    expect(f.db.prepare('SELECT count(*) AS n FROM preparations').get()).toEqual({ n: 1 });
    expect((await create(f, { ...choices, guidance: 'Different' }, key)).statusCode).toBe(409);
  });
  it.each(['base', 'criteria', 'account', 'configuration', 'mode'] as const)('rejects a stale authorized summary after material %s changes', async (change) => {
    const f = fixture(); const first = await create(f); const p = first.json<PreparationCreated>().preparation;
    await expect(f.preparations.revalidateSummary({ preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summary_hash })).resolves.toBeDefined();
    if (change === 'base') f.observation.base!.sha = 'b'.repeat(40);
    if (change === 'criteria') f.issue.body += '\n- New criterion';
    if (change === 'account') vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'ACCOUNT_other', login: 'other' }));
    if (change === 'configuration') f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: { ...f.storage.getSettings().time_defaults, passage_active_time_ms: 123456 } });
    if (change === 'mode') expect((await update(f, p.id, { changes: { delivery_mode: 'commit' } }, String(first.headers.etag))).statusCode).toBe(200);
    await expect(f.preparations.revalidateSummary({ preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summary_hash })).rejects.toMatchObject({ code: 'SUMMARY_CHANGED' });
  });
  it('does not introduce criteria from comments or invalidate scope for unrelated editorial comments', async () => {
    const f = fixture(); const first = await create(f); const p = first.json<PreparationCreated>().preparation;
    f.issue.comments[0]!.body = 'Changed free comment\n- ac-999: not scope';
    const current = await f.preparations.getPreparation(p.id);
    expect(current.view.preparation.criteria_preview.criteria).toHaveLength(2); expect(current.view.preparation.summary_hash).toBe(p.summary_hash);
  });
  it.each(['repository', 'previous', 'profile'] as const)('rejects an invalid %s link without persisting it', async (kind) => {
    const f = fixture();
    if (kind === 'repository') f.issue.repository.id = 'ANOTHER_REPOSITORY';
    const body: PreparationChoices = { ...choices, ...(kind === 'previous' ? { previous_attempt_id: randomUUID() } : {}), overrides: kind === 'profile' ? { implementer_profile: { kind: 'reference', id: f.profile.id, revision: 100 } } : {} };
    expect((await create(f, body)).statusCode).toBe(kind === 'previous' ? 404 : 409);
    expect(f.db.prepare('SELECT count(*) AS n FROM preparations').get()).toEqual({ n: 0 });
  });
  it('reports partial readings, blockers and invalid criteria as prerequisites instead of granting readiness', async () => {
    const f = fixture(); f.issue.body = '## Objetivo\nGoal\n## Acceptance criteria\n- ac-1: first\n- AC-1: duplicate'; f.issue.blockers = [{ id: 'I_block', number: 9, title: 'Dependency', url: 'https://github.com/test-org/repository/issues/9', state: 'OPEN' }];
    const first = await create(f); expect(first.statusCode, first.body).toBe(201);
    const p = first.json<PreparationCreated>().preparation;
    expect(p.prerequisites.map((v) => v.code)).toEqual(expect.arrayContaining(['OPEN_BLOCKERS', 'CRITERION_ID_DUPLICATED']));
    vi.mocked(f.github.getIssueContextById).mockResolvedValue({ state: 'partial', data: f.issue, diagnostics: [], retryAtMs: 99999 });
    const current = await f.preparations.getPreparation(p.id);
    expect(current.view.preparation).toMatchObject({ issue: null, criteria_preview: { executable: false }, retry_at_ms: 99999, can_start: false });
    expect(current.view.preparation.prerequisites.map((v) => v.code)).toContain('READ_INCOMPLETE');
  });
  it('never returns a delayed observation as the saved current revision', async () => {
    const f = fixture(); const first = await create(f); const p = first.json<PreparationCreated>().preparation;
    const config = f.storage.getConfiguration(f.projectId);
    vi.mocked(f.github.getIdentity).mockImplementationOnce(async () => {
      f.storage.savePreparation({ command: { kind: 'preparation.update', preparationId: p.id, operationId: randomUUID(), expectedRevision: String(first.headers.etag), body: { changes: { guidance: 'Concurrent edit' } } }, configurationETag: config.etag });
      return complete({ id: 'ACCOUNT_test', login: 'test-user' });
    });
    await expect(f.preparations.getPreparation(p.id)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(f.storage.getPreparation(p.id).view.guidance).toBe('Concurrent edit');
  });
  it('rechecks configuration under the write transaction after remote IO', async () => {
    const f = fixture();
    vi.mocked(f.github.getIssueContextById).mockImplementationOnce(async () => {
      f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: f.storage.getSettings().time_defaults });
      return complete(f.issue);
    });
    expect((await create(f)).statusCode).toBe(412);
    expect(f.db.prepare('SELECT count(*) AS n FROM preparations').get()).toEqual({ n: 0 });
  });
  it('rolls back the preparation, history and operation when the durable event fails', async () => {
    const f = fixture(); const key = randomUUID();
    f.db.exec("CREATE TRIGGER reject_preparation_event BEFORE INSERT ON events WHEN NEW.entity_type = 'preparation' BEGIN SELECT RAISE(ABORT, 'private-synthetic-error'); END;");
    const response = await create(f, choices, key); expect(response.statusCode).toBe(503); expect(response.body).not.toContain('private-synthetic-error');
    expect(f.storage.getOperation(key)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM preparations').get()).toEqual({ n: 0 });
    expect(f.db.prepare('SELECT count(*) AS n FROM preparation_revisions').get()).toEqual({ n: 0 });
  });
  it('uses immutable preparation history and a project-scoped revision FK', async () => {
    const f = fixture(); const first = await create(f); const p = first.json<PreparationCreated>().preparation;
    expect(() => f.db.prepare('UPDATE preparation_revisions SET choices_json = ? WHERE preparation_id = ?').run('{}', p.id)).toThrow();
    expect(() => f.db.prepare('DELETE FROM preparation_revisions WHERE preparation_id = ?').run(p.id)).toThrow();
    expect(() => f.db.prepare('UPDATE preparations SET revision = 99 WHERE id = ?').run(p.id)).toThrow();
    expect(() => f.db.prepare('UPDATE preparations SET project_id = ? WHERE id = ?').run(randomUUID(), p.id)).toThrow();
  });
  it('paginates issue choices with bounded cursors and excludes PRs from executability', async () => {
    const f = fixture(); const headers = await session(f); const url = `/api/v1/projects/${f.projectId}/issues`;
    const first = await f.app.inject({ url: `${url}?limit=1`, headers }); expect(first.statusCode, first.body).toBe(200);
    const page = first.json<{ next_cursor: string; has_more: boolean }>(); expect(page.has_more).toBe(true);
    const second = await f.app.inject({ url: `${url}?limit=1&cursor=${page.next_cursor}`, headers }); expect(second.statusCode).toBe(200);
    const all = await f.preparations.listIssues(f.projectId, {}); expect(all.items.every((v) => v.kind === 'issue')).toBe(true);
    await expect(f.preparations.listIssues(f.projectId, { cursor: page.next_cursor, search: 'other' })).rejects.toMatchObject({ code: 'ISSUE_OPTIONS_CHANGED' });
  });
  it('only lists unarchived issues with the configured Ready status and field', async () => {
    const f = fixture();
    const base = { id: 'ITEM', kind: 'issue' as const, archived: false, contentId: f.issue.id, title: 'Issue', url: f.issue.url, executable: true };
    const items = [
      ...Object.values(mapping.status_option_ids).map((optionId) => ({ ...base, id: optionId, status: { fieldId: mapping.status_field_id, optionId } })),
      { ...base, id: 'missing' },
      { ...base, id: 'unset', status: { fieldId: mapping.status_field_id, optionId: null } },
      { ...base, id: 'wrong-field', status: { fieldId: 'OTHER', optionId: mapping.status_option_ids.ready } },
      { ...base, id: 'archived', archived: true, status: { fieldId: mapping.status_field_id, optionId: mapping.status_option_ids.ready } },
      { ...base, id: 'pr', kind: 'pull_request' as const, status: { fieldId: mapping.status_field_id, optionId: mapping.status_option_ids.ready } },
    ];
    vi.mocked(f.github.listProjectItems).mockResolvedValue(complete(items));
    expect((await f.preparations.listIssues(f.projectId, {})).items.map((item) => item.id)).toEqual(['READY']);
    expect((await f.preparations.listIssues(f.projectId, { search: 'absent' })).items).toEqual([]);
  });
});
