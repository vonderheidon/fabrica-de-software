import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import {
  ConfigurationUpdate, FactorySettings, GlobalChanges, OperationId, ProjectConfiguration, ProjectRegistration, SettingsUpdate,
  type ExecutionProfile, type SettingsView,
} from '#contracts';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { readSettings } from './settings.js';
import { configurationETag, digest, guarded, readConfiguration, readSettingsView } from './configuration-reads.js';

interface CommandIdentity { readonly operationId: string; readonly expectedRevision: string | undefined }
export type ConfigurationCommand = CommandIdentity & (
  { kind: 'project.register'; body: ProjectRegistration } |
  { kind: 'settings.update'; body: SettingsUpdate } |
  { kind: 'project.configuration.update'; projectId: string; body: ConfigurationUpdate }
);
export interface RegisterProject extends CommandIdentity { body: ProjectRegistration; source: ProjectConfiguration['source']; originNotes: readonly string[] }
export interface SaveSettings extends CommandIdentity { body: SettingsUpdate; changes: GlobalChanges }
export interface SaveConfiguration extends CommandIdentity {
  projectId: string; body: ConfigurationUpdate; configuration: ProjectConfiguration; globalChanges: GlobalChanges; originNotes?: readonly string[];
}
function commandHash(command: ConfigurationCommand): string {
  const schema = command.kind === 'project.register' ? ProjectRegistration : command.kind === 'settings.update' ? SettingsUpdate : ConfigurationUpdate;
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(schema, command.body) ||
    (command.expectedRevision !== undefined && (typeof command.expectedRevision !== 'string' || command.expectedRevision.length > 256)) ||
    (command.kind === 'project.configuration.update' && !Value.Check(OperationId, command.projectId))) {
    throw new OperationError(400, 'COMMAND_INVALID', 'The command is invalid.');
  }
  const route = command.kind === 'project.register' ? '/api/v1/projects' : command.kind === 'settings.update' ? '/api/v1/settings' : `/api/v1/projects/${command.projectId}/configuration`;
  return digest({ method: command.kind === 'project.register' ? 'POST' : 'PUT', route, kind: command.kind, body: command.body, expectedRevision: command.expectedRevision ?? null });
}
export function recoverConfigurationCommand(db: Database.Database, command: ConfigurationCommand): StoredOperation | null {
  const hash = commandHash(command);
  const s = readSettings(db);
  const row = db.prepare<[string], { request_hash: string; installation_id: string; account_id: string | null }>('SELECT request_hash, installation_id, account_id FROM operation_requests WHERE operation_id = ?').get(command.operationId);
  if (!row) return null;
  if (row.request_hash !== hash || row.installation_id !== s.installationId || row.account_id !== s.accountId) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  const operation = readOperation(db, command.operationId);
  if (!operation || operation.state !== 'succeeded') throw new StorageError('OPERATION_DATA_INVALID');
  return operation;
}
function checkRevision(actual: string, expected: string | undefined): void {
  if (expected === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
  if (actual !== expected) throw new OperationError(412, 'REVISION_CONFLICT', 'Configuration changed. Reload current data and reapply your draft.');
}
function record(db: Database.Database, command: ConfigurationCommand, resourceId: string, revision: number): StoredOperation {
  const s = readSettings(db);
  const resourceType = command.kind === 'settings.update' ? 'settings' : 'project';
  const eventType = command.kind === 'project.register' ? 'project.registered' : command.kind === 'settings.update' ? 'settings.updated' : 'project.configuration.updated';
  const seq = (db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0) AS seq FROM events').get()?.seq ?? 0) + 1;
  const receipt = { revision, eventCursor: String(seq) };
  db.prepare('INSERT INTO operation_requests(operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(command.operationId, s.installationId, s.accountId, command.kind, resourceType, resourceId, commandHash(command), JSON.stringify({ etag: command.expectedRevision ?? null }), JSON.stringify(receipt));
  db.prepare('INSERT INTO events(seq, entity_type, entity_id, project_id, operation_id, event_type, entity_revision, facts_json, occurred_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(seq, resourceType, resourceId, resourceType === 'project' ? resourceId : null, command.operationId, eventType, revision, '{}', Date.now());
  return { operationId: command.operationId, kind: command.kind, resource: { type: resourceType, id: resourceId }, state: 'succeeded', receipt };
}
export function mergeGlobalChanges(current: FactorySettings, changes: GlobalChanges): FactorySettings {
  return { ...current, ...changes,
    maestriSettings: { ...current.maestriSettings, ...changes.maestriSettings },
    timeDefaults: { ...current.timeDefaults, ...changes.timeDefaults },
    costDefaults: { ...current.costDefaults, ...changes.costDefaults }, artifactPolicy: { ...current.artifactPolicy, ...changes.artifactPolicy },
  };
}
function checkExplicitGlobals(requested: GlobalChanges, normalized: GlobalChanges): void {
  const allowed = { ...requested };
  for (const key of ['projectsRoot', 'dataRoot'] as const) {
    if (typeof requested[key] === 'string' && typeof normalized[key] === 'string') allowed[key] = normalized[key];
  }
  if (digest(allowed) !== digest(normalized)) throw new OperationError(400, 'UNREQUESTED_GLOBAL_CHANGE', 'Only explicitly requested global changes may be saved.');
}
function writeGlobals(db: Database.Database, view: SettingsView, changes: GlobalChanges, profiles: readonly ExecutionProfile[]): boolean {
  if (!Value.Check(GlobalChanges, changes)) throw new OperationError(400, 'SETTINGS_INVALID', 'Settings changes are invalid.');
  const next = mergeGlobalChanges(view.settings, changes);
  if (!Value.Check(FactorySettings, next)) throw new OperationError(400, 'SETTINGS_INVALID', 'Settings changes are invalid.');
  if (next.automationEnabled && (!next.accountId || !next.designatedHost || !next.projectsRoot)) throw new OperationError(409, 'AUTOMATION_PREREQUISITES_MISSING', 'Configure an observed account, designated host and project root before enabling automation.');
  let changed = digest(next) !== digest(view.settings);
  if (changed) {
    const result = db.prepare(`UPDATE factory_settings SET designated_host = ?, projects_root = ?, data_root = ?, maestri_settings_json = ?, automation_enabled = ?, time_defaults_json = ?, cost_defaults_json = ?, artifact_policy_json = ?, revision = revision + 1, updated_at_ms = ? WHERE id = 'local' AND revision = ?`)
      .run(next.designatedHost, next.projectsRoot, next.dataRoot, JSON.stringify(next.maestriSettings), Number(next.automationEnabled), JSON.stringify(next.timeDefaults), JSON.stringify(next.costDefaults), JSON.stringify(next.artifactPolicy), Date.now(), view.settings.revision);
    if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Settings changed.');
  }
  const ids = profiles.flatMap((p) => p.id ? [p.id] : []);
  if (new Set(ids).size !== ids.length) throw new OperationError(400, 'PROFILE_DUPLICATED', 'A profile may only be edited once per command.');
  if (view.profiles.length + profiles.filter((p) => !p.id).length > 100) throw new OperationError(409, 'PROFILE_LIMIT', 'The installation supports at most 100 reusable profiles.');
  for (const profile of profiles) {
    const previous = profile.id ? view.profiles.find((p) => p.id === profile.id) : undefined;
    if (profile.id && !previous) throw new OperationError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    if (previous && digest({ name: previous.name, executor: previous.executor, provider: previous.provider, model: previous.model, effort: previous.effort, guidance: previous.guidance }) === digest({ name: profile.name, executor: profile.executor, provider: profile.provider, model: profile.model, effort: profile.effort, guidance: profile.guidance })) continue;
    const now = Date.now();
    if (previous) {
      const result = db.prepare('UPDATE execution_profiles SET name = ?, executor = ?, provider = ?, model = ?, effort = ?, guidance = ?, revision = revision + 1, updated_at_ms = ? WHERE id = ? AND revision = ?')
        .run(profile.name, profile.executor, profile.provider, profile.model, profile.effort, profile.guidance, now, previous.id, previous.revision);
      if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Profile changed.');
    } else db.prepare('INSERT INTO execution_profiles(id, name, executor, provider, model, effort, guidance, revision, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .run(randomUUID(), profile.name, profile.executor, profile.provider, profile.model, profile.effort, profile.guidance, now, now);
    changed = true;
  }
  return changed;
}
export function insertRevision(db: Database.Database, projectId: string, revisionId: string, revision: number, c: ProjectConfiguration, notes: readonly string[]): void {
  if (!Value.Check(ProjectConfiguration, c) || notes.length > 50 || !notes.every((n) => /^[A-Z_]{1,128}$/.test(n))) throw new OperationError(400, 'CONFIGURATION_INVALID', 'Project configuration is invalid.');
  for (const id of [c.implementerProfileId, c.reviewerProfileId]) if (id && !db.prepare('SELECT id FROM execution_profiles WHERE id = ?').get(id)) throw new OperationError(404, 'PROFILE_NOT_FOUND', 'Selected profile not found.');
  db.prepare(`INSERT INTO project_revisions(id, project_id, revision_number, source_kind, source_location, repository_id, repository_url, base_branch, github_project_id, github_project_owner_id, status_field_id, status_options_json, implementer_profile_id, reviewer_profile_id, checks_json, correction_limit, default_delivery_mode, automation_enabled, queue_order_json, guidance, origin_notes_json, created_at_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(revisionId, projectId, revision, c.source.kind, c.source.location, c.source.repositoryId ?? null, c.source.repositoryUrl ?? null, c.baseBranch,
      c.githubProject?.id ?? null, c.githubProject?.ownerId ?? null, c.githubProject?.statusFieldId ?? null, JSON.stringify(c.githubProject?.statusOptionIds ?? {}),
      c.implementerProfileId, c.reviewerProfileId, JSON.stringify(c.checks), c.correctionLimit, c.defaultDeliveryMode, Number(c.automationEnabled), JSON.stringify(c.queueOrder), c.guidance, JSON.stringify(notes), Date.now());
}
export function registerProject(db: Database.Database, input: RegisterProject): StoredOperation {
  const command: ConfigurationCommand = { ...input, kind: 'project.register' };
  return guarded(() => db.transaction(() => {
    const recovered = recoverConfigurationCommand(db, command); if (recovered) return recovered;
    const s = readSettings(db); const id = randomUUID(); const revisionId = randomUUID(); const now = Date.now();
    db.prepare('INSERT INTO projects(id, account_id, name, current_revision_id, revision, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, 1, ?, ?)').run(id, s.accountId, input.body.name, revisionId, now, now);
    insertRevision(db, id, revisionId, 1, { source: input.source, baseBranch: input.body.baseBranch, githubProject: null,
      implementerProfileId: null, reviewerProfileId: null, checks: [], correctionLimit: 2, defaultDeliveryMode: 'icr', automationEnabled: false,
      queueOrder: { priorityFieldId: null, priorityDirection: 'asc', useBoardPosition: true }, guidance: '' }, input.originNotes);
    return record(db, command, id, 1);
  }).immediate());
}
export function saveSettings(db: Database.Database, input: SaveSettings): StoredOperation {
  const command: ConfigurationCommand = { ...input, kind: 'settings.update' };
  return guarded(() => db.transaction(() => {
    const recovered = recoverConfigurationCommand(db, command); if (recovered) return recovered;
    const view = readSettingsView(db); checkRevision(configurationETag(view), input.expectedRevision);
    checkExplicitGlobals(input.body.changes, input.changes);
    if (!writeGlobals(db, view, input.changes, input.body.profileChanges ?? [])) throw new OperationError(409, 'NO_CHANGES', 'No configuration changes were supplied.');
    return record(db, command, 'local', readSettings(db).revision);
  }).immediate());
}
export function saveConfiguration(db: Database.Database, input: SaveConfiguration): StoredOperation {
  const command: ConfigurationCommand = { ...input, kind: 'project.configuration.update' };
  return guarded(() => db.transaction(() => {
    const recovered = recoverConfigurationCommand(db, command); if (recovered) return recovered;
    const view = readConfiguration(db, input.projectId); checkRevision(configurationETag(view), input.expectedRevision);
    checkExplicitGlobals(input.body.globalChanges ?? {}, input.globalChanges);
    if (!Value.Check(ProjectConfiguration, input.configuration)) throw new OperationError(400, 'CONFIGURATION_INVALID', 'Project configuration is invalid.');
    const { id: oldId, projectId: _projectId, revision: _revision, createdAtMs: _created, ...old } = view.configuration;
    const allowed = { ...old, ...input.body.projectChanges, queueOrder: { ...old.queueOrder, ...input.body.projectChanges.queueOrder } };
    if (input.body.projectChanges.source !== undefined || input.body.projectChanges.baseBranch !== undefined) {
      if (allowed.source.kind !== input.configuration.source.kind) throw new OperationError(400, 'SOURCE_KIND_CHANGED', 'Inspected origin kind does not match the selected origin.');
      allowed.source = input.configuration.source;
    }
    if (digest(allowed) !== digest(input.configuration)) throw new OperationError(400, 'UNREQUESTED_PROJECT_CHANGE', 'Only explicitly requested project changes may be saved.');
    const globalsChanged = writeGlobals(db, view, input.globalChanges, input.body.profileChanges ?? []);
    if (!globalsChanged && digest(old) === digest(input.configuration)) throw new OperationError(409, 'NO_CHANGES', 'No configuration changes were supplied.');
    const notes = input.originNotes ?? JSON.parse(db.prepare<[string], { origin_notes_json: string }>('SELECT origin_notes_json FROM project_revisions WHERE id = ?').get(oldId)?.origin_notes_json ?? '[]') as string[];
    const nextId = randomUUID(); const revision = view.configuration.revision + 1;
    insertRevision(db, input.projectId, nextId, revision, input.configuration, notes);
    const result = db.prepare('UPDATE projects SET current_revision_id = ?, revision = revision + 1, updated_at_ms = ? WHERE id = ? AND revision = ?')
      .run(nextId, Date.now(), input.projectId, view.configuration.revision);
    if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Project changed.');
    return record(db, command, input.projectId, revision);
  }).immediate());
}
