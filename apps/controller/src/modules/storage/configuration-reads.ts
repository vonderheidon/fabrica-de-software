import { readCheckDefinitions, readStatusOptionIds, readQueueOrderJson } from './configuration-json.js';
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
  return String(db.prepare<[string, string | null], { seq: number }>('SELECT coalesce(max(e.seq), 0) AS seq FROM events e JOIN operation_requests o ON o.operation_id = e.operation_id WHERE o.installation_id = ? AND o.account_id IS ?').get(s.installation_id, s.account_id)?.seq ?? 0);
}
export function readSettingsView(db: Database.Database): SettingsView {
  const profiles = db.prepare<[], StoredExecutionProfile>(`SELECT id, name, executor, provider, model, effort, guidance,
    profile_type, revision, created_at_ms, updated_at_ms FROM execution_profiles
    WHERE deleted_at_ms IS NULL ORDER BY id`).all();
  if (profiles.some((p) => !Value.Check(StoredExecutionProfile, p))) throw new StorageError('PROFILE_DATA_INVALID');
  const profileCounts = profiles.reduce((counts, profile) => ({
    all: counts.all + 1,
    implementer: counts.implementer + Number(profile.profile_type === 'implementer'),
    reviewer: counts.reviewer + Number(profile.profile_type === 'reviewer'),
  }), { all: 0, implementer: 0, reviewer: 0 });
  const settings = readSettings(db);
  const linkedAccount = settings.account_id === null ? null : db.prepare<[string], { id: string }>(
    'SELECT github_account_id AS id FROM accounts WHERE github_account_id = ?',
  ).get(settings.account_id);
  if (settings.account_id !== null && !linkedAccount) throw new StorageError('SETTINGS_INVALID');
  const onboardingRow = db.prepare<[], {
    onboarding_suppressed: unknown;
    onboarding_completed_at_ms: unknown;
    projects_root_confirmed_at_ms: unknown;
  }>(`SELECT onboarding_suppressed, onboarding_completed_at_ms, projects_root_confirmed_at_ms
    FROM factory_settings WHERE id = 'local'`).get();
  if (!onboardingRow || (onboardingRow.onboarding_suppressed !== 0 && onboardingRow.onboarding_suppressed !== 1) ||
    (onboardingRow.onboarding_completed_at_ms !== null && (!Number.isSafeInteger(onboardingRow.onboarding_completed_at_ms) || Number(onboardingRow.onboarding_completed_at_ms) < 0)) ||
    (onboardingRow.projects_root_confirmed_at_ms !== null && (!Number.isSafeInteger(onboardingRow.projects_root_confirmed_at_ms) || Number(onboardingRow.projects_root_confirmed_at_ms) < 0))) {
    throw new StorageError('SETTINGS_INVALID');
  }
  const completedAt = onboardingRow.onboarding_completed_at_ms as number | null;
  const rootConfirmedAt = onboardingRow.projects_root_confirmed_at_ms as number | null;
  const firstIncompleteStep = completedAt !== null ? null
    : !linkedAccount ? 'github'
      : settings.projects_root === null || rootConfirmedAt === null ? 'projects_root'
        : profileCounts.implementer === 0 || profileCounts.reviewer === 0 ? 'profiles' : null;
  const onboardingPrerequisites: Prerequisite[] = [];
  if (completedAt === null) {
    if (!linkedAccount) onboardingPrerequisites.push({ code: 'ACCOUNT_UNOBSERVED',
      message: 'Uma conta GitHub elegível ainda não foi vinculada.', recovery: 'Verifique o status do GitHub e vincule uma conta elegível.' });
    if (settings.projects_root === null) onboardingPrerequisites.push({ code: 'PROJECTS_ROOT_REQUIRED',
      message: 'A pasta dos projetos ainda não foi configurada.', recovery: 'Escolha e confirme uma pasta com acesso e gravação.' });
    else if (rootConfirmedAt === null) onboardingPrerequisites.push({ code: 'PROJECTS_ROOT_CONFIRMATION_REQUIRED',
      message: 'A pasta dos projetos ainda não foi confirmada para acesso e gravação.', recovery: 'Confirme novamente a pasta dos projetos.' });
    if (profileCounts.implementer === 0) onboardingPrerequisites.push({ code: 'IMPLEMENTER_PROFILE_REQUIRED',
      message: 'Falta um perfil Implementador ativo.', recovery: 'Crie um perfil Implementador em Configuração > Perfis.' });
    if (profileCounts.reviewer === 0) onboardingPrerequisites.push({ code: 'REVIEWER_PROFILE_REQUIRED',
      message: 'Falta um perfil Revisor ativo.', recovery: 'Crie um perfil Revisor em Configuração > Perfis.' });
  }
  const unavailableSelection = {
    available: false,
    reason_code: 'NATIVE_SELECTION_UNAVAILABLE',
    reason: 'A seleção nativa não está disponível nesta composição do host.',
    recovery: 'Inicie a fábrica pelo host que oferece a seleção nativa e consulte novamente.',
  } as const;
  const view = {
    settings,
    profiles,
    profile_counts: profileCounts,
    onboarding: { suppressed: onboardingRow.onboarding_suppressed === 1, completed_at_ms: completedAt,
      first_incomplete_step: firstIncompleteStep, prerequisites: onboardingPrerequisites },
    selection_capabilities: { projects_root: unavailableSelection, gh_executable: unavailableSelection },
    event_cursor: eventCursor(db),
  };
  if (!Value.Check(SettingsView, view)) throw new StorageError('SETTINGS_INVALID');
  return view;
}
export function configurationETag(view: SettingsView | ConfigurationView): string {
  return `"${digest({ installation: view.settings.installation_id, account: view.settings.account_id, settings: view.settings.revision,
    profiles: view.profiles.map((p) => [p.id, p.revision]),
    project: 'configuration' in view ? [view.configuration.project_id, view.configuration.id, view.configuration.revision] : null })}"`;
}
interface ProjectRow {
  id: string; name: string; account_id: string | null; revision: number; current_revision_id: string;
  source_kind: 'local' | 'github'; source_location: string; repository_id: string | null; repository_url: string | null;
  base_branch: string; github_project_id: string | null; implementer_profile_id: string | null; reviewer_profile_id: string | null;
  origin_notes_json: string;
}
const summaryColumns = `p.id, p.name, p.account_id, p.revision, p.current_revision_id, r.source_kind, r.source_location,
  r.repository_id, r.repository_url, r.base_branch, r.github_project_id, r.implementer_profile_id, r.reviewer_profile_id, r.origin_notes_json`;
export function prerequisites(config: Pick<ProjectConfiguration, 'source' | 'implementer_profile_id' | 'reviewer_profile_id'> & { github_project: { id: string } | null }, notes: readonly string[] = []): Prerequisite[] {
  const result: Prerequisite[] = [];
  const add = (code: string, message: string, recovery: string) => result.push({ code, message, recovery });
  if (!config.source.repository_id) add('REMOTE_UNCONFIRMED', 'O repositório GitHub ainda não foi confirmado.', 'Confirme a origem GitHub na configuração do projeto.');
  if (!config.github_project) add('PROJECT_REQUIRED', 'O quadro GitHub e o mapeamento de Status ainda não foram configurados.', 'Selecione o quadro pelo nome e mapeie os valores de Status na configuração do projeto.');
  if (!config.implementer_profile_id || !config.reviewer_profile_id) add('PROFILES_REQUIRED', 'Falta associar perfis aos papéis de Implementador e Revisor.', 'Selecione um perfil ativo para cada papel na configuração do projeto.');
  for (const code of notes) add(code, code === 'LOCAL_CHANGES_EXCLUDED' ? 'Alterações locais sem commit não entram nas tentativas.' : 'A consulta da origem encontrou um pré-requisito pendente.', 'Confira a origem antes de preparar uma issue.');
  add('EXECUTION_REVALIDATION_REQUIRED', 'Revise os pré-requisitos na preparação antes de iniciar.', 'A preparação confere conta, origem, vínculo da issue ao quadro e executor novamente.');
  return result;
}
function source(row: ProjectRow): ProjectConfiguration['source'] {
  return { kind: row.source_kind, location: row.source_location,
    ...(row.repository_id && row.repository_url ? { repository_id: row.repository_id, repository_url: row.repository_url } : {}) };
}
function summary(row: ProjectRow, settings: FactorySettings): ProjectSummary {
  const originNotes: unknown = JSON.parse(row.origin_notes_json);
  if (!Array.isArray(originNotes) || originNotes.length > 50 || !originNotes.every((n): n is string => typeof n === 'string' && /^[A-Z_]{1,128}$/.test(n))) throw new StorageError('PROJECT_DATA_INVALID');
  const globalPrerequisites: Prerequisite[] = [];
  if (!settings.account_id) globalPrerequisites.push({ code: 'ACCOUNT_UNOBSERVED', message: 'No GitHub account has been selected from an observation.', recovery: 'Observe the authorized controller account before execution.' });
  if (!settings.projects_root) globalPrerequisites.push({ code: 'PROJECTS_ROOT_REQUIRED', message: 'A project root is not configured.', recovery: 'Choose an accessible local project directory.' });
  return { id: row.id, name: row.name, account_id: row.account_id, source: source(row), base_branch: row.base_branch,
    revision: row.revision, current_revision_id: row.current_revision_id,
    prerequisites: [...prerequisites({ source: source(row), github_project: row.github_project_id ? { id: row.github_project_id } : null,
      implementer_profile_id: row.implementer_profile_id, reviewer_profile_id: row.reviewer_profile_id }, originNotes), ...globalPrerequisites],
  };
}
export function readProject(db: Database.Database, id: string): ProjectDetail {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'PROJECT_ID_INVALID', 'Project ID is invalid.');
  const s = readSettings(db);
  const row = db.prepare<[string, string | null], ProjectRow>(`SELECT ${summaryColumns} FROM projects p JOIN project_revisions r ON r.id = p.current_revision_id AND r.project_id = p.id WHERE p.id = ? AND (p.account_id IS ? OR p.account_id IS NULL)`).get(id, s.account_id);
  if (!row) throw new OperationError(404, 'PROJECT_NOT_FOUND', 'Project not found in the current scope.');
  const project = summary(row, s);
  const view = { project, prerequisites: project.prerequisites, event_cursor: eventCursor(db) };
  if (!Value.Check(ProjectDetail, view)) throw new StorageError('PROJECT_DATA_INVALID');
  return view;
}
export function readConfiguration(db: Database.Database, projectId: string): ConfigurationView {
  const project = readProject(db, projectId);
  const r = db.prepare<[string], Record<string, unknown>>('SELECT * FROM project_revisions WHERE id = ?').get(project.project.current_revision_id);
  if (!r) throw new StorageError('PROJECT_DATA_INVALID');
  const configuration: unknown = { id: r.id, project_id: projectId, revision: r.revision_number, created_at_ms: r.created_at_ms,
    source: project.project.source, base_branch: r.base_branch,
    github_project: r.github_project_id === null ? null : { id: r.github_project_id, owner_id: r.github_project_owner_id, status_field_id: r.status_field_id, status_option_ids: readStatusOptionIds(JSON.parse(String(r.status_options_json)) as unknown) },
    implementer_profile_id: r.implementer_profile_id, reviewer_profile_id: r.reviewer_profile_id,
    checks: readCheckDefinitions(JSON.parse(String(r.checks_json)) as unknown), correction_limit: r.correction_limit, default_delivery_mode: r.default_delivery_mode,
    automation_enabled: r.automation_enabled === 1, queue_order: readQueueOrderJson(JSON.parse(String(r.queue_order_json)) as unknown), guidance: r.guidance,
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
  const scope = digest({ installation: s.installation_id, account: s.account_id, search, order: 'name-nocase,id', version: 1 });
  let afterName = ''; let afterId = ''; let highWater = db.prepare<[], { n: number }>('SELECT coalesce(max(rowid),0) AS n FROM projects').get()?.n ?? 0;
  if (query.cursor) {
    let c: unknown;
    try { c = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as unknown; } catch { throw new OperationError(400, 'CURSOR_INVALID', 'Catalog cursor is invalid.'); }
    if (!c || typeof c !== 'object' || !('scope' in c) || c.scope !== scope || !('after' in c) || typeof c.after !== 'string' || !('highWater' in c) || typeof c.highWater !== 'number' || !Number.isSafeInteger(c.highWater) || c.highWater < 0 || c.highWater > highWater) throw new OperationError(400, 'CURSOR_INVALID', 'Catalog cursor is invalid for this filter or scope.');
    highWater = c.highWater;
    const anchor = db.prepare<[string, number, string | null], { name: string }>('SELECT name FROM projects WHERE id = ? AND rowid <= ? AND (account_id IS ? OR account_id IS NULL)').get(c.after, highWater, s.account_id);
    if (!anchor) throw new OperationError(400, 'CURSOR_INVALID', 'Catalog cursor anchor is unavailable.');
    afterName = anchor.name; afterId = c.after;
  }
  const limit = Number(query.limit ?? '25');
  const rows = db.prepare(`SELECT ${summaryColumns} FROM projects p JOIN project_revisions r ON r.id = p.current_revision_id AND r.project_id = p.id
    WHERE (p.account_id IS ? OR p.account_id IS NULL) AND p.rowid <= ? AND instr(lower(p.name), lower(?)) > 0
    AND (p.name COLLATE NOCASE > ? OR (p.name COLLATE NOCASE = ? AND p.id > ?)) ORDER BY p.name COLLATE NOCASE, p.id LIMIT ?`)
    .all(s.account_id, highWater, search, afterName, afterName, afterId, limit + 1) as ProjectRow[];
  const items = rows.slice(0, limit).map((row) => summary(row, s));
  const hasMore = rows.length > limit;
  const view = { items, next_cursor: hasMore ? Buffer.from(JSON.stringify({ scope, after: items.at(-1)?.id, highWater })).toString('base64url') : null, has_more: hasMore, event_cursor: eventCursor(db) };
  if (!Value.Check(ProjectPage, view)) throw new StorageError('PROJECT_DATA_INVALID');
  return view;
}
