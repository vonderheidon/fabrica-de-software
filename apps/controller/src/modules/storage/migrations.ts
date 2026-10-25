import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { StorageError } from './errors.js';
import { readSettings } from './settings.js';
import { Value } from '@sinclair/typebox/value';
import { readCapturedConfiguration, retiredCostDefaults } from './historical-configuration.js';

export const applicationId = 0x4e465331;

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
  readonly requiresForeignKeysOff?: boolean;
}

interface ProfileColumn { name: string; notnull: number }

function backfillAttemptSearchHeaders(db: Database.Database): void {
  const firstBatch = db.prepare<[number], { rowid: number; id: string; capture_json: string }>(
    'SELECT rowid,id,capture_json FROM attempts ORDER BY rowid LIMIT ?',
  );
  const followingBatches = db.prepare<[number, number], { rowid: number; id: string; capture_json: string }>(
    'SELECT rowid,id,capture_json FROM attempts WHERE rowid>? ORDER BY rowid LIMIT ?',
  );
  const update = db.prepare<[number, string, string]>(
    'UPDATE attempts SET issue_number=?,issue_title=? WHERE id=? AND issue_number IS NULL AND issue_title IS NULL',
  );
  let lastRowId: number | null = null;
  while (true) {
    const rows: Array<{ rowid: number; id: string; capture_json: string }> = lastRowId === null
      ? firstBatch.all(100) : followingBatches.all(lastRowId, 100);
    if (rows.length === 0) break;
    for (const row of rows) {
      lastRowId = row.rowid;
      let capture: ReturnType<typeof readCapturedConfiguration>;
      try {
        capture = readCapturedConfiguration(JSON.parse(row.capture_json));
      } catch {
        // Invalid historical captures remain explicitly unavailable to search.
        continue;
      }
      update.run(capture.issue.number, capture.issue.title, row.id);
    }
    if (rows.length < 100) break;
  }
}

function profileColumns(db: Database.Database): readonly ProfileColumn[] {
  return db.prepare<[], ProfileColumn>("PRAGMA table_info('execution_profiles')").all();
}

function hasProfileLifecycleColumns(columns: readonly ProfileColumn[]): boolean {
  const names = new Set(columns.map((column) => column.name));
  return ['profile_type', 'name_key', 'deleted_at_ms'].every((name) => names.has(name));
}

function profileEffortIsNullable(columns: readonly ProfileColumn[]): boolean {
  return columns.find((column) => column.name === 'effort')?.notnull === 0;
}

function hasProfileLifecycleObjects(db: Database.Database): boolean {
  const index = db.prepare<[], { unique: number; partial: number }>(
    "SELECT \"unique\", partial FROM pragma_index_list('execution_profiles') WHERE name='execution_profiles_live_name'",
  ).get();
  if (index?.unique !== 1 || index.partial !== 1) return false;
  const triggerNames = new Set(db.prepare<[], { name: string }>(`SELECT name FROM sqlite_schema WHERE type='trigger'
    AND name IN ('execution_profiles_lifecycle_insert_valid', 'execution_profiles_lifecycle_update_valid', 'execution_profiles_physical_delete_forbidden')`).all().map((row) => row.name));
  return ['execution_profiles_lifecycle_insert_valid', 'execution_profiles_lifecycle_update_valid', 'execution_profiles_physical_delete_forbidden']
    .every((name) => triggerNames.has(name));
}

function profileLifecycleConstraints(sql: string): string {
  const start = sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS execution_profiles_live_name');
  if (start < 0) throw new StorageError('MIGRATION_RESOURCES_INVALID');
  return sql.slice(start);
}

function capturedProfileIndexes(sql: string): string {
  const start = sql.indexOf('CREATE INDEX IF NOT EXISTS attempts_active_implementer_profile');
  if (start < 0) throw new StorageError('MIGRATION_RESOURCES_INVALID');
  return sql.slice(start);
}

function freshProfileLifecycleTable(sql: string): string {
  return `DROP TABLE execution_profiles;
    CREATE TABLE execution_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      profile_type TEXT NOT NULL CHECK(profile_type IN ('implementer', 'reviewer')),
      name_key TEXT NOT NULL CHECK(length(trim(name_key)) > 0),
      executor TEXT NOT NULL CHECK(executor = 'maestri-omp'),
      provider TEXT NOT NULL CHECK(length(trim(provider)) > 0),
      model TEXT NOT NULL CHECK(length(trim(model)) > 0),
      effort TEXT CHECK(effort IS NULL OR length(trim(effort)) > 0),
      guidance TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
      created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
      updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
      deleted_at_ms INTEGER CHECK(deleted_at_ms IS NULL OR deleted_at_ms >= created_at_ms)
    ) STRICT;
    ${profileLifecycleConstraints(sql)}`;
}

export function loadMigrations(): readonly Migration[] {
  const directory = new URL('./migrations/', import.meta.url);
  const files = ['001_initial_settings.sql', '002_operations_events.sql', '003_projects_configuration.sql', '004_preparations.sql', '005_attempts.sql', '006_deliveries.sql', '007_verification.sql', '008_reviews.sql', '009_questions_limits.sql', '010_recovery.sql', '011_publication_queries.sql', '012_queue_cycles.sql', '013_scaffold.sql', '014_local_publication.sql', '015_pr_upgrades.sql', '016_queue_scheduler.sql', '017_remote_scaffold.sql', '018_context_diagnostics.sql', '019_initial_configuration_facts.sql', '020_local_installation.sql', '021_inference_limits.sql', '022_nullable_profile_effort.sql', '023_execution_profile_lifecycle.sql', '024_diagnostic_configuration_results.sql', '025_project_deletions.sql', '026_project_deletion_finalization.sql', '027_event_context.sql', '028_project_storage_locations.sql', '029_project_storage_transitions.sql', '030_tool_preferences.sql', '031_creation_board_operations.sql', '032_profile_composition.sql', '033_managed_terminals.sql', '034_session_continuity.sql', '035_correction_package.sql', '036_review_approval.sql', '037_finding_progress.sql', '038_finding_disputes.sql', '039_attempt_decisions.sql', '040_publication_targets.sql', '041_delivery_targets.sql', '042_local_commit_reconciliation.sql', '043_integration_rounds.sql', '044_storage_deletion_authority.sql', '045_attempt_search_headers.sql', '046_attempt_stage_intervals.sql', '047_notification_dispatches.sql', '048_shutdown_barriers.sql', '049_shutdown_resume.sql'];
  try {
    const actual = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
    if (JSON.stringify(files) !== JSON.stringify(actual)) {
      throw new StorageError('MIGRATION_RESOURCES_INVALID');
    }
    return files.map((name, index) => {
      const sql = readFileSync(new URL(name, directory), 'utf8');
      return { version: index + 1, name, sql, checksum: createHash('sha256').update(sql).digest('hex'),
        ...(['022_nullable_profile_effort.sql', '023_execution_profile_lifecycle.sql'].includes(name) ? { requiresForeignKeysOff: true } : {}) };
    });
  } catch (error) {
    throw new StorageError('MIGRATION_RESOURCES_INVALID', { cause: error });
  }
}

/** Read-only compatibility check; also repeated under the write lock before migration. */
export function inspectHistory(db: Database.Database, migrations: readonly Migration[]): number {
  if (db.pragma('quick_check', { simple: true }) !== 'ok') {
    throw new StorageError('STORAGE_INTEGRITY_FAILED');
  }
  const version: unknown = db.pragma('user_version', { simple: true });
  const identity: unknown = db.pragma('application_id', { simple: true });
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new StorageError('MIGRATION_HISTORY_INVALID');
  }
  if (version > migrations.length) throw new StorageError('DATABASE_NEWER_THAN_APPLICATION');

  const objects = db.prepare<[], { name: string }>(
    "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all();
  if (!objects.some((object) => object.name === 'schema_migrations')) {
    if (version !== 0 || identity !== 0 || objects.length !== 0) throw new StorageError('DATABASE_UNKNOWN');
    return 0;
  }
  if (identity !== applicationId) throw new StorageError('DATABASE_UNKNOWN');
  const rows = db.prepare<[], { version: number; name: string; checksum: string }>(
    'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
  ).all();
  if (rows.length > migrations.length || rows.some((row) => row.version > migrations.length)) {
    throw new StorageError('DATABASE_NEWER_THAN_APPLICATION');
  }
  if (version !== rows.length || rows.length === 0) throw new StorageError('MIGRATION_HISTORY_INVALID');
  rows.forEach((row, index) => {
    const expected = migrations[index];
    if (!expected || row.version !== expected.version || row.name !== expected.name) {
      throw new StorageError('MIGRATION_HISTORY_INVALID');
    }
    if (row.checksum !== expected.checksum) throw new StorageError('MIGRATION_CHECKSUM_MISMATCH');
  });
  const profileSchemaMigration = migrations.find((migration) => migration.name === '023_execution_profile_lifecycle.sql');
  if (profileSchemaMigration && version < profileSchemaMigration.version &&
    objects.some((object) => object.name === 'execution_profiles')) {
    const columns = profileColumns(db);
    const compatibleSchema = hasProfileLifecycleColumns(columns) && profileEffortIsNullable(columns);
    if (!compatibleSchema && db.prepare<[], { present: number }>(
      'SELECT 1 AS present FROM execution_profiles LIMIT 1',
    ).get()) {
      throw new StorageError('PROFILE_SCHEMA_INCOMPATIBLE');
    }
  }
  // Reject incompatible configuration before opening a writable connection or applying any delta.
  // Repeat under the migration transaction so a concurrent change cannot bypass this check.
  if (objects.some((object) => object.name === 'factory_settings')) {
    readSettings(db);
    if (version < 21) {
      const row = db.prepare<[], { cost_defaults_json: string }>('SELECT cost_defaults_json FROM factory_settings').get();
      try {
        if (!row || !Value.Check(retiredCostDefaults, JSON.parse(row.cost_defaults_json))) throw new StorageError('SETTINGS_INVALID');
      } catch (error) { throw new StorageError('SETTINGS_INVALID', { cause: error }); }
    }
    // Validate retired fields only in historical schemas, without exporting or using their paths.
    if (version < 20) {
      const legacy = db.prepare<[], { data_root: string; maestri_settings_json: string }>('SELECT data_root, maestri_settings_json FROM factory_settings').get();
      if (!legacy || !legacy.data_root.trim()) throw new StorageError('SETTINGS_INVALID');
      try {
        const value: unknown = JSON.parse(legacy.maestri_settings_json);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StorageError('SETTINGS_INVALID');
        const settings = value as Record<string, unknown>;
        if (settings.formatVersion !== 1 || Object.keys(settings).some(key => !['formatVersion', 'workspaceId'].includes(key)) ||
          (settings.workspaceId !== undefined && settings.workspaceId !== null && (typeof settings.workspaceId !== 'string' || !settings.workspaceId.trim() || settings.workspaceId.length > 256))) throw new StorageError('SETTINGS_INVALID');
      } catch (error) { throw new StorageError('SETTINGS_INVALID', { cause: error }); }
    }
  }
  const violations: unknown = db.pragma('foreign_key_check');
  if (!Array.isArray(violations) || violations.length !== 0) throw new StorageError('STORAGE_INTEGRITY_FAILED');
  return rows.length;
}

export function applyMigrations(
  db: Database.Database,
  migrations: readonly Migration[],
  initializeSettings: () => void,
): void {
  const applyThrough = (maximumVersion: number, disableForeignKeys: boolean): void => {
    const restoreForeignKeys = disableForeignKeys && db.pragma('foreign_keys', { simple: true }) === 1;
    if (disableForeignKeys) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        const applied = inspectHistory(db, migrations);
        if (applied === 0) {
          db.exec(`CREATE TABLE schema_migrations (
            version INTEGER PRIMARY KEY CHECK(version >= 1),
            name TEXT NOT NULL UNIQUE,
            checksum TEXT NOT NULL CHECK(length(checksum) = 64),
            applied_at_ms INTEGER NOT NULL CHECK(applied_at_ms >= 0)
          ) STRICT`);
        }
        const insert = db.prepare<[number, string, string, number]>(
          'INSERT INTO schema_migrations(version, name, checksum, applied_at_ms) VALUES (?, ?, ?, ?)',
        );
        for (const migration of migrations.slice(applied).filter((item) => item.version <= maximumVersion)) {
          const profileTableExists = db.prepare<[], { present: number }>(
            "SELECT 1 AS present FROM sqlite_schema WHERE type='table' AND name='execution_profiles'",
          ).get() !== undefined;
          const columns = profileTableExists ? profileColumns(db) : [];
          if (migration.name === '022_nullable_profile_effort.sql' && profileEffortIsNullable(columns)) {
            // The database already has the target column shape; retain its typed profile rows.
          } else if (migration.name === '023_execution_profile_lifecycle.sql' && hasProfileLifecycleColumns(columns)) {
            if (!hasProfileLifecycleObjects(db)) throw new StorageError('PROFILE_SCHEMA_INCOMPATIBLE');
            // A complete profile schema can be recognized while repairing its additive capture indexes.
            db.exec(capturedProfileIndexes(migration.sql));
          } else if (migration.name === '023_execution_profile_lifecycle.sql' && profileTableExists &&
            (db.prepare<[], { count: number }>('SELECT count(*) AS count FROM execution_profiles').get()?.count ?? 0) === 0) {
            db.exec(freshProfileLifecycleTable(migration.sql));
          } else {
            db.exec(migration.sql);
          }
          if (migration.name === '032_profile_composition.sql') migrateLegacyProfileComposition(db);
          if (migration.name === '045_attempt_search_headers.sql') backfillAttemptSearchHeaders(db);
          insert.run(migration.version, migration.name, migration.checksum, Date.now());
          db.pragma(`user_version = ${migration.version}`);
        }
        const violations: unknown = db.pragma('foreign_key_check');
        if (!Array.isArray(violations) || violations.length !== 0) throw new StorageError('STORAGE_INTEGRITY_FAILED');
        db.pragma(`application_id = ${applicationId}`);
        if (applied === 0) initializeSettings();
      }).immediate();
    } finally {
      if (restoreForeignKeys) db.pragma('foreign_keys = ON');
    }
  };
  try {
    const applied = inspectHistory(db, migrations);
    const special = migrations.slice(applied).find((migration) => migration.requiresForeignKeysOff);
    const latestVersion = migrations.at(-1)?.version ?? 0;
    if (!special || applied === 0) applyThrough(latestVersion, false);
    else {
      if (applied < special.version - 1) applyThrough(special.version - 1, false);
      applyThrough(latestVersion, true);
    }
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('MIGRATION_FAILED', { cause: error });
  }
}

interface LegacyRoleResource { id: string; role: 'implementer' | 'reviewer'; version: number; instructions: string }
function legacyRoleInstructions(role: 'implementer' | 'reviewer'): string {
  try {
    const resource: unknown = JSON.parse(readFileSync(new URL(`../../../../../resources/roles/${role}.v1.json`, import.meta.url), 'utf8'));
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) throw new Error('invalid role resource');
    const value = resource as Partial<LegacyRoleResource>;
    if (value.id !== `factory.${role}` || value.role !== role || value.version !== 1 || typeof value.instructions !== 'string' ||
      !value.instructions.trim() || value.instructions.length > 8192) throw new Error('invalid role resource');
    return value.instructions;
  } catch (error) {
    throw new StorageError('MIGRATION_RESOURCES_INVALID', { cause: error });
  }
}

function migrateLegacyProfileComposition(db: Database.Database): void {
  const instructions = {
    implementer: legacyRoleInstructions('implementer'),
    reviewer: legacyRoleInstructions('reviewer'),
  };
  const profiles = db.prepare<[], { id: string; profile_type: 'implementer' | 'reviewer'; guidance: string; revision: number; updated_at_ms: number }>(
    `SELECT id, profile_type, guidance, revision, updated_at_ms FROM execution_profiles
     WHERE deleted_at_ms IS NULL AND composition_version IS NULL ORDER BY id`,
  ).all();
  const update = db.prepare<[string, number | null, number, number, string]>(`UPDATE execution_profiles
    SET guidance = ?, composition_version = ?, revision = ?, updated_at_ms = ?
    WHERE id = ? AND composition_version IS NULL`);
  const now = Date.now();
  for (const profile of profiles) {
    if (profile.profile_type !== 'implementer' && profile.profile_type !== 'reviewer') {
      throw new StorageError('PROFILE_SCHEMA_INCOMPATIBLE');
    }
    const behavior = instructions[profile.profile_type];
    const guidance = profile.guidance.includes(behavior)
      ? profile.guidance
      : profile.guidance.length === 0 ? behavior : `${profile.guidance}\n\n${behavior}`;
    // Keep incompatible legacy content byte-for-byte and visibly uncomposed; never truncate it.
    if (profile.revision >= Number.MAX_SAFE_INTEGER) continue;
    const composed = guidance.length <= 8192;
    update.run(composed ? guidance : profile.guidance, composed ? 1 : null,
      profile.revision + 1, Math.max(now, profile.updated_at_ms), profile.id);
  }
}
