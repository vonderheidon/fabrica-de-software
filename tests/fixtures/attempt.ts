import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { vi } from 'vitest';
import type { DeliveryMode, GitHubProjectDetails, GitHubQueryResult, IssueContext, OriginInspection, PreparationChoices, PreparedWorkspace, StartAttempt, ToolObservation } from '#contracts';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import type { GitHub } from '../../apps/controller/src/modules/github/index.js';
import { createPreparations, type PreparationDependencies } from '../../apps/controller/src/modules/projects/index.js';
import { createPipeline, type PipelineDependencies } from '../../apps/controller/src/modules/pipeline/index.js';
import type { Execution, PassageRequest } from '../../apps/controller/src/modules/execution/index.js';
import { digest, loadRoleResources } from '../../apps/controller/src/modules/execution/roles.js';

export const complete = <T>(data: T): GitHubQueryResult<T> => ({ state: 'complete', data, diagnostics: [], retryAtMs: null });
export async function attemptFixture(temporaryRoot = tmpdir(), baseSha = 'a'.repeat(40), profileEffort: string | null = 'high', directoryName?: 'factory' | 'var/factory', recordInitialStorage = false, sourceKind: 'local' | 'github' = 'local', projectFolder?: string) {
  const directory = directoryName ? join(temporaryRoot,directoryName) : mkdtempSync(join(temporaryRoot, 'factory-attempt-'));
  if (directoryName) mkdirSync(directory, { recursive: true });
  const storageOptions = { dataDirectory: directory, busyTimeoutMs: 10 };
  const storage = openStorage(storageOptions);
  const db = new Database(join(directory, 'factory.sqlite')); db.pragma('foreign_keys = ON');
  const cleanInitialization = recordInitialStorage ? {
    schemaVersion: storage.getDiagnostics().schemaVersion,
    integrityCheck: db.pragma('integrity_check', { simple: true }),
    foreignKeyViolations: db.pragma('foreign_key_check'),
    counts: {
      accounts: (db.prepare('SELECT count(*) AS n FROM accounts').get() as { n: number }).n,
      profiles: (db.prepare('SELECT count(*) AS n FROM execution_profiles').get() as { n: number }).n,
      projects: (db.prepare('SELECT count(*) AS n FROM projects').get() as { n: number }).n,
      preparations: (db.prepare('SELECT count(*) AS n FROM preparations').get() as { n: number }).n,
      attempts: (db.prepare('SELECT count(*) AS n FROM attempts').get() as { n: number }).n,
    },
    accountId: storage.getSettings().account_id,
    directoryCreatedExclusive: true,
    openedByNormalStoragePath: true,
  } : undefined;
  // Explicit test observation only; no production account seed or invented host authority.
  db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('ACCOUNT_test', 'test-user', 1, 1, 1);
  db.prepare("UPDATE factory_settings SET account_id='ACCOUNT_test'").run();
  storage.saveSettings({ operationId: randomUUID(), expectedRevision: storage.getGlobalConfiguration().etag,
    changes: { projects_root: directory }, body: {
      changes: { projects_root: directory },
      profile_changes: [
        { action: 'create', profile: { name: 'Exact Implementer', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: profileEffort, guidance: 'Profile guidance' } },
        { action: 'create', profile: { name: 'Exact Reviewer', profile_type: 'reviewer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: profileEffort, guidance: 'Reviewer guidance' } },
      ],
    } });
  const profile = storage.getGlobalConfiguration().view.profiles.find((item) => item.profile_type === 'implementer');
  const reviewerProfile = storage.getGlobalConfiguration().view.profiles.find((item) => item.profile_type === 'reviewer');
  if (!profile || !reviewerProfile) throw new Error('PROFILE_FIXTURE_INCOMPLETE');
  const implementerProfileId = profile.id;
  const reviewerProfileId = reviewerProfile.id;
  const repository = { id: 'R_test', owner: { id: 'OWNER_test', login: 'test-org' }, name: 'repo', url: 'https://github.com/test-org/repo', defaultBranch: 'main', isArchived: false, isPrivate: true };
  const mapping = { id: 'PVT_test', owner_id: 'OWNER_test', status_field_id: 'FIELD_test', status_option_ids: { backlog: 'BACKLOG', ready: 'READY', in_progress: 'PROGRESS', in_review: 'REVIEW', delivered: 'DELIVERED' } };
  let registrations = 0;
  /** `local` registers a Pasta do projeto; `github` reproduces a legacy URL-sourced project, which has no folder. */
  function register() {
    const source = { kind: sourceKind, location: sourceKind === 'local' ? projectFolder ?? `${directory}-origin-${++registrations}` : repository.url };
    const projectId = storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: 'Project', source, base_branch: 'main' },
      source: { ...source, repository_id: repository.id, repository_url: repository.url }, originNotes: [] }).resource.id;
    const previous = storage.getConfiguration(projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = previous.view.configuration;
    const changes = { github_project: mapping, implementer_profile_id: implementerProfileId, reviewer_profile_id: reviewerProfileId };
    storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: previous.etag, projectId, body: { project_changes: changes },
      configuration: { ...configuration, ...changes }, globalChanges: {} });
    return projectId;
  }
  const projectId = register();
  const issue: IssueContext = { id: 'I_test', number: 17, url: `${repository.url}/issues/17`, title: 'Executable issue',
    body: '## Objetivo\nDeliver a feature.\n## Critérios de aceite\n- Same text\n- Same text', state: 'OPEN', repository,
    assignees: [{ id: 'ACCOUNT_test', login: 'test-user' }], comments: [], blockers: [], references: [],
    memberships: [{ itemId: 'ITEM_test', projectId: mapping.id, archived: false, statusValues: [{ fieldId: mapping.status_field_id, optionId: mapping.status_option_ids.ready, name: 'Ready' }] }] };
  const project: GitHubProjectDetails = { project: { id: mapping.id, number: 1, title: 'Project', url: 'https://github.com/orgs/test-org/projects/1', owner: { id: mapping.owner_id, login: 'test-org', kind: 'organization' }, closed: false },
    singleSelectFields: [{ id: mapping.status_field_id, name: 'Status', options: [
      { id: mapping.status_option_ids.backlog, name: 'Backlog' }, { id: mapping.status_option_ids.ready, name: 'Ready' },
      { id: mapping.status_option_ids.in_progress, name: 'In progress' }, { id: mapping.status_option_ids.in_review, name: 'In review' },
      { id: mapping.status_option_ids.delivered, name: 'Done' },
    ] }] };
  const observation: OriginInspection = { state: 'identified', source: storage.getConfiguration(projectId).view.configuration.source,
    local: null, base: { branch: 'main', sha: baseSha, observedFrom: 'github' },
    remote: { name: null, url: repository.url, confirmed: true, repository, branch: { repositoryId: repository.id, name: 'main', sha: baseSha } }, diagnostics: [], githubDiagnostics: [], retryAtMs: null, executionReady: false };
  const github: PreparationDependencies['github'] & Pick<GitHub, 'getRateLimitSnapshot'> = {
    getIdentity: vi.fn(async () => complete({ id: 'ACCOUNT_test', login: 'test-user' })),
    getIssueContextById: vi.fn(async () => complete(structuredClone(issue))),
    getProject: vi.fn(async () => complete(structuredClone(project))), listProjectItems: vi.fn(async () => complete([])),
    getRateLimitSnapshot: vi.fn(() => null),
  };
  const workspaces = { inspectOrigin: vi.fn(async () => structuredClone(observation)),
    projectFolderBranches: vi.fn(async (): Promise<string[] | null> => ['main']),
    prepareAttempt: vi.fn(async (input: Parameters<import('../../apps/controller/src/modules/workspaces/index.js').Workspaces['prepareAttempt']>[0]): Promise<PreparedWorkspace> => {
      const comparisonBase = input.inheritedBaseSha !== null ? 'b'.repeat(40) : input.baseSha;
      return { state: 'prepared' as const, attemptId: input.attemptId, workspace: input.workspace, baseSha: input.baseSha, branch: `factory/${input.issueNumber}/${input.attemptId}`,
        resource: { kind: 'implementation' as const, path: join(directory, 'projects', input.workspace.project_id, 'v1', 'managed', 'issues', String(input.issueNumber), 'workspace'), owned: true },
        snapshot: { identity: input.workspace, predecessor_attempt_id: input.predecessorAttemptId,
          initial_state: input.predecessorAttemptId && input.inheritedBaseSha !== null ? { kind: 'inherited_attempt' as const, source_attempt_id: input.predecessorAttemptId, content_identity: comparisonBase }
            : { kind: 'base_checkout' as const, content_identity: comparisonBase }, inherited_base_sha: input.inheritedBaseSha, comparison_base_sha: comparisonBase },
        diagnostic: null };
    }),
    async resolveAttemptEvidenceDirectory(attemptId: string, deliveryId: string) {
      const binding = storage.getAttemptWorkspaceBinding(attemptId);
      return join(directory, 'projects', binding.workspace.project_id, 'v1', 'managed', 'issues', String(binding.issue_number),
        'attempts', attemptId, 'evidence', deliveryId);
    },
  };
  const preparations = createPreparations({ storage, github, workspaces });
  const persistence = storage.executionPersistence();
  const roles = [...loadRoleResources().values()].map(r => r.reference);
  const execution: Execution = {
    observeManagedTerminal: vi.fn(async () => 'stopped' as const),
    preparePassageHandoff: vi.fn(async source => { persistence.recordStop(source, { passageId: source.passageId, state: 'confirmed' }); }),
    getCatalog: vi.fn(async () => ({ state: 'unavailable' as const, observed_at_ms: 1,
      diagnostics: [{ code: 'OMP_CATALOG_UNAVAILABLE', message: 'Test catalog unavailable.', recovery: 'Use a controlled catalog fixture.' }] })),
    continuePassage: vi.fn(async (_source, input) => {
      const handle = { passageId: input.binding.passageId };
      const session = persistence.getAttemptSession(handle, input.binding);
      persistence.reserve({ handle, binding: input.binding, requestHash: digest(input), state: 'starting', roleResource: input.roleResource,
        terminalName: `factory-${handle.passageId}`, diagnostic: null, effectiveProfile: null, executorVersion: null }, true);
      persistence.confirmTerminal(handle, { workspaceId: session.workspaceId ?? randomUUID(), terminalId: session.terminalId ?? randomUUID(),
        ompSessionId: session.ompSessionId ?? randomUUID() });
      persistence.confirmReady(handle, input.profile, '18.11.1');
      return persistence.getPassage(handle);
    }),
    roleResources: vi.fn(() => structuredClone(roles)),
    observeVersions: vi.fn(async () => []), preflight: vi.fn(async () => ({ ready: true, code: null, ompVersion: '18.11.1' })),
    startPassage: vi.fn(async (request: PassageRequest) => {
      const handle = { passageId: request.binding.passageId };
      const session = persistence.getAttemptSession(handle, request.binding);
      persistence.reserve({ handle, binding: request.binding, requestHash: digest(request), state: 'starting', roleResource: request.roleResource,
        terminalName: `factory-${handle.passageId}`, diagnostic: null, effectiveProfile: null, executorVersion: null }, true);
      persistence.confirmTerminal(handle, { workspaceId: session.workspaceId ?? randomUUID(), terminalId: session.terminalId ?? randomUUID(),
        ompSessionId: session.ompSessionId ?? randomUUID() });
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
  async function prepare(target = projectId, deliveryMode: DeliveryMode = 'icr', baseBranch?: string, previousAttemptId?: string, deliveryBranch?: PreparationChoices['overrides']['delivery_branch']) {
    const saved = await preparations.createPreparation(target, { issue_id: issue.id, delivery_mode: deliveryMode, guidance: '',
      overrides: { ...(baseBranch ? { base_branch: baseBranch } : {}), ...(deliveryBranch ? { delivery_branch: deliveryBranch } : {}) },
      ...(previousAttemptId ? { previous_attempt_id: previousAttemptId } : {}) }, { operationId: randomUUID(), expectedRevision: undefined });
    const p = saved.view.preparation;
    const body: StartAttempt = { preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summary_hash, authorized: true };
    return { body, context: { operationId: randomUUID(), expectedRevision: saved.etag }, saved };
  }
  return { directory, storage, db, cleanInitialization, profile, reviewerProfile, projectId, issue, project, observation, github, workspaces, preparations, persistence, roles, execution, tools, pipeline, dependencies, observeTools, logFailure, register, prepare,
    async close() { try { await pipeline.close(); } finally { storage.close(); db.close(); rmSync(directory, { recursive: true, force: true }); } } };
}
export type AttemptFixture = Awaited<ReturnType<typeof attemptFixture>>;

/** Controlled physical-stop observation; keep SQL occupancy and resource receipts in sync. */
export function confirmTerminalStops(fixture: Pick<AttemptFixture, 'db' | 'persistence'>, attemptId: string, persistence: AttemptFixture['persistence'] = fixture.persistence): void {
  const handles = fixture.db.prepare<[string], { passageId: string}>(`SELECT passage_id AS passageId FROM resources
    WHERE attempt_id=? AND kind='terminal' AND stop_state<>'confirmed' ORDER BY created_at_ms,id`).all(attemptId);
  for (const handle of handles) persistence.recordStop(handle, { passageId: handle.passageId, state: 'confirmed' });
}

/** Models a Reviewer whose OMP stop cannot be confirmed after the given number of healthy review passages. */
export function leaveReviewerStopUnconfirmed(fixture: Pick<AttemptFixture, 'db' | 'persistence' | 'execution'>, healthyReviews = 0): void {
  const seen = new Set<string>();
  vi.mocked(fixture.execution.preparePassageHandoff).mockImplementation(async source => {
    const row = fixture.db.prepare<[string], { role: string }>('SELECT role FROM passages WHERE id=?').get(source.passageId);
    if (row?.role === 'reviewer') {
      seen.add(source.passageId);
      if (seen.size > healthyReviews) throw new Error('Reviewer stop unconfirmed');
    }
    fixture.persistence.recordStop(source, { passageId: source.passageId, state: 'confirmed' });
  });
}
