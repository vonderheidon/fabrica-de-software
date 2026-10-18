import { Value } from '@sinclair/typebox/value';
import {
  CatalogQuery, PreparationChoices, PreparationUpdate,
  type ConfigurationView, type EffectiveConfiguration, type IssueOptions, type Preparation, type StoredExecutionProfile,
  type PreparationRecord, type Prerequisite, type IssueContext,
} from '#contracts';
import { assessIssueReadiness, type GitHub } from '../github/index.js';
import { OperationError, type PreparationCommand, type Storage } from '../storage/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { validateProjectConfiguration, type CommandContext } from './index.js';
import { interpretIssue, preparationDigest } from '../pipeline/index.js';

type PreparationObservation = Omit<Preparation, 'issue'> & { issue: IssueContext | null };

export interface PreparationDependencies {
  storage: Storage;
  github: Pick<GitHub, 'getIdentity' | 'getProject' | 'listProjectItems' | 'getIssueContextById'>;
  workspaces: Pick<Workspaces, 'inspectOrigin'>;
}
function fail(status: 400 | 404 | 409 | 412 | 428 | 503, code: string, message: string): never { throw new OperationError(status, code, message); }
function prerequisite(code: string): Prerequisite {
  return { code, message: `Preparation requires attention: ${code}.`, recovery: 'Review the issue, account, committed base and configuration; refresh the preparation before starting.' };
}
function profileSnapshot(profile: StoredExecutionProfile) {
  const { profile_type: _profileType, ...snapshot } = profile;
  return snapshot;
}
function effective(view: ConfigurationView, choices: PreparationChoices): { configuration: EffectiveConfiguration; reasons: string[] } {
  const overrides = choices.overrides; const reasons: string[] = [];
  function selectedProfileId(role: 'implementer' | 'reviewer'): string | null {
    const choice = overrides[`${role}_profile`];
    if (choice?.kind === 'value') return null;
    return choice?.kind === 'reference' ? choice.id : view.configuration[`${role}_profile_id`];
  }
  const implementerProfileId = selectedProfileId('implementer');
  const reviewerProfileId = selectedProfileId('reviewer');
  const sharedProfileId = implementerProfileId !== null && implementerProfileId === reviewerProfileId ? implementerProfileId : null;
  function profile(role: 'implementer' | 'reviewer') {
    const choice = overrides[`${role}_profile`];
    if (choice?.kind === 'value') return structuredClone(choice.profile);
    const id = selectedProfileId(role);
    const found = view.profiles.find((candidate) => candidate.id === id);
    if (found && found.profile_type !== role && id !== sharedProfileId) {
      reasons.push(choice ? 'PROFILE_TYPE_MISMATCH' : 'PROJECT_PROFILE_TYPE_MISMATCH');
      return null;
    }
    if (!found || (choice?.kind === 'reference' && found.revision !== choice.revision)) {
      reasons.push(choice ? 'PROFILE_REFERENCE_CHANGED' : 'PROFILES_REQUIRED'); return null;
    }
    return structuredClone(profileSnapshot(found));
  }
  const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...project } = view.configuration;
  const config = { ...project, base_branch: overrides.base_branch ?? project.base_branch, checks: overrides.checks ?? project.checks,
    correction_limit: overrides.correction_limit ?? project.correction_limit, default_delivery_mode: choices.delivery_mode };
  validateProjectConfiguration(config);
  return { reasons, configuration: {
    configuration: config, project_revision_id: view.configuration.id, settings_revision: view.settings.revision,
    implementer_profile: profile('implementer'), reviewer_profile: profile('reviewer'),
    time_defaults: overrides.time_defaults ?? view.settings.time_defaults,
    artifact_policy: overrides.artifact_policy ?? view.settings.artifact_policy,
    guidance: [project.guidance, choices.guidance].filter(Boolean).join('\n'),
    origins: { base_branch: overrides.base_branch !== undefined ? 'preparation' : 'project',
      implementer_profile: overrides.implementer_profile ? 'preparation' : 'project', reviewer_profile: overrides.reviewer_profile ? 'preparation' : 'project',
      checks: overrides.checks !== undefined ? 'preparation' : 'project', correction_limit: overrides.correction_limit !== undefined ? 'preparation' : 'project',
      time_defaults: overrides.time_defaults ? 'preparation' : 'global',
      artifact_policy: overrides.artifact_policy ? 'preparation' : 'global', guidance: choices.guidance ? 'preparation' : 'project', delivery_mode: 'preparation' },
  } };
}
function effects(mode: PreparationChoices['delivery_mode']): Preparation['effects_preview'] {
  return [
    { kind: 'clone', requested: true, description: 'Create an independent implementation clone from the fixed committed base.' },
    { kind: 'execute', requested: true, description: 'Run implementation, checks and independent review in owned environments.' },
    { kind: 'local_commit', requested: mode !== 'icr', description: 'Create a local delivery commit after approval, when there is a delta.' },
    { kind: 'push', requested: mode === 'pr', description: 'Push the approved version to its own remote branch.' },
    { kind: 'pull_request', requested: mode === 'pr', description: 'Create a pull request for the approved version when applicable.' },
    { kind: 'issue_comment', requested: mode !== 'pr', description: 'Record the delivery result in an issue comment for modes without a pull request, without editing criteria.' },
    { kind: 'project_status', requested: true, description: 'Project the attempt progress and completed delivery to the configured Project.' },
  ];
}

export function createPreparations({ storage, github, workspaces }: PreparationDependencies) {
  async function observe(record: PreparationRecord, view: ConfigurationView): Promise<PreparationObservation> {
    const resolved = effective(view, record); const config = resolved.configuration.configuration;
    const [identity, issueResult, origin, project] = await Promise.all([
      github.getIdentity(), github.getIssueContextById(record.issue_id),
      workspaces.inspectOrigin({ source: config.source, baseBranch: config.base_branch }),
      config.github_project ? github.getProject(config.github_project.id) : Promise.resolve(null),
    ]);
    const issue = issueResult.state === 'complete' && issueResult.data && 'repository' in issueResult.data ? issueResult.data : null;
    const reasons = [...resolved.reasons];
    if (!view.settings.account_id) reasons.push('ACCOUNT_UNOBSERVED');
    if (identity.state !== 'complete' || !identity.data || issueResult.state !== 'complete') reasons.push('READ_INCOMPLETE');
    if (identity.data && identity.data.id !== view.settings.account_id) reasons.push('ACCOUNT_CHANGED');
    if (!view.settings.projects_root) reasons.push('PROJECTS_ROOT_REQUIRED');
    if (record.project_revision_id !== view.configuration.id) reasons.push('PROJECT_CONFIGURATION_CHANGED');
    if (origin.state !== 'identified' || !origin.remote?.confirmed || !origin.base || !config.source.repository_id ||
      origin.remote.repository?.id !== config.source.repository_id || origin.remote.repository.isArchived) reasons.push('REMOTE_UNCONFIRMED');
    for (const diagnostic of origin.diagnostics) if (!['LOCAL_CHANGES_EXCLUDED', 'PROJECT_REQUIRED'].includes(diagnostic.code)) reasons.push(diagnostic.code);
    if (origin.base?.branch !== config.base_branch) reasons.push('BASE_BRANCH_INVALID');
    if (!origin.remote?.branch) reasons.push('BASE_UNCONFIRMED');
    else if (origin.base && origin.remote.branch.sha !== origin.base.sha) reasons.push('REMOTE_MISMATCH');
    if (!config.github_project) reasons.push('PROJECT_REQUIRED');
    if (project && config.github_project) {
      reasons.push(...assessIssueReadiness({ identity, issue: issueResult, project,
        expectedAccountId: view.settings.account_id ?? '', repositoryId: config.source.repository_id ?? '',
        projectId: config.github_project.id, statusFieldId: config.github_project.status_field_id,
        readyOptionId: record.previous_attempt_id ? issue?.memberships.find(m => m.projectId === config.github_project?.id)?.statusValues.find(v => v.fieldId === config.github_project?.status_field_id)?.optionId ?? config.github_project.status_option_ids.ready : config.github_project.status_option_ids.ready }).reasons);
      if (project.data?.project.owner.id !== config.github_project.owner_id) reasons.push('PROJECT_OWNER_MISMATCH');
      const field = project.data?.singleSelectFields.find((candidate) => candidate.id === config.github_project?.status_field_id);
      if (!field || Object.values(config.github_project.status_option_ids).some((id) => !field.options.some((option) => option.id === id))) reasons.push('STATUS_MAPPING_INVALID');
    }
    if (!issue || issue.id !== record.issue_id || issue.repository.id !== config.source.repository_id) reasons.push('ISSUE_CONTEXT_INVALID');
    if (issue?.repository.isArchived) reasons.push('REPOSITORY_ARCHIVED');
    const criteria = interpretIssue(issue ?? { title: '', body: '' }); reasons.push(...criteria.reasons);
    // This sprint provides a reviewable preview, never an accepted start without an executor.
    reasons.push('EXECUTOR_REVALIDATION_REQUIRED');
    const diagnostics = [...identity.diagnostics, ...issueResult.diagnostics, ...(project?.diagnostics ?? []), ...origin.githubDiagnostics];
    if (record.previous_attempt_id) {
      storage.validatePreviousAttempt(record.previous_attempt_id, record.project_id, record.issue_id);
    }
    const prerequisites = [...new Set(reasons)].map(prerequisite);
    const effectsPreview = effects(record.delivery_mode);
    const baseSha = origin.base?.sha ?? null;
    const summaryHash = preparationDigest({ version: 1, preparation: [record.id, record.revision, record.project_revision_id],
      account: [view.settings.account_id, identity.state, identity.data?.id ?? null],
      issue: issue ? { id: issue.id, number: issue.number, url: issue.url, title: issue.title, repositoryId: issue.repository.id,
        objective: criteria.objective, criteriaDigest: criteria.digest, references: issue.references,
        state: issue.state, assignees: issue.assignees.map((a) => a.id).sort(), blockers: issue.blockers, memberships: issue.memberships } : null,
      baseSha, configuration: resolved.configuration, deliveryMode: record.delivery_mode, effectsPreview, prerequisites });
    return { ...record, prerequisites, effective_configuration: resolved.configuration, criteria_preview: criteria, effects_preview: effectsPreview,
      issue, base_sha: baseSha, summary_hash: summaryHash, diagnostics,
      retry_at_ms: [identity.retryAtMs, issueResult.retryAtMs, project?.retryAtMs, origin.retryAtMs].reduce<number | null>((max, value) => value === null || value === undefined ? max : Math.max(max ?? 0, value), null),
      can_start: false };
  }
  async function getPreparation(id: string) {
    const saved = storage.getPreparation(id); const config = storage.getConfiguration(saved.view.project_id);
    const preparation = await observe(saved.view, config.view);
    // An old async response is never presented as the current saved revision.
    if (storage.getPreparation(id).etag !== saved.etag || storage.getConfiguration(saved.view.project_id).etag !== config.etag) {
      fail(412, 'REVISION_CONFLICT', 'Preparation or configuration changed during the query. Reload current data.');
    }
    return { view: { preparation, event_cursor: saved.eventCursor }, etag: saved.etag };
  }
  async function save(command: PreparationCommand) {
    const recovered = storage.recoverPreparationCommand(command);
    if (recovered) {
      if (!recovered.receipt) fail(503, 'OPERATION_NOT_DURABLE', 'Preparation receipt is unavailable.');
      return { ...await getPreparation(recovered.resource.id), operationId: recovered.operation_id, receipt: recovered.receipt };
    }
    const previous = command.kind === 'preparation.update' ? storage.getPreparation(command.preparationId) : null;
    if (previous && command.expectedRevision === undefined) fail(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    if (previous && command.expectedRevision !== previous.etag) fail(412, 'REVISION_CONFLICT', 'Preparation changed. Reload and reapply your draft.');
    const projectId = command.kind === 'preparation.create' ? command.projectId : previous!.view.project_id;
    const config = storage.getConfiguration(projectId);
    const choices: PreparationChoices = command.kind === 'preparation.create' ? command.body : { ...previous!.view, ...command.body.changes };
    if (choices.previous_attempt_id) storage.validatePreviousAttempt(choices.previous_attempt_id, projectId, choices.issue_id);
    const resolved = effective(config.view, choices);
    if (resolved.reasons.includes('PROFILE_REFERENCE_CHANGED')) fail(409, 'PROFILE_REFERENCE_CHANGED', 'The exact selected profile revision is unavailable.');
    if (resolved.reasons.includes('PROFILE_TYPE_MISMATCH') || resolved.reasons.includes('PROJECT_PROFILE_TYPE_MISMATCH')) {
      fail(409, 'PROFILE_TYPE_MISMATCH', 'As escolhas de Implementador e Revisor precisam usar perfis do papel correspondente.');
    }
    const issue = await github.getIssueContextById(choices.issue_id);
    if (issue.state === 'invalid_input') fail(400, 'NOT_AN_ISSUE', 'Select an accessible GitHub issue by its node ID.');
    if (issue.state !== 'complete' || !issue.data) fail(issue.state === 'inaccessible' ? 404 : 503, 'ISSUE_UNAVAILABLE', 'A complete issue observation is required to save this selection.');
    if (!('repository' in issue.data) || issue.data.id !== choices.issue_id) fail(400, 'NOT_AN_ISSUE', 'Select an executable issue rather than a pull request or draft.');
    if (!config.view.configuration.source.repository_id || issue.data.repository.id !== config.view.configuration.source.repository_id) fail(409, 'REPOSITORY_MISMATCH', 'The selected issue must belong to the configured repository.');
    const operation = storage.savePreparation({ command, configurationETag: config.etag });
    if (!operation.receipt || operation.state !== 'succeeded') fail(503, 'OPERATION_NOT_DURABLE', 'The preparation could not be confirmed.');
    return { ...await getPreparation(operation.resource.id), operationId: operation.operation_id, receipt: operation.receipt };
  }
  return {
    getPreparation,
    async createPreparation(projectId: string, body: PreparationChoices, context: CommandContext) {
      if (!Value.Check(PreparationChoices, body)) fail(400, 'PREPARATION_INVALID', 'Preparation choices are invalid.');
      return save({ ...context, kind: 'preparation.create', projectId, body });
    },
    async updatePreparation(preparationId: string, body: PreparationUpdate, context: CommandContext) {
      if (!Value.Check(PreparationUpdate, body)) fail(400, 'PREPARATION_INVALID', 'Preparation changes are invalid.');
      return save({ ...context, kind: 'preparation.update', preparationId, body });
    },
    async revalidateSummary(input: { preparationId: string; preparationRevision: number; authorizedSummaryHash: string }) {
      const current = await getPreparation(input.preparationId);
      if (current.view.preparation.revision !== input.preparationRevision || current.view.preparation.summary_hash !== input.authorizedSummaryHash) {
        fail(409, 'SUMMARY_CHANGED', 'The material start summary changed. Review the current preparation.');
      }
      return current;
    },
    async listIssues(projectId: string, query: CatalogQuery): Promise<IssueOptions> {
      if (!Value.Check(CatalogQuery, query)) fail(400, 'ISSUE_QUERY_INVALID', 'Issue query is invalid.');
      const config = storage.getConfiguration(projectId); const mapping = config.view.configuration.github_project;
      if (!mapping) return { items: [], next_cursor: null, has_more: false, event_cursor: config.view.event_cursor, completeness: 'unavailable', diagnostics: [], retry_at_ms: null, prerequisites: [prerequisite('PROJECT_REQUIRED')] };
      const observation = await github.listProjectItems(mapping.id);
      if (storage.getConfiguration(projectId).etag !== config.etag) fail(412, 'REVISION_CONFLICT', 'Configuration changed during issue selection.');
      const search = (query.search ?? '').toLocaleLowerCase('en');
      const items = (observation.data ?? []).filter((item) => (item.title ?? '').toLocaleLowerCase('en').includes(search)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        .map(({ contentId, ...item }) => ({ ...item, content_id: contentId, executable: item.kind === 'issue' && !item.archived && observation.state === 'complete',
          reasons: item.kind !== 'issue' ? ['NOT_AN_ISSUE'] : item.archived ? ['PROJECT_ITEM_ARCHIVED'] : ['ISSUE_REVALIDATION_REQUIRED'] }));
      const scope = preparationDigest([config.view.settings.installation_id, config.view.settings.account_id, projectId, config.etag, search, observation.state, items]);
      let offset = 0;
      if (query.cursor) {
        let cursor: unknown;
        try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as unknown; } catch { fail(400, 'CURSOR_INVALID', 'Issue cursor is invalid.'); }
        if (!cursor || typeof cursor !== 'object' || !('scope' in cursor) || cursor.scope !== scope || !('offset' in cursor) || typeof cursor.offset !== 'number' || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || cursor.offset >= items.length) fail(409, 'ISSUE_OPTIONS_CHANGED', 'Issue options changed. Reload the first page.');
        offset = cursor.offset;
      }
      const limit = Number(query.limit ?? '25'); const hasMore = offset + limit < items.length;
      return { items: items.slice(offset, offset + limit), has_more: hasMore, next_cursor: hasMore ? Buffer.from(JSON.stringify({ scope, offset: offset + limit })).toString('base64url') : null,
        event_cursor: config.view.event_cursor, completeness: observation.state === 'complete' ? 'complete' : observation.data ? 'partial' : 'unavailable',
        diagnostics: observation.diagnostics, retry_at_ms: observation.retryAtMs, prerequisites: [prerequisite('ISSUE_REVALIDATION_REQUIRED')] };
    },
  };
}
export type Preparations = ReturnType<typeof createPreparations>;
