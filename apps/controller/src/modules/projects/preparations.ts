import { Value } from '@sinclair/typebox/value';
import {
  CatalogQuery, PreparationChoices, PreparationUpdate,
  type ConfigurationView, type EffectiveConfiguration, type IssueOptions, type Preparation, type StoredExecutionProfile,
  type PreparationRecord, type Prerequisite, type IssueContext,
} from '#contracts';
import { assessIssueReadiness, type GitHub } from '../github/index.js';
import { isLocalAbsoluteTargetPath, OperationError, publicationTargetHash, publicationTargetPath, type PreparationCommand, type Storage } from '../storage/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { validateProjectConfiguration, type CommandContext } from './index.js';
import { interpretIssue, preparationDigest, issueContentPrerequisite } from '../pipeline/index.js';
import { matchesObservedV3StatusMapping } from './status-mapping.js';

type PreparationObservation = Omit<Preparation, 'issue'> & { issue: IssueContext | null };

export interface PreparationDependencies {
  storage: Storage;
  github: Pick<GitHub, 'getIdentity' | 'getProject' | 'listProjectItems' | 'getIssueContextById'>;
  workspaces: Pick<Workspaces, 'inspectOrigin'>;
}
function fail(status: 400 | 404 | 409 | 412 | 428 | 503, code: string, message: string): never { throw new OperationError(status, code, message); }
function prerequisite(code: string): Prerequisite {
  const content = issueContentPrerequisite(code);
  if (content) return content;
  if (code === 'PUBLICATION_TARGET_REQUIRED') return { code,
    message: 'Esta issue por URL exige um destino local para Commit local ou Pull request.',
    recovery: 'Escolha um clone existente ou um caminho para criar o clone no destino da versão aprovada, salve e revise o resumo novamente.' };
  if (code === 'PUBLICATION_TARGET_INVALID') return { code,
    message: 'O destino salvo não corresponde ao repositório atual ou não é um caminho local absoluto válido.',
    recovery: 'Selecione novamente o repositório e o caminho do destino na preparação.' };
  if (code === 'PROFILE_COMPOSITION_REQUIRED') return { code,
    message: 'Um dos perfis ainda não tem instruções efetivas compatíveis.',
    recovery: 'Abra Configuração > Perfis, ajuste as instruções ao limite de 8.192 caracteres e salve o perfil antes de iniciar.' };
  if (code === 'PROJECT_DELETION_PENDING') return { code, message: 'Este projeto tem uma exclusão pendente.',
    recovery: 'Acompanhe a exclusão deste projeto e aguarde sua conclusão.' };
  if (code === 'REMOTE_UNCONFIRMED') return { code, message: 'A origem GitHub do projeto ainda não foi confirmada.',
    recovery: 'Configure um remoto GitHub acessível e confirme que ele identifica o repositório deste projeto.' };
  if (code === 'CODE_NOT_PUBLISHED') return { code, message: 'O commit da branch-base ainda não está publicado e confirmado no GitHub.',
    recovery: 'Publique a branch-base no repositório configurado e consulte a preparação novamente.' };
  if (code === 'PROJECT_REQUIRED') return { code, message: 'O projeto ainda não tem um quadro GitHub vinculado.',
    recovery: 'Selecione um GitHub Project acessível, vincule o repositório e configure o campo Status.' };
  if (code === 'STATUS_MAPPING_INVALID') return { code, message: 'O quadro ou uma das cinco opções de Status configuradas não está acessível.',
    recovery: 'Confira o quadro, o campo Status e as cinco opções atuais na configuração do projeto.' };
  if (code === 'BASE_BRANCH_INVALID') return { code, message: 'A branch-base configurada não corresponde à branch confirmada no remoto.',
    recovery: 'Escolha uma branch existente e atualizada no repositório GitHub e salve a configuração.' };
  return { code, message: `Preparation requires attention: ${code}.`, recovery: 'Review the issue, account, committed base and configuration; refresh the preparation before starting.' };
}
function profileSnapshot(profile: StoredExecutionProfile) {
  const { profile_type: _profileType, ...snapshot } = profile;
  return { ...snapshot, guidance: redactProfileGuidance(snapshot.guidance) };
}
function redactProfileGuidance(value: string): string {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/(https?:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi, '$1[REDACTED]@')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g, '[REDACTED CREDENTIAL]')
    .replace(/\b(authorization|cookie|set-cookie|x-csrf-token|password|secret|token|api[_-]?key)\b\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]');
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
    if (choice?.kind === 'value') return { ...structuredClone(choice.profile), guidance: redactProfileGuidance(choice.profile.guidance), composition_version: 1 };
    const id = selectedProfileId(role);
    const found = view.profiles.find((candidate) => candidate.id === id);
    if (found && found.profile_type !== role && id !== sharedProfileId) {
      reasons.push(choice ? 'PROFILE_TYPE_MISMATCH' : 'PROJECT_PROFILE_TYPE_MISMATCH');
      return null;
    }
    if (!found || (choice?.kind === 'reference' && found.revision !== choice.revision)) {
      reasons.push(choice ? 'PROFILE_REFERENCE_CHANGED' : 'PROFILES_REQUIRED'); return null;
    }
    if (found.composition_version !== 1) { reasons.push('PROFILE_COMPOSITION_REQUIRED'); return null; }
    return structuredClone(profileSnapshot(found));
  }
  const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...project } = view.configuration;
  const config = { ...project, base_branch: overrides.base_branch ?? project.base_branch,
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
      correction_limit: overrides.correction_limit !== undefined ? 'preparation' : 'project',
      time_defaults: overrides.time_defaults ? 'preparation' : 'global',
      artifact_policy: overrides.artifact_policy ? 'preparation' : 'global', guidance: choices.guidance ? 'preparation' : 'project', delivery_mode: 'preparation' },
  } };
}
function effects(mode: PreparationChoices['delivery_mode'], target: PreparationRecord['publication_target'], repository: string, urlSource: boolean): Preparation['effects_preview'] {
  const targetDescription = !target ? 'Nenhum destino local de entrega foi selecionado.'
    : target.selection.kind === 'clone' ? `Clonar ${repository} no destino local ${target.selection.destination}.`
      : `Usar o clone existente de ${repository} em ${target.selection.path}.`;
  return [
    { kind: 'clone', requested: true, description: 'Create an independent implementation clone from the fixed committed base.' },
    { kind: 'execute', requested: true, description: 'Run implementation, checks and independent review in owned environments.' },
    { kind: 'local_commit', requested: mode !== 'icr', description: 'Create a local delivery commit after approval, when there is a delta.' },
    { kind: 'push', requested: mode === 'pr', description: 'Push the approved version to its own remote branch.' },
    { kind: 'pull_request', requested: mode === 'pr', description: 'Create a pull request for the approved version when applicable.' },
    { kind: 'issue_comment', requested: mode !== 'pr', description: 'Record the delivery result in an issue comment for modes without a pull request, without editing criteria.' },
    { kind: 'project_status', requested: true, description: 'Project the attempt progress and completed delivery to the configured Project.' },
    { kind: 'publication_target', requested: urlSource && mode !== 'icr' && target !== null, description: !urlSource && target
      ? 'Projetos locais usam o clone cadastrado; limpe a intenção de destino adicional.'
      : mode === 'icr' && target ? `${targetDescription} O modo ICR não executará nem autorizará esse efeito.` : targetDescription },
  ];
}

export function createPreparations({ storage, github, workspaces }: PreparationDependencies) {
  async function observe(record: PreparationRecord, view: ConfigurationView): Promise<PreparationObservation> {
    const resolved = effective(view, record); const config = resolved.configuration.configuration;
    const [identity, issueResult, origin, project] = await Promise.all([
      github.getIdentity(), github.getIssueContextById(record.issue_id),
      workspaces.inspectOrigin({ source: { kind: config.source.kind, location: config.source.location }, baseBranch: config.base_branch }),
      config.github_project ? github.getProject(config.github_project.id) : Promise.resolve(null),
    ]);
    const issue = issueResult.state === 'complete' && issueResult.data && 'repository' in issueResult.data ? issueResult.data : null;
    const reasons = [...resolved.reasons];
    if (record.delivery_mode === 'pr' && config.delivery_branch?.name === config.base_branch) reasons.push('PR_BRANCH_EQUALS_BASE');
    const target = record.publication_target;
    const targetValid = target === null || config.source.kind === 'github' && target.repository_id === config.source.repository_id && isLocalAbsoluteTargetPath(publicationTargetPath(target));
    const targetRequired = config.source.kind === 'github' && record.delivery_mode !== 'icr';
    if (!targetValid) reasons.push('PUBLICATION_TARGET_INVALID');
    else if (targetRequired && !target) reasons.push('PUBLICATION_TARGET_REQUIRED');
    if (view.prerequisites.some(item => item.code === 'PROJECT_DELETION_PENDING')) reasons.push('PROJECT_DELETION_PENDING');
    if (!view.settings.account_id) reasons.push('ACCOUNT_UNOBSERVED');
    if (identity.state !== 'complete' || !identity.data || issueResult.state !== 'complete') reasons.push('READ_INCOMPLETE');
    if (identity.data && identity.data.id !== view.settings.account_id) reasons.push('ACCOUNT_CHANGED');
    if (!view.settings.projects_root) reasons.push('PROJECTS_ROOT_REQUIRED');
    if (record.project_revision_id !== view.configuration.id) reasons.push('PROJECT_CONFIGURATION_CHANGED');
    const remoteConfirmed = origin.state === 'identified' && Boolean(origin.remote?.confirmed && origin.remote.repository && config.source.repository_id &&
      origin.remote.repository.id === config.source.repository_id && !origin.remote.repository.isArchived);
    if (!remoteConfirmed) reasons.push('REMOTE_UNCONFIRMED');
    const basePublished = remoteConfirmed && Boolean(origin.base && (origin.base.observedFrom === 'local' || origin.remote?.branch && origin.base.branch === config.base_branch &&
      origin.remote.branch.name === config.base_branch && origin.remote.branch.repositoryId === config.source.repository_id &&
      origin.remote.branch.sha === origin.base.sha));
    if (remoteConfirmed && !basePublished) reasons.push('CODE_NOT_PUBLISHED');
    for (const diagnostic of origin.diagnostics) {
      if (['LOCAL_CHANGES_EXCLUDED', 'PROJECT_REQUIRED', 'REMOTE_MISSING', 'REMOTE_UNCONFIRMED', 'BRANCH_NOT_FOUND', 'BASE_UNCONFIRMED', 'REMOTE_MISMATCH'].includes(diagnostic.code)) continue;
      if (diagnostic.code === 'BRANCH_INVALID') { reasons.push('BASE_BRANCH_INVALID'); continue; }
      reasons.push(diagnostic.code);
    }
    if (!config.github_project) reasons.push('PROJECT_REQUIRED');
    if (project && config.github_project) {
      reasons.push(...assessIssueReadiness({ identity, issue: issueResult, project,
        expectedAccountId: view.settings.account_id ?? '', repositoryId: config.source.repository_id ?? '',
        projectId: config.github_project.id, statusFieldId: config.github_project.status_field_id,
        readyOptionId: record.previous_attempt_id ? issue?.memberships.find(m => m.projectId === config.github_project?.id)?.statusValues.find(v => v.fieldId === config.github_project?.status_field_id)?.optionId ?? config.github_project.status_option_ids.ready : config.github_project.status_option_ids.ready }).reasons);
      if (project.data?.project.owner.id !== config.github_project.owner_id) reasons.push('PROJECT_OWNER_MISMATCH');
      if (!project.data || !matchesObservedV3StatusMapping(config.github_project, project.data)) reasons.push('STATUS_MAPPING_INVALID');
    }
    if (!issue || issue.id !== record.issue_id || issue.repository.id !== config.source.repository_id) reasons.push('ISSUE_CONTEXT_INVALID');
    if (issue?.repository.isArchived) reasons.push('REPOSITORY_ARCHIVED');
    const criteria = interpretIssue(issue ?? { title: '', body: '' }); reasons.push(...criteria.reasons);
    // This sprint provides a reviewable preview, never an accepted start without an executor.
    reasons.push('EXECUTOR_REVALIDATION_REQUIRED');
    const diagnostics = [...identity.diagnostics, ...issueResult.diagnostics, ...(project?.diagnostics ?? []), ...origin.githubDiagnostics];
    if (record.previous_attempt_id) {
      storage.validatePreviousAttempt(record.previous_attempt_id, record.project_id, record.issue_id, record.id);
    }
    const prerequisites = [...new Set(reasons)].map(prerequisite);
    const repositoryLabel = issue ? `${issue.repository.owner.login}/${issue.repository.name}` : 'repositório da issue atual';
    const effectsPreview = effects(record.delivery_mode, target, repositoryLabel, config.source.kind === 'github');
    const baseSha = origin.base?.sha ?? null;
    const summaryHash = preparationDigest({ version: 1, preparation: [record.id, record.revision, record.project_revision_id],
      account: [view.settings.account_id, identity.state, identity.data?.id ?? null],
      issue: issue ? { id: issue.id, number: issue.number, url: issue.url, title: issue.title, repositoryId: issue.repository.id,
        objective: criteria.objective, criteriaDigest: criteria.digest, references: issue.references,
        state: issue.state, assignees: issue.assignees.map((a) => a.id).sort(), blockers: issue.blockers, memberships: issue.memberships } : null,
      baseSha, configuration: resolved.configuration, deliveryMode: record.delivery_mode,
      publicationTarget: target, publicationTargetHash: publicationTargetHash(target), effectsPreview, prerequisites });
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
    const deletion = config.view.prerequisites.find(item => item.code === 'PROJECT_DELETION_PENDING');
    if (deletion) throw new OperationError(409, deletion.code, deletion.message, { recovery: deletion.recovery });
    const choices: PreparationChoices = command.kind === 'preparation.create' ? command.body : { ...previous!.view, ...command.body.changes };
    if (choices.publication_target) {
      const target = choices.publication_target;
      if (config.view.configuration.source.kind !== 'github' || target.repository_id !== config.view.configuration.source.repository_id || !isLocalAbsoluteTargetPath(publicationTargetPath(target))) {
        fail(409, 'PUBLICATION_TARGET_INVALID', 'O destino precisa pertencer ao repositório deste projeto e usar um caminho local absoluto válido.');
      }
    }
    if (choices.previous_attempt_id) storage.validatePreviousAttempt(choices.previous_attempt_id, projectId, choices.issue_id, previous?.view.id);
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
    async prepareDecisionSuccessor(attemptId: string, role: 'implementer' | 'reviewer', profileId: string, profileRevision: number) {
      const attempt = storage.getAttempt(attemptId); const block = storage.getAttemptBlock(attemptId);
      if (attempt.result !== null || attempt.suspension !== 'CORRECTION_BLOCKED' || !block || !attempt.deliveryId) {
        fail(409, 'ATTEMPT_DECISION_NOT_CURRENT', 'The attempt no longer has a current correction block.');
      }
      const capture = storage.getAttemptCapture(attemptId); const previous = storage.getPreparation(capture.preparationId).view;
      const config = storage.getConfiguration(previous.project_id);
      const choices: PreparationChoices = {
        issue_id: capture.issue.id, delivery_mode: previous.delivery_mode, guidance: previous.guidance,
        publication_target: previous.publication_target,
        overrides: { ...previous.overrides, [`${role}_profile`]: { kind: 'reference', id: profileId, revision: profileRevision },
          correction_limit: capture.configuration.configuration.correction_limit },
        previous_attempt_id: attemptId,
      };
      const selectedProfile = config.view.profiles.find(profile => profile.id === profileId);
      if (!selectedProfile || selectedProfile.profile_type !== role) fail(409, 'PROFILE_TYPE_MISMATCH', 'O perfil escolhido não corresponde ao papel solicitado.');
      if (selectedProfile.revision !== profileRevision) fail(409, 'PROFILE_REFERENCE_CHANGED', 'A revisão exata do perfil selecionado não está mais atual.');
      const resolved = effective(config.view, choices);
      if (resolved.reasons.includes('PROFILE_REFERENCE_CHANGED')) fail(409, 'PROFILE_REFERENCE_CHANGED', 'A revisão exata do perfil selecionado não está mais atual.');
      if (resolved.reasons.includes('PROFILE_TYPE_MISMATCH') || resolved.reasons.includes('PROJECT_PROFILE_TYPE_MISMATCH')) {
        fail(409, 'PROFILE_TYPE_MISMATCH', 'O perfil escolhido não corresponde ao papel solicitado.');
      }
      const issue = await github.getIssueContextById(capture.issue.id);
      if (issue.state === 'invalid_input') fail(400, 'NOT_AN_ISSUE', 'The successor must reference the captured issue.');
      if (issue.state !== 'complete' || !issue.data) fail(issue.state === 'inaccessible' ? 404 : 503, 'ISSUE_UNAVAILABLE', 'A complete issue observation is required to prepare the successor.');
      if (!('repository' in issue.data) || issue.data.id !== capture.issue.id || issue.data.repository.id !== config.view.configuration.source.repository_id) {
        fail(409, 'REPOSITORY_MISMATCH', 'The successor must remain on the captured issue and repository.');
      }
      if (storage.getAttempt(attemptId).revision !== attempt.revision || storage.getConfiguration(previous.project_id).etag !== config.etag ||
        storage.getAttemptBlock(attemptId)?.id !== block.id) fail(412, 'REVISION_CONFLICT', 'The attempt or project changed while preparing its successor.');
      return { projectId: previous.project_id, configurationETag: config.etag, body: choices };
    },
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
      const items = (observation.data ?? []).filter((item) => item.kind === 'issue' && !item.archived &&
        item.status?.fieldId === mapping.status_field_id && item.status.optionId === mapping.status_option_ids.ready &&
        (item.title ?? '').toLocaleLowerCase('en').includes(search)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        .map(({ contentId, status: _status, ...item }) => ({ ...item, content_id: contentId, executable: item.kind === 'issue' && !item.archived && observation.state === 'complete',
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
