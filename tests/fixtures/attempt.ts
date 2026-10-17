import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { vi } from 'vitest';
import type { DeliveryMode, GitHubProjectDetails, GitHubQueryResult, IssueContext, OriginInspection, PreparedWorkspace, StartAttempt, ToolObservation } from '#contracts';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createPreparations, type PreparationDependencies } from '../../apps/controller/src/modules/projects/index.js';
import { createPipeline, type PipelineDependencies } from '../../apps/controller/src/modules/pipeline/index.js';
import type { Execution, PassageRequest } from '../../apps/controller/src/modules/execution/index.js';
import { digest, loadRoleResources } from '../../apps/controller/src/modules/execution/roles.js';

export const complete = <T>(data: T): GitHubQueryResult<T> => ({ state: 'complete', data, diagnostics: [], retryAtMs: null });
export async function attemptFixture(temporaryRoot = tmpdir(), baseSha = 'a'.repeat(40)) {
  const directory = mkdtempSync(join(temporaryRoot, 'factory-attempt-'));
  const storage = openStorage({ dataDirectory: directory, busyTimeoutMs: 10 });
  const db = new Database(join(directory, 'factory.sqlite')); db.pragma('foreign_keys = ON');
  // Explicit test observation only; no production account seed or invented host authority.
  db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('ACCOUNT_test', 'test-user', 1, 1, 1);
  db.prepare("UPDATE factory_settings SET account_id='ACCOUNT_test'").run();
  storage.saveSettings({ operationId: randomUUID(), expectedRevision: storage.getGlobalConfiguration().etag,
    changes: { designatedHost: 'test-host', projectsRoot: directory }, body: {
      changes: { designatedHost: 'test-host', projectsRoot: directory },
      profileChanges: [{ name: 'Exact', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: 'Profile guidance' }],
    } });
  const profile = storage.getGlobalConfiguration().view.profiles[0]!;
  const repository = { id: 'R_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repo', url: 'https://github.com/test-org/repo', defaultBranch: 'main', isArchived: false, isPrivate: true };
  const mapping = { id: 'PVT_test', ownerId: 'OWNER_test', statusFieldId: 'FIELD_test', statusOptionIds: { ready: 'READY', inProgress: 'PROGRESS', inReview: 'REVIEW', delivered: 'DELIVERED' } };
  function register() {
    const projectId = storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: 'Project', source: { kind: 'github', location: repository.url }, baseBranch: 'main' },
      source: { kind: 'github', location: repository.url, repositoryId: repository.id, repositoryUrl: repository.url }, originNotes: [] }).resource.id;
    const previous = storage.getConfiguration(projectId);
    const { id: _id, projectId: _projectId, revision: _revision, createdAtMs: _created, ...configuration } = previous.view.configuration;
    const changes = { githubProject: mapping, implementerProfileId: profile.id, reviewerProfileId: profile.id };
    storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: previous.etag, projectId, body: { projectChanges: changes },
      configuration: { ...configuration, ...changes }, globalChanges: {} });
    return projectId;
  }
  const projectId = register();
  const issue: IssueContext = { id: 'I_test', number: 17, url: `${repository.url}/issues/17`, title: 'Executable issue',
    body: '## Objetivo\nDeliver a feature.\n## Critérios de aceite\n- Same text\n- Same text', state: 'OPEN', repository,
    assignees: [{ id: 'ACCOUNT_test', login: 'test-user' }], comments: [], blockers: [], references: [],
    memberships: [{ itemId: 'ITEM_test', projectId: mapping.id, archived: false, statusValues: [{ fieldId: mapping.statusFieldId, optionId: mapping.statusOptionIds.ready, name: 'Ready' }] }] };
  const project: GitHubProjectDetails = { project: { id: mapping.id, number: 1, title: 'Project', url: 'https://github.com/orgs/test-org/projects/1', owner: { id: mapping.ownerId, login: 'test-org', kind: 'organization' }, closed: false },
    singleSelectFields: [{ id: mapping.statusFieldId, name: 'Status', options: Object.values(mapping.statusOptionIds).map(id => ({ id, name: id })) }] };
  const observation: OriginInspection = { state: 'identified', source: storage.getConfiguration(projectId).view.configuration.source,
    local: null, base: { branch: 'main', sha: baseSha, observedFrom: 'github' },
    remote: { name: null, url: repository.url, confirmed: true, repository, branch: { repositoryId: repository.id, name: 'main', sha: baseSha } }, diagnostics: [], githubDiagnostics: [], retryAtMs: null, executionReady: false };
  const github: PreparationDependencies['github'] = {
    getIdentity: vi.fn(async () => complete({ id: 'ACCOUNT_test', login: 'test-user' })),
    getIssueContextById: vi.fn(async () => complete(structuredClone(issue))),
    getProject: vi.fn(async () => complete(structuredClone(project))), listProjectItems: vi.fn(async () => complete([])),
  };
  const workspaces = { inspectOrigin: vi.fn(async () => structuredClone(observation)),
    prepareAttempt: vi.fn(async (input: Parameters<import('../../apps/controller/src/modules/workspaces/index.js').Workspaces['prepareAttempt']>[0]): Promise<PreparedWorkspace> => ({
      state: 'prepared' as const, attemptId: input.attemptId, baseSha: input.baseSha, branch: `factory/${input.issueNumber}/${input.attemptId}`,
      resource: { kind: 'implementation' as const, path: join(directory, 'work', input.attemptId, 'implementation'), owned: true }, diagnostic: null,
    })) };
  const preparations = createPreparations({ storage, github, workspaces });
  const persistence = storage.executionPersistence();
  const roles = [...loadRoleResources().values()].map(r => r.reference);
  const execution: Execution = {
    continuePassage: vi.fn(async (source, input) => {
      const original = persistence.getPassage(source); const handle = { passageId: input.binding.passageId };
      persistence.reserve({ handle, binding: input.binding, requestHash: digest(input), state: 'starting', roleResource: input.roleResource,
        terminalName: original.terminalName, diagnostic: null, effectiveProfile: null, executorVersion: null });
      persistence.confirmReady(handle, input.profile, '18.11.1');
      return persistence.getPassage(handle);
    }),
    roleResources: vi.fn(() => structuredClone(roles)),
    observeVersions: vi.fn(async () => []), preflight: vi.fn(async () => ({ ready: true, code: null, ompVersion: '18.11.1' })),
    startPassage: vi.fn(async (request: PassageRequest) => {
      const handle = { passageId: request.binding.passageId };
      persistence.reserve({ handle, binding: request.binding, requestHash: digest(request), state: 'starting', roleResource: request.roleResource,
        terminalName: `factory-${handle.passageId}`, diagnostic: null, effectiveProfile: null, executorVersion: null });
      persistence.confirmReady(handle, request.profile, '18.11.1');
      return persistence.getPassage(handle);
    }),
    observe: (h, cursor = 0) => persistence.observe(h, cursor, 100), getResult: h => persistence.getResult(h),
    answerQuestion: vi.fn(async () => { throw new Error('Not exercised'); }), cancelAttempt: vi.fn(async () => []),
    interactionSurface: () => ({ kind: 'terminal', reference: '', available: false, reason: 'Test fixture', open: null }), close: vi.fn(async () => {}),
  };
  const tools: ToolObservation[] = (['node', 'git', 'gh', 'maestri', 'omp'] as const).map(tool => ({
    tool, state: 'observed', version: tool === 'omp' ? '18.11.1' : '1.0.0', cause: null, affectedRequirements: [], observedAtMs: 1,
  }));
  const observeTools = vi.fn(async () => structuredClone(tools)); const logFailure = vi.fn();
  const dependencies: PipelineDependencies = { storage, preparations, execution, workspaces, observeTools, hostName: 'test-host', logFailure };
  const pipeline = createPipeline(dependencies);
  async function prepare(target = projectId, deliveryMode: DeliveryMode = 'icr') {
    const saved = await preparations.createPreparation(target, { issueId: issue.id, deliveryMode, guidance: '', overrides: {} }, { operationId: randomUUID(), expectedRevision: undefined });
    const p = saved.view.preparation;
    const body: StartAttempt = { preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summaryHash, authorized: true };
    return { body, context: { operationId: randomUUID(), expectedRevision: saved.etag }, saved };
  }
  return { directory, storage, db, profile, projectId, issue, project, observation, github, workspaces, preparations, persistence, roles, execution, tools, pipeline, dependencies, observeTools, logFailure, register, prepare,
    async close() { try { await pipeline.close(); } finally { storage.close(); db.close(); rmSync(directory, { recursive: true }); } } };
}
export type AttemptFixture = Awaited<ReturnType<typeof attemptFixture>>;
