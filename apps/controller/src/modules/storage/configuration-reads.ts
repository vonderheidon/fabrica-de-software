import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import {
  CatalogQuery, ConfigurationView, OperationId, ProjectDetail, ProjectPage, ProjectRevision, SettingsView, StoredExecutionProfile,
  type FactorySettings, type Prerequisite, type ProjectConfiguration, type ProjectSummary,
} from '#contracts';
import { readSettings } from './settings.js';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';

export const digest = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}
export function guarded<T>(action: () => T): T {
  try { return action(); } catch (error) {
    if (error instanceof OperationError || error instanceof StorageError) throw error;
    throw new StorageError('CONFIGURATION_STORAGE_FAILED', { cause: error });
  }
}
export function eventCursor(db: Database.Database): string {
  const s = readSettings(db);
  return String(db.prepare<[string, string | null], { seq: number }>('SELECT coalesce(max(e.seq), 0) AS seq FROM events e JOIN operation_requests o ON o.operation_id = e.operation_id WHERE o.installation_id = ? AND o.account_id IS ?').get(s.installationId, s.accountId)?.seq ?? 0);
}
export function readSettingsView(db: Database.Database): SettingsView {
  const profiles = db.prepare<[], StoredExecutionProfile>('SELECT id, name, executor, provider, model, effort, guidance, revision, created_at_ms AS createdAtMs, updated_at_ms AS updatedAtMs FROM execution_profiles ORDER BY id').all();
  if (profiles.some((p) => !Value.Check(StoredExecutionProfile, p))) throw new StorageError('PROFILE_DATA_INVALID');
  const view = { settings: readSettings(db), profiles, eventCursor: eventCursor(db) };
  if (!Value.Check(SettingsView, view)) throw new StorageError('SETTINGS_INVALID');
  return view;
}
export function configurationETag(view: SettingsView | ConfigurationView): string {
  return `"${digest({ installation: view.settings.installationId, account: view.settings.accountId, settings: view.settings.revision,
    profiles: view.profiles.map((p) => [p.id, p.revision]),
    project: 'configuration' in view ? [view.configuration.projectId, view.configuration.id, view.configuration.revision] : null })}"`;
}
interface ProjectRow {
  id: string; name: string; account_id: string | null; revision: number; current_revision_id: string;
  source_kind: 'local' | 'github'; source_location: string; repository_id: string | null; repository_url: string | null;
  base_branch: string; github_project_id: string | null; implementer_profile_id: string | null; reviewer_profile_id: string | null;
  origin_notes_json: string;
}
const summaryColumns = `p.id, p.name, p.account_id, p.revision, p.current_revision_id, r.source_kind, r.source_location,
  r.repository_id, r.repository_url, r.base_branch, r.github_project_id, r.implementer_profile_id, r.reviewer_profile_id, r.origin_notes_json`;
export function prerequisites(config: Pick<ProjectConfiguration, 'source' | 'implementerProfileId' | 'reviewerProfileId'> & { githubProject: { id: string } | null }, notes: readonly string[] = []): Prerequisite[] {
  const result: Prerequisite[] = [];
  const add = (code: string, message: string, recovery: string) => result.push({ code, message, recovery });
  if (!config.source.repositoryId) add('REMOTE_UNCONFIRMED', 'A confirmed GitHub repository is missing.', 'Confirm a GitHub remote before preparing an attempt.');
  if (!config.githubProject) add('PROJECT_REQUIRED', 'GitHub Project and Status mapping are missing.', 'Configure the exact Project, field and option IDs.');
  if (!config.implementerProfileId || !config.reviewerProfileId) add('PROFILES_REQUIRED', 'Both execution roles require profiles.', 'Configure and select complete execution profiles.');
  for (const code of notes) add(code, code === 'LOCAL_CHANGES_EXCLUDED' ? 'Uncommitted origin changes are excluded from attempts.' : 'Origin inspection reported a prerequisite.', 'Inspect the origin before preparing an attempt.');
  add('EXECUTION_REVALIDATION_REQUIRED', 'Registration and configuration do not authorize execution.', 'Preparation must revalidate account, origin, issue membership and executor.');
  return result;
}
function source(row: ProjectRow): ProjectConfiguration['source'] {
  return { kind: row.source_kind, location: row.source_location,
    ...(row.repository_id && row.repository_url ? { repositoryId: row.repository_id, repositoryUrl: row.repository_url } : {}) };
}
function summary(row: ProjectRow, settings: FactorySettings): ProjectSummary {
  const originNotes: unknown = JSON.parse(row.origin_notes_json);
  if (!Array.isArray(originNotes) || originNotes.length > 50 || !originNotes.every((n): n is string => typeof n === 'string' && /^[A-Z_]{1,128}$/.test(n))) throw new StorageError('PROJECT_DATA_INVALID');
  const globalPrerequisites: Prerequisite[] = [];
  if (!settings.accountId) globalPrerequisites.push({ code: 'ACCOUNT_UNOBSERVED', message: 'No GitHub account has been selected from an observation.', recovery: 'Observe the authorized controller account before execution.' });
  if (!settings.designatedHost) globalPrerequisites.push({ code: 'DESIGNATED_HOST_REQUIRED', message: 'An executor host is not configured.', recovery: 'Configure the designated executor host.' });
  if (!settings.projectsRoot) globalPrerequisites.push({ code: 'PROJECTS_ROOT_REQUIRED', message: 'A project root is not configured.', recovery: 'Choose an accessible local project directory.' });
  return { id: row.id, name: row.name, accountId: row.account_id, source: source(row), baseBranch: row.base_branch,
    revision: row.revision, currentRevisionId: row.current_revision_id,
    prerequisites: [...prerequisites({ source: source(row), githubProject: row.github_project_id ? { id: row.github_project_id } : null,
      implementerProfileId: row.implementer_profile_id, reviewerProfileId: row.reviewer_profile_id }, originNotes), ...globalPrerequisites],
  };
}
export function readProject(db: Database.Database, id: string): ProjectDetail {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'PROJECT_ID_INVALID', 'Project ID is invalid.');
  const s = readSettings(db);
  const row = db.prepare<[string, string | null], ProjectRow>(`SELECT ${summaryColumns} FROM projects p JOIN project_revisions r ON r.id = p.current_revision_id AND r.project_id = p.id WHERE p.id = ? AND (p.account_id IS ? OR p.account_id IS NULL)`).get(id, s.accountId);
  if (!row) throw new OperationError(404, 'PROJECT_NOT_FOUND', 'Project not found in the current scope.');
  const project = summary(row, s);
  const view = { project, prerequisites: project.prerequisites, eventCursor: eventCursor(db) };
  if (!Value.Check(ProjectDetail, view)) throw new StorageError('PROJECT_DATA_INVALID');
  return view;
}
export function readConfiguration(db: Database.Database, projectId: string): ConfigurationView {
  const project = readProject(db, projectId);
  const r = db.prepare<[string], Record<string, unknown>>('SELECT * FROM project_revisions WHERE id = ?').get(project.project.currentRevisionId);
  if (!r) throw new StorageError('PROJECT_DATA_INVALID');
  const configuration: unknown = { id: r.id, projectId, revision: r.revision_number, createdAtMs: r.created_at_ms,
    source: project.project.source, baseBranch: r.base_branch,
    githubProject: r.github_project_id === null ? null : { id: r.github_project_id, ownerId: r.github_project_owner_id, statusFieldId: r.status_field_id, statusOptionIds: JSON.parse(String(r.status_options_json)) as unknown },
    implementerProfileId: r.implementer_profile_id, reviewerProfileId: r.reviewer_profile_id,
    checks: JSON.parse(String(r.checks_json)) as unknown, correctionLimit: r.correction_limit, defaultDeliveryMode: r.default_delivery_mode,
    automationEnabled: r.automation_enabled === 1, queueOrder: JSON.parse(String(r.queue_order_json)) as unknown, guidance: r.guidance,
  };
  if (!Value.Check(ProjectRevision, configuration)) throw new StorageError('PROJECT_DATA_INVALID');
  const view = { configuration, ...readSettingsView(db), prerequisites: project.prerequisites };
  if (!Value.Check(ConfigurationView, view)) throw new StorageError('PROJECT_DATA_INVALID');
  return view;
}
export function readProjects(db: Database.Database, query: CatalogQuery): ProjectPage {
  if (!Value.Check(CatalogQuery, query)) throw new OperationError(400, 'CATALOG_QUERY_INVALID', 'Catalog query is invalid.');
  const s = readSettings(db);
  const search = query.search ?? '';
  const scope = digest({ installation: s.installationId, account: s.accountId, search, order: 'name-nocase,id', version: 1 });
  let afterName = ''; let afterId = ''; let highWater = db.prepare<[], { n: number }>('SELECT coalesce(max(rowid),0) AS n FROM projects').get()?.n ?? 0;
  if (query.cursor) {
    let c: unknown;
    try { c = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as unknown; } catch { throw new OperationError(400, 'CURSOR_INVALID', 'Catalog cursor is invalid.'); }
    if (!c || typeof c !== 'object' || !('scope' in c) || c.scope !== scope || !('after' in c) || typeof c.after !== 'string' || !('highWater' in c) || typeof c.highWater !== 'number' || !Number.isSafeInteger(c.highWater) || c.highWater < 0 || c.highWater > highWater) throw new OperationError(400, 'CURSOR_INVALID', 'Catalog cursor is invalid for this filter or scope.');
    highWater = c.highWater;
    const anchor = db.prepare<[string, number, string | null], { name: string }>('SELECT name FROM projects WHERE id = ? AND rowid <= ? AND (account_id IS ? OR account_id IS NULL)').get(c.after, highWater, s.accountId);
    if (!anchor) throw new OperationError(400, 'CURSOR_INVALID', 'Catalog cursor anchor is unavailable.');
    afterName = anchor.name; afterId = c.after;
  }
  const limit = Number(query.limit ?? '25');
  const rows = db.prepare(`SELECT ${summaryColumns} FROM projects p JOIN project_revisions r ON r.id = p.current_revision_id AND r.project_id = p.id
    WHERE (p.account_id IS ? OR p.account_id IS NULL) AND p.rowid <= ? AND instr(lower(p.name), lower(?)) > 0
    AND (p.name COLLATE NOCASE > ? OR (p.name COLLATE NOCASE = ? AND p.id > ?)) ORDER BY p.name COLLATE NOCASE, p.id LIMIT ?`)
    .all(s.accountId, highWater, search, afterName, afterName, afterId, limit + 1) as ProjectRow[];
  const items = rows.slice(0, limit).map((row) => summary(row, s));
  const hasMore = rows.length > limit;
  const view = { items, nextCursor: hasMore ? Buffer.from(JSON.stringify({ scope, after: items.at(-1)?.id, highWater })).toString('base64url') : null, hasMore, eventCursor: eventCursor(db) };
  if (!Value.Check(ProjectPage, view)) throw new StorageError('PROJECT_DATA_INVALID');
  return view;
}
