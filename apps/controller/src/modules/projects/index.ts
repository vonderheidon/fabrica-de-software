import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, win32 } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import {
  ConfigurationOptionsQuery, ConfigurationUpdate, ProjectConfiguration, ProjectRegistration, SettingsUpdate,
  type CatalogQuery, type ConfigurationOptions, type GlobalChanges, type OriginInspection,
} from '#contracts';
import { OperationError, type ConfigurationCommand, type Storage, type StoredOperation } from '../storage/index.js';
import type { GitHub } from '../github/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { createQueue } from './queue.js';
export { createPreparations, type Preparations, type PreparationDependencies } from './preparations.js';
export { createScaffold, type Scaffold, type ScaffoldDependencies } from './scaffold.js';
export { loadScaffoldCatalog as validateScaffoldResources } from './scaffold-resources.js';
export { interpretIssue } from '../pipeline/index.js';

export interface ProjectDependencies {
  storage: Storage;
  github: Pick<GitHub, 'getIdentity' | 'getProjectOwner' | 'listProjects' | 'getProject' | 'validateProjectSelection' | 'listProjectItems' | 'getIssueContextById'>;
  workspaces: Pick<Workspaces, 'inspectOrigin'>;
  directoryBase: string;
}
export interface CommandContext { operationId: string; expectedRevision: string | undefined }
export { createQueue, QueueSummaryChanged } from './queue.js';
function fail(status: 400 | 409 | 412 | 428 | 503, code: string, message: string): never { throw new OperationError(status, code, message); }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function precondition(actual: string, expected: string | undefined): void {
  if (expected === undefined) fail(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
  if (actual !== expected) fail(412, 'REVISION_CONFLICT', 'Configuration changed. Reload current data and reapply your draft.');
}
function receipt(operation: StoredOperation) {
  if (!operation.receipt || operation.state !== 'succeeded') return fail(503, 'OPERATION_NOT_DURABLE', 'The command could not be confirmed.');
  return operation.receipt;
}
export function validateProjectConfiguration(configuration: ProjectConfiguration): void {
  if (!Value.Check(ProjectConfiguration, configuration)) fail(400, 'CONFIGURATION_INVALID', 'Project configuration is invalid.');
  const ids = configuration.checks.map((c) => c.id);
  if (new Set(ids).size !== ids.length) fail(400, 'CHECK_DUPLICATED', 'Checks require distinct IDs.');
  for (const check of configuration.checks) {
    const cwd = check.cwdRelative;
    if (isAbsolute(cwd) || win32.isAbsolute(cwd) || /[:\x00-\x1f\x7f]/.test(cwd) || cwd.split(/[\\/]/).includes('..')) fail(400, 'CHECK_CWD_INVALID', 'Check cwd must stay relative to the attempt environment.');
  }
  if (configuration.githubProject && new Set(Object.values(configuration.githubProject.statusOptionIds)).size !== 4) fail(400, 'STATUS_MAPPING_INVALID', 'Status roles require four distinct option IDs.');
}
export function createProjects({ storage, github, workspaces, directoryBase }: ProjectDependencies) {
  const queue = createQueue({ storage, github });
  async function normalizedGlobals(changes: GlobalChanges): Promise<GlobalChanges> {
    const result = { ...changes };
    for (const key of ['projectsRoot', 'dataRoot'] as const) {
      const supplied = changes[key];
      if (supplied === undefined || supplied === null) continue;
      if (!supplied.trim() || /[\x00-\x1f\x7f]/.test(supplied) || /^(?:\\\\|\/\/)/.test(supplied)) fail(400, 'DIRECTORY_INVALID', 'Choose an accessible local directory.');
      try {
        const directory = await realpath(resolve(directoryBase, supplied));
        if (!isAbsolute(directory) || /^(?:\\\\|\/\/)/.test(directory) || !(await stat(directory)).isDirectory()) fail(400, 'DIRECTORY_INVALID', 'Choose an accessible local directory.');
        await access(directory, constants.R_OK | constants.W_OK);
        result[key] = directory;
      } catch (error) {
        if (error instanceof OperationError) throw error;
        fail(400, 'DIRECTORY_INVALID', 'The directory is unavailable or lacks required access.');
      }
    }
    return result;
  }
  async function inspect(source: ProjectRegistration['source'], baseBranch: string) {
    const observation: OriginInspection = await workspaces.inspectOrigin({ source: { kind: source.kind, location: source.location }, baseBranch });
    if (observation.state === 'invalid' || !observation.source) {
      if (observation.state === 'unavailable') fail(503, 'ORIGIN_UNAVAILABLE', 'Origin inspection requires the authorized host context.');
      fail(400, 'ORIGIN_INVALID', 'Origin or base branch is invalid.');
    }
    if (observation.state !== 'identified') fail(503, 'ORIGIN_UNAVAILABLE', 'Origin inspection could not finish.');
    if (observation.diagnostics.some((d) => d.code === 'BRANCH_INVALID' || d.code === 'BRANCH_NOT_FOUND')) fail(400, 'BASE_BRANCH_INVALID', 'Choose an existing base branch.');
    const remote = observation.remote;
    return { source: { ...observation.source, ...(remote?.confirmed && remote.repository ? { repositoryId: remote.repository.id, repositoryUrl: remote.repository.url } : {}) },
      notes: observation.diagnostics.map((d) => d.code).filter((code) => code !== 'PROJECT_REQUIRED') };
  }
  async function validateMapping(configuration: ProjectConfiguration): Promise<void> {
    const mapping = configuration.githubProject;
    if (!mapping) return;
    const result = await github.validateProjectSelection({ id: mapping.id, statusFieldId: mapping.statusFieldId, statusOptionIds: Object.values(mapping.statusOptionIds) });
    if (result.state !== 'complete' || !result.data) {
      const invalid = result.diagnostics.some((d) => ['STATUS_FIELD_INACCESSIBLE', 'STATUS_OPTION_INACCESSIBLE', 'NOT_FOUND_OR_INACCESSIBLE'].includes(d.code));
      fail(invalid ? 400 : 503, invalid ? 'STATUS_MAPPING_INVALID' : 'GITHUB_VALIDATION_UNAVAILABLE', 'The exact Project and Status mapping could not be validated.');
    }
    if (result.data.project.id !== mapping.id || result.data.project.owner.id !== mapping.ownerId || result.data.project.closed) fail(400, 'PROJECT_MAPPING_INVALID', 'The Project owner or state is invalid.');
  }
  function settingsResponse(operation: StoredOperation) {
    return { ...storage.getGlobalConfiguration(), operationId: operation.operationId, receipt: receipt(operation) };
  }
  function configurationResponse(projectId: string, operation: StoredOperation) {
    return { ...storage.getConfiguration(projectId), operationId: operation.operationId, receipt: receipt(operation) };
  }
  return {
    listProjects: (query: CatalogQuery) => storage.listProjects(query),
    getProject: (id: string) => storage.getProject(id),
    getSettings: () => storage.getGlobalConfiguration(),
    getConfiguration: (id: string) => storage.getConfiguration(id),
    getQueue: queue.observe,
    saveQueue: queue.save,
    async registerProject(body: ProjectRegistration, context: CommandContext) {
      if (!Value.Check(ProjectRegistration, body)) fail(400, 'REGISTRATION_INVALID', 'Project registration is invalid.');
      const command: ConfigurationCommand = { ...context, kind: 'project.register', body };
      let operation = storage.recoverConfigurationCommand(command);
      if (!operation) {
        const origin = await inspect(body.source, body.baseBranch);
        operation = storage.registerProject({ ...context, body, source: origin.source, originNotes: origin.notes });
      }
      receipt(operation);
      return { ...storage.getProject(operation.resource.id), operationId: operation.operationId };
    },
    async saveSettings(body: SettingsUpdate, context: CommandContext) {
      if (!Value.Check(SettingsUpdate, body)) fail(400, 'SETTINGS_INVALID', 'Settings changes are invalid.');
      const command: ConfigurationCommand = { ...context, kind: 'settings.update', body };
      const recovered = storage.recoverConfigurationCommand(command);
      if (recovered) return settingsResponse(recovered);
      precondition(storage.getGlobalConfiguration().etag, context.expectedRevision);
      const changes = await normalizedGlobals(body.changes);
      return settingsResponse(storage.saveSettings({ ...context, body, changes }));
    },
    async saveConfiguration(projectId: string, body: ConfigurationUpdate, context: CommandContext) {
      if (!Value.Check(ConfigurationUpdate, body)) fail(400, 'CONFIGURATION_INVALID', 'Configuration changes are invalid.');
      const command: ConfigurationCommand = { ...context, kind: 'project.configuration.update', projectId, body };
      const recovered = storage.recoverConfigurationCommand(command);
      if (recovered) return configurationResponse(projectId, recovered);
      const current = storage.getConfiguration(projectId);
      precondition(current.etag, context.expectedRevision);
      const previous = current.view.configuration;
      let configuration: ProjectConfiguration = { ...previous, ...body.projectChanges,
        queueOrder: { ...previous.queueOrder, ...body.projectChanges.queueOrder } };
      // Remove revision metadata before schema validation and the immutable insert.
      const { id: _id, projectId: _project, revision: _revision, createdAtMs: _created, ...fields } = { ...previous, ...configuration };
      configuration = fields;
      let originNotes: readonly string[] | undefined;
      if (body.projectChanges.source !== undefined || body.projectChanges.baseBranch !== undefined) {
        const observed = await inspect(configuration.source, configuration.baseBranch);
        configuration.source = observed.source; originNotes = observed.notes;
      }
      validateProjectConfiguration(configuration);
      await validateMapping(configuration);
      const globalChanges = await normalizedGlobals(body.globalChanges ?? {});
      const operation = storage.saveConfiguration({ ...context, projectId, body, configuration, globalChanges, ...(originNotes ? { originNotes } : {}) });
      return configurationResponse(projectId, operation);
    },
    async getConfigurationOptions(projectId: string, query: ConfigurationOptionsQuery): Promise<ConfigurationOptions> {
      if (!Value.Check(ConfigurationOptionsQuery, query)) fail(400, 'OPTIONS_QUERY_INVALID', 'Configuration options query is invalid.');
      const current = storage.getConfiguration(projectId);
      const mapping = current.view.configuration.githubProject;
      const diagnostics: ConfigurationOptions['diagnostics'] = [];
      const identity = await github.getIdentity();
      diagnostics.push(...identity.diagnostics);
      const selectedProjectId = query.githubProjectId ?? mapping?.id;
      const details = selectedProjectId ? await github.getProject(selectedProjectId) : null;
      if (details) diagnostics.push(...details.diagnostics);
      const ownerId = query.ownerId ?? details?.data?.project.owner.id ?? mapping?.ownerId ?? identity.data?.id;
      const owner = ownerId ? await github.getProjectOwner(ownerId) : null;
      if (owner) diagnostics.push(...owner.diagnostics);
      if (query.ownerKind && owner?.data && query.ownerKind !== owner.data.kind) fail(400, 'OWNER_KIND_INVALID', 'The selected owner kind does not match its identity.');
      const listing = owner?.state === 'complete' && owner.data ? await github.listProjects({ login: owner.data.login, kind: owner.data.kind }) : null;
      if (listing) diagnostics.push(...listing.diagnostics);
      if (details?.data && details.data.project.owner.id !== ownerId) fail(400, 'PROJECT_OWNER_MISMATCH', 'The requested Project belongs to a different owner.');
      const projects = [...(listing?.data ?? [])].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const scope = hash([projectId, current.etag, ownerId ?? null, selectedProjectId ?? null, query.statusFieldId ?? null, projects]);
      let offset = 0;
      if (query.cursor) {
        let c: unknown;
        try { c = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as unknown; } catch { fail(400, 'CURSOR_INVALID', 'Options cursor is invalid.'); }
        if (!c || typeof c !== 'object' || !('scope' in c) || c.scope !== scope || !('offset' in c) || typeof c.offset !== 'number' || !Number.isSafeInteger(c.offset) || c.offset < 0 || c.offset >= projects.length) fail(409, 'OPTIONS_CHANGED', 'Configuration options changed. Reload the first page.');
        offset = c.offset;
      }
      const limit = Number(query.limit ?? '25'); const hasMore = offset + limit < projects.length;
      const complete = identity.state === 'complete' && owner?.state === 'complete' && listing?.state === 'complete' && (!details || details.state === 'complete');
      const statusFields = details?.data?.singleSelectFields ?? [];
      return { projects: { items: projects.slice(offset, offset + limit), hasMore, nextCursor: hasMore ? Buffer.from(JSON.stringify({ scope, offset: offset + limit })).toString('base64url') : null, eventCursor: current.view.eventCursor },
        statusFields, statusOptions: statusFields.find((field) => field.id === (query.statusFieldId ?? mapping?.statusFieldId))?.options ?? [],
        profiles: current.view.profiles, completeness: complete ? 'complete' : listing?.data ? 'partial' : 'unavailable', diagnostics,
        retryAtMs: [identity.retryAtMs, owner?.retryAtMs, listing?.retryAtMs, details?.retryAtMs].reduce<number | null>((max, n) => n === null || n === undefined ? max : Math.max(max ?? 0, n), null) };
    },
  };
}
export type Projects = ReturnType<typeof createProjects>;
