import { storeCheck, storeStatusOptions, storeQueueOrder } from './configuration-json.js';
import { configurationCommandJson, registrationCommandJson, settingsCommandJson } from './configuration-command-json.js';
import { serializeOperationReceipt, storeTimeDefaults, storeArtifactPolicy } from './common-json.js';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import {
  ConfigurationUpdate, FactorySettings, GlobalChanges, GitHubAccount, OperationId, ProjectConfiguration, ProjectRegistration, SettingsUpdate,
  OnboardingChanges, type ProfileChanges, type ProfileCreate, type ProfileType, type SettingsView,
} from '#contracts';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { readSettings } from './settings.js';
import { configurationETag, digest, guarded, readConfiguration, readSettingsView } from './configuration-reads.js';
import { assertProjectProfileRoles } from './profile-integrity.js';
import { assertProjectAvailable, assertDeletionPathsAvailable } from './project-deletion-barrier.js';
import { assertProjectConfigurationEditable } from './project-configuration-lock.js';

interface ProfileReferenceBlockers { readonly count: number; readonly projectIds: readonly string[] }

function currentProjectReferences(db: Database.Database, profileId: string, excludedProjectId?: string): ProfileReferenceBlockers {
  const relation = `FROM projects p JOIN project_revisions r ON r.id = p.current_revision_id AND r.project_id = p.id
    WHERE (r.implementer_profile_id = ? OR r.reviewer_profile_id = ?)`;
  let count: number;
  let projectIds: string[];
  if (excludedProjectId) {
    const where = `${relation} AND p.id <> ?`;
    count = db.prepare<[string, string, string], { count: number }>(`SELECT count(DISTINCT p.id) AS count ${where}`).get(profileId, profileId, excludedProjectId)?.count ?? 0;
    projectIds = db.prepare<[string, string, string], { id: string }>(`SELECT DISTINCT p.id ${where} ORDER BY p.id LIMIT 50`)
      .all(profileId, profileId, excludedProjectId).map((row) => row.id);
  } else {
    count = db.prepare<[string, string], { count: number }>(`SELECT count(DISTINCT p.id) AS count ${relation}`).get(profileId, profileId)?.count ?? 0;
    projectIds = db.prepare<[string, string], { id: string }>(`SELECT DISTINCT p.id ${relation} ORDER BY p.id LIMIT 50`)
      .all(profileId, profileId).map((row) => row.id);
  }
  return { count, projectIds };
}

function aggregateProjectCanUseProfile(configuration: ProjectConfiguration, profileId: string, profileType: ProfileType): boolean {
  const implementer = configuration.implementer_profile_id === profileId;
  const reviewer = configuration.reviewer_profile_id === profileId;
  if (!implementer && !reviewer) return true;
  if (implementer && reviewer) return true;
  return profileType === (implementer ? 'implementer' : 'reviewer');
}

function throwProjectProfileBlock(code: 'PROFILE_DELETE_BLOCKED' | 'PROFILE_TYPE_CHANGE_BLOCKED', profileId: string, blockers: ProfileReferenceBlockers): never {
  throw new OperationError(409, code, code === 'PROFILE_DELETE_BLOCKED'
    ? 'Este perfil é padrão em uma ou mais configurações atuais de projeto.'
    : 'Este tipo de perfil é usado por uma ou mais configurações atuais de projeto.', {
    facts: {
      profile_id: profileId,
      blocking_project_count: blockers.count,
      blocking_project_ids: blockers.projectIds.join(','),
      blocking_project_ids_truncated: blockers.count > blockers.projectIds.length,
    },
    affected_requirements: ['RF-77', 'RF-78', 'RF-79'],
    recovery: 'Altere os projetos listados para usar perfis com os papéis corretos e tente novamente.',
  });
}

function activeAttemptCountUsingProfile(db: Database.Database, profileId: string): number {
  const corrupt = db.prepare<[], { id: string }>(`SELECT id FROM attempts
    WHERE result IS NULL AND json_valid(capture_json) = 0 LIMIT 1`).get();
  if (corrupt) throw new StorageError('OPERATION_DATA_INVALID');
  return db.prepare<[string, string], { count: number }>(`SELECT count(*) AS count FROM attempts
    WHERE result IS NULL AND json_valid(capture_json) = 1 AND json_extract(capture_json, '$.formatVersion') = 1 AND (
      json_extract(capture_json, '$.configuration.implementerProfile.id') = ? OR
      json_extract(capture_json, '$.configuration.reviewerProfile.id') = ?
    )`).get(profileId, profileId)?.count ?? 0;
}

interface CommandIdentity { readonly operationId: string; readonly expectedRevision: string | undefined }
export type ConfigurationCommand = CommandIdentity & (
  { kind: 'project.register'; body: ProjectRegistration } |
  { kind: 'settings.update' | 'settings.onboarding.update'; body: SettingsUpdate } |
  { kind: 'settings.account.bind' | 'settings.account.switch'; body: SettingsUpdate } |
  { kind: 'project.configuration.update'; projectId: string; body: ConfigurationUpdate }
);
export interface RegisterProject extends CommandIdentity { body: ProjectRegistration; source: ProjectConfiguration['source']; originNotes: readonly string[] }
export interface SaveSettings extends CommandIdentity {
  body: SettingsUpdate;
  changes: GlobalChanges;
  account?: { id: string; login: string };
  onboardingValidation?: { accountId: string; projectsRoot: string };
}
export interface SaveConfiguration extends CommandIdentity {
  projectId: string; body: ConfigurationUpdate; configuration: ProjectConfiguration; globalChanges: GlobalChanges; originNotes?: readonly string[];
}
function commandHash(command: ConfigurationCommand): string {
  const isSettingsCommand = command.kind === 'settings.update' || command.kind === 'settings.onboarding.update' || command.kind === 'settings.account.bind' || command.kind === 'settings.account.switch';
  const schema = command.kind === 'project.register' ? ProjectRegistration : isSettingsCommand ? SettingsUpdate : ConfigurationUpdate;
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(schema, command.body) ||
    (command.expectedRevision !== undefined && (typeof command.expectedRevision !== 'string' || command.expectedRevision.length > 256)) ||
    (command.kind === 'project.configuration.update' && !Value.Check(OperationId, command.projectId))) {
    throw new OperationError(400, 'COMMAND_INVALID', 'The command is invalid.');
  }
  let route: string;
  let body: unknown;
  if (command.kind === 'project.register') {
    route = '/api/v1/projects'; body = registrationCommandJson(command.body);
  } else if (command.kind === 'settings.update' || command.kind === 'settings.onboarding.update' || command.kind === 'settings.account.bind' || command.kind === 'settings.account.switch') {
    route = '/api/v1/settings'; body = settingsCommandJson(command.body);
  } else {
    if (!('projectId' in command)) throw new OperationError(400, 'COMMAND_INVALID', 'The command is invalid.');
    route = `/api/v1/projects/${command.projectId}/configuration`; body = configurationCommandJson(command.body);
  }
  return digest({ method: command.kind === 'project.register' ? 'POST' : 'PUT', route, kind: command.kind, body, expectedRevision: command.expectedRevision ?? null });
}
export function recoverConfigurationCommand(db: Database.Database, command: ConfigurationCommand): StoredOperation | null {
  const hash = commandHash(command);
  const s = readSettings(db);
  const row = db.prepare<[string], { request_hash: string; installation_id: string; account_id: string | null; result_account_id: string | null; operation_kind: string; resource_type: string; resource_id: string }>(
    'SELECT request_hash, installation_id, account_id, result_account_id, operation_kind, resource_type, resource_id FROM operation_requests WHERE operation_id = ?',
  ).get(command.operationId);
  if (!row) return null;
  const isAccountBinding = command.kind === 'settings.account.bind' || command.kind === 'settings.account.switch';
  const resourceMatches = command.kind === 'settings.update' || command.kind === 'settings.onboarding.update' || isAccountBinding
    ? row.resource_type === 'settings' && row.resource_id === 'local'
    : command.kind === 'project.configuration.update'
      ? row.resource_type === 'project' && row.resource_id === command.projectId
      : row.resource_type === 'project' && Value.Check(OperationId, row.resource_id);
  const bindingTarget = command.kind === 'settings.account.bind' || command.kind === 'settings.account.switch'
    ? command.body.account_binding?.account_id : undefined;
  const accountScopeMatches = isAccountBinding
    ? bindingTarget !== undefined && row.result_account_id === bindingTarget && s.account_id === bindingTarget &&
      (command.kind === 'settings.account.bind' ? row.account_id === null : row.account_id !== null && row.account_id !== bindingTarget)
    : row.account_id === s.account_id && row.result_account_id === null;
  if (row.request_hash !== hash || row.installation_id !== s.installation_id || !accountScopeMatches ||
    row.operation_kind !== command.kind || !resourceMatches) {
    throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  }
  const operation = readOperation(db, command.operationId);
  if (!operation || operation.state !== 'succeeded') throw new StorageError('OPERATION_DATA_INVALID');
  return operation;
}
function checkRevision(actual: string, expected: string | undefined): void {
  if (expected === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
  if (actual !== expected) throw new OperationError(412, 'REVISION_CONFLICT', 'Configuration changed. Reload current data and reapply your draft.');
}
function record(db: Database.Database, command: ConfigurationCommand, resourceId: string, revision: number,
  accountBinding?: { sourceAccountId: string | null; resultAccountId: string }): StoredOperation {
  const s = readSettings(db);
  const isSettingsCommand = command.kind === 'settings.update' || command.kind === 'settings.onboarding.update' || command.kind === 'settings.account.bind' || command.kind === 'settings.account.switch';
  const resourceType = isSettingsCommand ? 'settings' : 'project';
  const eventType = command.kind === 'project.register' ? 'project.registered'
    : command.kind === 'settings.account.bind' ? 'settings.account.bound'
      : command.kind === 'settings.account.switch' ? 'settings.account.switched'
        : command.kind === 'settings.onboarding.update' ? 'settings.onboarding.updated'
          : command.kind === 'settings.update' ? 'settings.updated' : 'project.configuration.updated';
  const seq = (db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0) AS seq FROM events').get()?.seq ?? 0) + 1;
  const receipt = { revision, event_cursor: String(seq) };
  db.prepare('INSERT INTO operation_requests(operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json, receipt_json, result_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(command.operationId, s.installation_id, accountBinding ? accountBinding.sourceAccountId : s.account_id, command.kind, resourceType, resourceId,
      commandHash(command), JSON.stringify({ etag: command.expectedRevision ?? null }), serializeOperationReceipt(receipt), accountBinding?.resultAccountId ?? null);
  db.prepare('INSERT INTO events(seq, entity_type, entity_id, project_id, operation_id, event_type, entity_revision, facts_json, occurred_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(seq, resourceType, resourceId, resourceType === 'project' ? resourceId : null, command.operationId, eventType, revision, '{}', Date.now());
  return { operation_id: command.operationId, kind: command.kind, resource: { type: resourceType, id: resourceId }, state: 'succeeded', receipt };
}
export function mergeGlobalChanges(current: FactorySettings, changes: GlobalChanges): FactorySettings {
  return { ...current, ...changes,
    time_defaults: { ...current.time_defaults, ...changes.time_defaults },
    artifact_policy: { ...current.artifact_policy, ...changes.artifact_policy },
  };
}
function checkExplicitGlobals(requested: GlobalChanges, normalized: GlobalChanges): void {
  const allowed = { ...requested };
  for (const key of ['projects_root'] as const) {
    if (typeof requested[key] === 'string' && typeof normalized[key] === 'string') allowed[key] = normalized[key];
  }
  if (digest(allowed) !== digest(normalized)) throw new OperationError(400, 'UNREQUESTED_GLOBAL_CHANGE', 'Only explicitly requested global changes may be saved.');
}

function advanceSettingsForProfileChanges(db: Database.Database, revision: number, globalsChanged: boolean, profilesChanged: boolean): void {
  if (!profilesChanged || globalsChanged) return;
  const current = db.prepare<[], { updated_at_ms: number }>("SELECT updated_at_ms FROM factory_settings WHERE id = 'local'").get();
  if (!current) throw new StorageError('SETTINGS_INVALID');
  const now = Math.max(Date.now(), current.updated_at_ms);
  const result = db.prepare<[number, number]>(`UPDATE factory_settings SET revision = revision + 1, updated_at_ms = ?
    WHERE id = 'local' AND revision = ?`).run(now, revision);
  if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Settings changed.');
}

function writeProfiles(db: Database.Database, view: SettingsView, changes: ProfileChanges | undefined,
  projectChange?: { projectId: string; configuration: ProjectConfiguration }): boolean {
  if (!changes?.length) return false;
  const ids = changes.flatMap((change) => change.action === 'create' ? [] : [change.id]);
  if (new Set(ids).size !== ids.length) throw new OperationError(400, 'PROFILE_DUPLICATED', 'A profile may only be edited once per command.');
  let changed = false;
  const liveName = db.prepare<[string, string | null], { id: string }>(
    'SELECT id FROM execution_profiles WHERE name_key = ? AND deleted_at_ms IS NULL AND id IS NOT ?',
  );
  for (const command of changes) {
    if (command.action === 'delete') {
      const previous = view.profiles.find((profile) => profile.id === command.id);
      if (!previous) throw new OperationError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
      const projectStillSelects = projectChange?.configuration.implementer_profile_id === previous.id ||
        projectChange?.configuration.reviewer_profile_id === previous.id;
      const projectBlockers = currentProjectReferences(db, previous.id,
        projectChange && !projectStillSelects ? projectChange.projectId : undefined);
      if (projectBlockers.count > 0) throwProjectProfileBlock('PROFILE_DELETE_BLOCKED', previous.id, projectBlockers);
      const activeAttempts = activeAttemptCountUsingProfile(db, previous.id);
      if (activeAttempts > 0) {
        throw new OperationError(409, 'PROFILE_ACTIVE_ATTEMPT_BLOCKED', 'Uma tentativa sem resultado ainda contém a captura deste perfil.', {
          facts: { profile_id: previous.id, active_attempt_count: activeAttempts },
          affected_requirements: ['RF-77', 'RF-79', 'RF-80'],
          recovery: 'Aguarde até que todas as tentativas que capturaram este perfil tenham um resultado e tente excluir novamente.',
        });
      }
      const now = Math.max(Date.now(), previous.updated_at_ms, previous.created_at_ms);
      const result = db.prepare(`UPDATE execution_profiles SET deleted_at_ms = ?, revision = revision + 1, updated_at_ms = ?
        WHERE id = ? AND revision = ? AND deleted_at_ms IS NULL`).run(now, now, previous.id, previous.revision);
      if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Profile changed.');
      changed = true;
      continue;
    }
    if (command.action === 'create') {
      const profile: ProfileCreate = { ...command.profile, guidance: command.profile.guidance ?? '' };
      const nameKey = profile.name.trim().toLowerCase();
      const count = db.prepare<[], { count: number }>('SELECT count(*) AS count FROM execution_profiles WHERE deleted_at_ms IS NULL').get()?.count ?? 0;
      if (count >= 100) throw new OperationError(409, 'PROFILE_LIMIT', 'The installation supports at most 100 live reusable profiles.');
      if (liveName.get(nameKey, null)) throw new OperationError(409, 'PROFILE_NAME_CONFLICT', 'A live profile already uses this name.');
      const now = Date.now();
      db.prepare(`INSERT INTO execution_profiles(id, name, profile_type, name_key, executor, provider, model, effort,
        guidance, revision, created_at_ms, updated_at_ms, deleted_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`)
        .run(randomUUID(), profile.name, profile.profile_type, nameKey, profile.executor, profile.provider, profile.model,
          profile.effort, profile.guidance, now, now);
      changed = true;
      continue;
    }
    if (Object.keys(command.changes).length === 0) throw new OperationError(400, 'PROFILE_PATCH_EMPTY', 'Profile updates require at least one changed field.');
    const previous = view.profiles.find((profile) => profile.id === command.id);
    if (!previous) throw new OperationError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    const next = { ...previous, ...command.changes };
    if (next.profile_type !== previous.profile_type) {
      const projectUsesCompatibleRole = projectChange !== undefined &&
        aggregateProjectCanUseProfile(projectChange.configuration, previous.id, next.profile_type);
      const projectBlockers = currentProjectReferences(db, previous.id,
        projectChange && projectUsesCompatibleRole ? projectChange.projectId : undefined);
      if (projectBlockers.count > 0) throwProjectProfileBlock('PROFILE_TYPE_CHANGE_BLOCKED', previous.id, projectBlockers);
    }
    if (next.name.trim().toLowerCase() !== previous.name.trim().toLowerCase() && liveName.get(next.name.trim().toLowerCase(), previous.id)) {
      throw new OperationError(409, 'PROFILE_NAME_CONFLICT', 'A live profile already uses this name.');
    }
    if (digest({ name: previous.name, profile_type: previous.profile_type, executor: previous.executor, provider: previous.provider, model: previous.model, effort: previous.effort, guidance: previous.guidance }) ===
      digest({ name: next.name, profile_type: next.profile_type, executor: next.executor, provider: next.provider, model: next.model, effort: next.effort, guidance: next.guidance })) continue;
    const now = Math.max(Date.now(), previous.updated_at_ms, previous.created_at_ms);
    const result = db.prepare(`UPDATE execution_profiles SET name = ?, name_key = ?, profile_type = ?, executor = ?, provider = ?, model = ?, effort = ?,
      guidance = ?, revision = revision + 1, updated_at_ms = ? WHERE id = ? AND revision = ? AND deleted_at_ms IS NULL`)
      .run(next.name, next.name.trim().toLowerCase(), next.profile_type, next.executor, next.provider, next.model, next.effort,
        next.guidance, now, previous.id, previous.revision);
    if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Profile changed.');
    changed = true;
  }
  return changed;
}
function writeGlobals(db: Database.Database, view: SettingsView, changes: GlobalChanges): boolean {
  if (changes.projects_root) assertDeletionPathsAvailable(db, [changes.projects_root]);
  if (!Value.Check(GlobalChanges, changes)) throw new OperationError(400, 'SETTINGS_INVALID', 'Settings changes are invalid.');
  const next = mergeGlobalChanges(view.settings, changes);
  if (!Value.Check(FactorySettings, next)) throw new OperationError(400, 'SETTINGS_INVALID', 'Settings changes are invalid.');
  if (next.automation_enabled && (!next.account_id || !next.projects_root)) throw new OperationError(409, 'AUTOMATION_PREREQUISITES_MISSING', 'Configure an observed account and project root before enabling automation.');
  const currentConfirmation = db.prepare<[], { projects_root_confirmed_at_ms: number | null }>(
    'SELECT projects_root_confirmed_at_ms FROM factory_settings WHERE id = \'local\'',
  ).get();
  if (!currentConfirmation) throw new StorageError('SETTINGS_INVALID');
  const confirmsProjectsRoot = Object.prototype.hasOwnProperty.call(changes, 'projects_root');
  const confirmsExistingOrNewRoot = confirmsProjectsRoot && typeof changes.projects_root === 'string';
  const confirmedAt = confirmsProjectsRoot ? (confirmsExistingOrNewRoot ? Date.now() : null) : currentConfirmation.projects_root_confirmed_at_ms;
  const changed = digest(next) !== digest(view.settings) || confirmsExistingOrNewRoot || confirmedAt !== currentConfirmation.projects_root_confirmed_at_ms;
  if (changed) {
    const now = Date.now();
    const rootConfirmedAt = confirmsProjectsRoot && typeof changes.projects_root === 'string' ? now : confirmedAt;
    const result = db.prepare(`UPDATE factory_settings SET projects_root = ?, projects_root_confirmed_at_ms = ?, automation_enabled = ?, time_defaults_json = ?, artifact_policy_json = ?, revision = revision + 1, updated_at_ms = ? WHERE id = 'local' AND revision = ?`)
      .run(next.projects_root, rootConfirmedAt, Number(next.automation_enabled), JSON.stringify(storeTimeDefaults(next.time_defaults)), JSON.stringify(storeArtifactPolicy(next.artifact_policy)), now, view.settings.revision);
    if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Settings changed.');
  }
  return changed;
}
function writeOnboarding(db: Database.Database, view: SettingsView, changes: OnboardingChanges,
  validation: SaveSettings['onboardingValidation']): boolean {
  if (!Value.Check(OnboardingChanges, changes)) throw new OperationError(400, 'ONBOARDING_CHANGES_INVALID', 'Onboarding changes are invalid.');
  const current = db.prepare<[], {
    onboarding_suppressed: number;
    onboarding_completed_at_ms: number | null;
    projects_root_confirmed_at_ms: number | null;
  }>(`SELECT onboarding_suppressed, onboarding_completed_at_ms, projects_root_confirmed_at_ms
    FROM factory_settings WHERE id = 'local'`).get();
  if (!current || (current.onboarding_suppressed !== 0 && current.onboarding_suppressed !== 1)) throw new StorageError('SETTINGS_INVALID');
  const completing = changes.complete === true && current.onboarding_completed_at_ms === null;
  if (completing) {
    const { settings, profile_counts: counts } = view;
    if (counts.implementer === 0 || counts.reviewer === 0) {
      throw new OperationError(409, 'ONBOARDING_PROFILES_REQUIRED', 'Both execution profile types are required before completion.');
    }
    if (settings.account_id === null || settings.projects_root === null || current.projects_root_confirmed_at_ms === null ||
      validation?.accountId !== settings.account_id || validation.projectsRoot !== settings.projects_root) {
      throw new OperationError(412, 'ONBOARDING_CONTEXT_CHANGED', 'The validated account or project directory no longer matches current settings.');
    }
  }
  const suppressed = changes.suppressed === undefined ? current.onboarding_suppressed : Number(changes.suppressed);
  const completedAt = current.onboarding_completed_at_ms ?? (completing ? Math.max(Date.now(), view.settings.updated_at_ms) : null);
  if (suppressed === current.onboarding_suppressed && completedAt === current.onboarding_completed_at_ms) return false;
  const now = Math.max(Date.now(), view.settings.updated_at_ms, completedAt ?? 0);
  const result = db.prepare(`UPDATE factory_settings SET onboarding_suppressed = ?, onboarding_completed_at_ms = ?,
    revision = revision + 1, updated_at_ms = ? WHERE id = 'local' AND revision = ?`)
    .run(suppressed, completedAt, now, view.settings.revision);
  if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Settings changed.');
  return true;
}

export function insertRevision(db: Database.Database, projectId: string, revisionId: string, revision: number, c: ProjectConfiguration, notes: readonly string[]): void {
  assertProjectAvailable(db, projectId);
  if (c.source.kind === 'local') assertDeletionPathsAvailable(db, [c.source.location]);
  if (!Value.Check(ProjectConfiguration, c) || notes.length > 50 || !notes.every((n) => /^[A-Z_]{1,128}$/.test(n))) throw new OperationError(400, 'CONFIGURATION_INVALID', 'Project configuration is invalid.');
  assertProjectProfileRoles(db, c);
  db.prepare(`INSERT INTO project_revisions(id, project_id, revision_number, source_kind, source_location, repository_id, repository_url, base_branch, github_project_id, github_project_owner_id, status_field_id, status_options_json, implementer_profile_id, reviewer_profile_id, checks_json, correction_limit, default_delivery_mode, automation_enabled, queue_order_json, guidance, origin_notes_json, created_at_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(revisionId, projectId, revision, c.source.kind, c.source.location, c.source.repository_id ?? null, c.source.repository_url ?? null, c.base_branch,
      c.github_project?.id ?? null, c.github_project?.owner_id ?? null, c.github_project?.status_field_id ?? null, JSON.stringify(c.github_project ? storeStatusOptions(c.github_project.status_option_ids) : {}),
      c.implementer_profile_id, c.reviewer_profile_id, JSON.stringify(c.checks.map(storeCheck)), c.correction_limit, c.default_delivery_mode, Number(c.automation_enabled), JSON.stringify(storeQueueOrder(c.queue_order)), c.guidance, JSON.stringify(notes), Date.now());
}
export function registerProject(db: Database.Database, input: RegisterProject): StoredOperation {
  const command: ConfigurationCommand = { ...input, kind: 'project.register' };
  return guarded(() => db.transaction(() => {
    const recovered = recoverConfigurationCommand(db, command); if (recovered) return recovered;
    assertDeletionPathsAvailable(db, [
      ...(input.body.source.kind === 'local' ? [input.body.source.location] : []),
      ...(input.source.kind === 'local' ? [input.source.location] : []),
    ]);
    const s = readSettings(db); const id = randomUUID(); const revisionId = randomUUID(); const now = Date.now();
    db.prepare('INSERT INTO projects(id, account_id, name, current_revision_id, revision, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, 1, ?, ?)').run(id, s.account_id, input.body.name, revisionId, now, now);
    insertRevision(db, id, revisionId, 1, { source: input.source, base_branch: input.body.base_branch, github_project: null,
      implementer_profile_id: null, reviewer_profile_id: null, checks: [], correction_limit: 2, default_delivery_mode: 'icr', automation_enabled: false,
      queue_order: { priority_field_id: null, priority_direction: 'asc', use_board_position: true }, guidance: '' }, input.originNotes);
    return record(db, command, id, 1);
  }).immediate());
}
export function saveSettings(db: Database.Database, input: SaveSettings): StoredOperation {
  const binding = input.body.account_binding;
  const command: ConfigurationCommand = binding
    ? { ...input, kind: binding.action === 'bind' ? 'settings.account.bind' : 'settings.account.switch' }
    : input.body.onboarding_changes
      ? { ...input, kind: 'settings.onboarding.update' }
      : { ...input, kind: 'settings.update' };
  return guarded(() => db.transaction(() => {
    const recovered = recoverConfigurationCommand(db, command); if (recovered) return recovered;
    const view = readSettingsView(db); checkRevision(configurationETag(view), input.expectedRevision);
    if (binding) {
      if (Object.keys(input.body.changes).length > 0 || input.body.profile_changes !== undefined || input.body.gh_executable_path !== undefined || input.body.onboarding_changes !== undefined) {
        throw new OperationError(400, 'SETTINGS_COMMAND_INVALID', 'Account binding must be the only settings command.');
      }
      if (!input.account || !Value.Check(GitHubAccount, input.account) || input.account.id !== binding.account_id) {
        throw new OperationError(400, 'ACCOUNT_BINDING_INVALID', 'The validated GitHub account does not match the binding request.');
      }
      const sourceAccountId = view.settings.account_id;
      if (binding.action === 'bind' && sourceAccountId !== null) {
        throw new OperationError(409, 'ACCOUNT_ALREADY_BOUND', 'An account is already linked. Use the explicit switch action.');
      }
      if (binding.action === 'switch' && sourceAccountId === null) {
        throw new OperationError(409, 'ACCOUNT_NOT_BOUND', 'Link an eligible account before switching accounts.');
      }
      if (sourceAccountId === binding.account_id) {
        throw new OperationError(409, 'ACCOUNT_UNCHANGED', 'The selected account is already linked.');
      }
      if (binding.action === 'switch' && sourceAccountId !== null && db.prepare('SELECT id FROM attempts WHERE account_id = ? AND result IS NULL LIMIT 1').get(sourceAccountId)) {
        throw new OperationError(409, 'ACCOUNT_SWITCH_ATTEMPT_ACTIVE', 'Finish the active attempt before switching the linked account.');
      }
      const now = Date.now();
      db.prepare(`INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms,revision)
        VALUES (?,?,?,?,?,1) ON CONFLICT(github_account_id) DO UPDATE SET login=excluded.login,observed_at_ms=excluded.observed_at_ms,
        updated_at_ms=excluded.updated_at_ms,revision=accounts.revision+1`).run(input.account.id, input.account.login, now, now, now);
      const changed = db.prepare(`UPDATE factory_settings SET account_id = ?, revision = revision + 1, updated_at_ms = ?
        WHERE id = 'local' AND revision = ?`).run(input.account.id, now, view.settings.revision);
      if (changed.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Settings changed.');
      return record(db, command, 'local', view.settings.revision + 1, { sourceAccountId, resultAccountId: input.account.id });
    }
    checkExplicitGlobals(input.body.changes, input.changes);
    if (input.body.gh_executable_path !== undefined) {
      if (Object.keys(input.body.changes).length > 0 || (input.body.profile_changes?.length ?? 0) > 0 || input.body.onboarding_changes !== undefined) {
        throw new OperationError(400, 'SETTINGS_COMMAND_INVALID', 'Save the GitHub executable as a separate settings command.');
      }
      const current = db.prepare<[], { gh_executable_path: string | null }>(
        "SELECT gh_executable_path FROM factory_settings WHERE id = 'local'",
      ).get();
      if (!current || current.gh_executable_path === input.body.gh_executable_path) {
        throw new OperationError(409, 'NO_CHANGES', 'No configuration changes were supplied.');
      }
      const changed = db.prepare(`UPDATE factory_settings SET gh_executable_path = ?, revision = revision + 1, updated_at_ms = ?
        WHERE id = 'local' AND revision = ?`).run(input.body.gh_executable_path, Date.now(), view.settings.revision);
      if (changed.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Settings changed.');
      return record(db, command, 'local', readSettings(db).revision);
    }
    if (input.body.onboarding_changes !== undefined) {
      if (Object.keys(input.body.changes).length > 0 || input.body.profile_changes !== undefined || input.body.gh_executable_path !== undefined || input.body.account_binding !== undefined) {
        throw new OperationError(400, 'SETTINGS_COMMAND_INVALID', 'Onboarding changes must be the only settings command.');
      }
      if (!writeOnboarding(db, view, input.body.onboarding_changes, input.onboardingValidation)) {
        throw new OperationError(409, 'NO_CHANGES', 'No onboarding changes were supplied.');
      }
      return record(db, command, 'local', readSettings(db).revision);
    }
    const globalsChanged = writeGlobals(db, view, input.changes);
    const profilesChanged = writeProfiles(db, view, input.body.profile_changes);
    if (!globalsChanged && !profilesChanged) throw new OperationError(409, 'NO_CHANGES', 'No configuration changes were supplied.');
    advanceSettingsForProfileChanges(db, view.settings.revision, globalsChanged, profilesChanged);
    return record(db, command, 'local', readSettings(db).revision);
  }).immediate());
}
export function saveConfiguration(db: Database.Database, input: SaveConfiguration): StoredOperation {
  const command: ConfigurationCommand = { ...input, kind: 'project.configuration.update' };
  return guarded(() => db.transaction(() => {
    const recovered = recoverConfigurationCommand(db, command); if (recovered) return recovered;
    assertProjectAvailable(db, input.projectId);
    assertProjectConfigurationEditable(db, input.projectId);
    if (input.body.project_changes.source?.kind === 'local') assertDeletionPathsAvailable(db, [input.body.project_changes.source.location]);
    const view = readConfiguration(db, input.projectId); checkRevision(configurationETag(view), input.expectedRevision);
    checkExplicitGlobals(input.body.global_changes ?? {}, input.globalChanges);
    if (!Value.Check(ProjectConfiguration, input.configuration)) throw new OperationError(400, 'CONFIGURATION_INVALID', 'Project configuration is invalid.');
    const { id: oldId, project_id: _projectId, revision: _revision, created_at_ms: _created, ...old } = view.configuration;
    const allowed = { ...old, ...input.body.project_changes, queue_order: { ...old.queue_order, ...input.body.project_changes.queue_order } };
    if (input.body.project_changes.source !== undefined || input.body.project_changes.base_branch !== undefined) {
      if (allowed.source.kind !== input.configuration.source.kind) throw new OperationError(400, 'SOURCE_KIND_CHANGED', 'Inspected origin kind does not match the selected origin.');
      allowed.source = input.configuration.source;
    }
    if (digest(allowed) !== digest(input.configuration)) throw new OperationError(400, 'UNREQUESTED_PROJECT_CHANGE', 'Only explicitly requested project changes may be saved.');
    const globalsChanged = writeGlobals(db, view, input.globalChanges);
    const profilesChanged = writeProfiles(db, view, input.body.profile_changes, { projectId: input.projectId, configuration: input.configuration });
    if (!globalsChanged && !profilesChanged && digest(old) === digest(input.configuration)) throw new OperationError(409, 'NO_CHANGES', 'No configuration changes were supplied.');
    advanceSettingsForProfileChanges(db, view.settings.revision, globalsChanged, profilesChanged);
    const notes = input.originNotes ?? JSON.parse(db.prepare<[string], { origin_notes_json: string }>('SELECT origin_notes_json FROM project_revisions WHERE id = ?').get(oldId)?.origin_notes_json ?? '[]') as string[];
    const nextId = randomUUID(); const revision = view.configuration.revision + 1;
    insertRevision(db, input.projectId, nextId, revision, input.configuration, notes);
    const result = db.prepare('UPDATE projects SET current_revision_id = ?, revision = revision + 1, updated_at_ms = ? WHERE id = ? AND revision = ?')
      .run(nextId, Date.now(), input.projectId, view.configuration.revision);
    if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Project changed.');
    return record(db, command, input.projectId, revision);
  }).immediate());
}
