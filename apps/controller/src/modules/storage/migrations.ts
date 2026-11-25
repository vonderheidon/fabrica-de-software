import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { AttemptWorkspaceSnapshot, managedWorkspaceReference, ProjectRevision, ScaffoldPlanV3 } from '#contracts';
import { readQueueOrderJson, readStatusOptionIds } from './configuration-json.js';
import { digest } from './configuration-reads.js';
import { StorageError } from './errors.js';
import { readSettings } from './settings.js';
import { readCapturedConfiguration, readPreparationChoices } from './historical-configuration.js';

export const applicationId = 0x4e465331;

export interface HistoricalLedgerEntry {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

export interface SchemaRecognitionResources {
  readonly applicationId: number;
  readonly directInstallUserVersion: number;
  readonly previousDirectInstallUserVersion: number;
  readonly currentLedgerUserVersion: number;
  readonly currentSchemaSha256: string;
  readonly previousSchemaSha256: string;
  readonly schemaSql: string;
  readonly upgradeMigration: HistoricalLedgerEntry;
  readonly upgradeMigrationSql: string;
  readonly historicalLedger: readonly HistoricalLedgerEntry[];
}

export interface DatabaseRecognition {
  readonly kind: 'empty' | 'direct' | 'historical-ledger' | 'previous-direct' | 'previous-ledger';
  readonly schemaVersion: number;
}

interface SchemaRecognitionDocument {
  readonly format_version: 1;
  readonly application_id: number;
  readonly direct_install_user_version: number;
  readonly previous_direct_install_user_version: number;
  readonly current_ledger_user_version: number;
  readonly current_schema_sha256: string;
  readonly previous_schema_sha256: string;
  readonly schema_sql_sha256: string;
  readonly historical_ledger: readonly HistoricalLedgerEntry[];
}

interface SchemaObject {
  readonly type: string;
  readonly name: string;
  readonly tbl_name: string;
  readonly sql: string | null;
}

interface HistoricalRow extends HistoricalLedgerEntry {
  readonly applied_at_ms: number;
}

interface ProjectRevisionRow {
  readonly id: string;
  readonly project_id: string;
  readonly revision_number: number;
  readonly source_kind: string;
  readonly source_location: string;
  readonly repository_id: string | null;
  readonly repository_url: string | null;
  readonly base_branch: string;
  readonly github_project_id: string | null;
  readonly github_project_owner_id: string | null;
  readonly status_field_id: string | null;
  readonly status_options_json: string;
  readonly implementer_profile_id: string | null;
  readonly reviewer_profile_id: string | null;
  readonly correction_limit: number;
  readonly default_delivery_mode: string;
  readonly automation_enabled: number;
  readonly queue_order_json: string;
  readonly guidance: string;
  readonly created_at_ms: number;
  readonly delivery_branch_json: string | null;
}

interface CreationPlanRow {
  readonly plan_hash: string;
  readonly plan_json: string;
}

const resourceDirectory = new URL('../../../../../resources/storage/', import.meta.url);
const digestPattern = /^[a-f0-9]{64}$/u;
const migrationNamePattern = /^\d{3}_[a-z0-9_]+\.sql$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseJson(value: string, code: 'PROJECT_DATA_INVALID' | 'OPERATION_DATA_INVALID'): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new StorageError(code, { cause: error });
  }
}

function readRecognitionDocument(value: unknown): SchemaRecognitionDocument {
  if (!isRecord(value) || value.format_version !== 1 || value.application_id !== applicationId ||
      !Number.isSafeInteger(value.direct_install_user_version) ||
      !Number.isSafeInteger(value.previous_direct_install_user_version) ||
      !Number.isSafeInteger(value.current_ledger_user_version) ||
      typeof value.current_schema_sha256 !== 'string' || !digestPattern.test(value.current_schema_sha256) ||
      typeof value.previous_schema_sha256 !== 'string' || !digestPattern.test(value.previous_schema_sha256) ||
      typeof value.schema_sql_sha256 !== 'string' || !digestPattern.test(value.schema_sql_sha256) ||
      !Array.isArray(value.historical_ledger)) {
    throw new StorageError('MIGRATION_RESOURCES_INVALID');
  }
  const entries: HistoricalLedgerEntry[] = [];
  for (const [index, entry] of value.historical_ledger.entries()) {
    if (!isRecord(entry) || entry.version !== index + 1 || typeof entry.name !== 'string' ||
        !migrationNamePattern.test(entry.name) || typeof entry.checksum !== 'string' || !digestPattern.test(entry.checksum)) {
      throw new StorageError('MIGRATION_RESOURCES_INVALID');
    }
    entries.push({ version: entry.version, name: entry.name, checksum: entry.checksum });
  }
  if (entries.length === 0 || value.current_ledger_user_version !== entries.length ||
      value.direct_install_user_version !== entries.length + 1 ||
      value.previous_direct_install_user_version !== value.direct_install_user_version - 1 ||
      new Set(entries.map(entry => entry.name)).size !== entries.length) {
    throw new StorageError('MIGRATION_RESOURCES_INVALID');
  }
  return {
    format_version: 1,
    application_id: applicationId,
    direct_install_user_version: value.direct_install_user_version as number,
    previous_direct_install_user_version: value.previous_direct_install_user_version as number,
    current_ledger_user_version: value.current_ledger_user_version as number,
    current_schema_sha256: value.current_schema_sha256,
    previous_schema_sha256: value.previous_schema_sha256,
    schema_sql_sha256: value.schema_sql_sha256,
    historical_ledger: entries,
  };
}

export function loadSchemaRecognitionResources(): SchemaRecognitionResources {
  try {
    const document = readRecognitionDocument(JSON.parse(
      readFileSync(new URL('schema-recognition.v1.json', resourceDirectory), 'utf8'),
    ) as unknown);
    const schemaSql = readFileSync(new URL('initial-schema.v59.sql', resourceDirectory), 'utf8');
    if (sha256(schemaSql) !== document.schema_sql_sha256) throw new StorageError('MIGRATION_RESOURCES_INVALID');
    const upgradeMigration = document.historical_ledger.at(-1);
    if (!upgradeMigration) throw new StorageError('MIGRATION_RESOURCES_INVALID');
    const upgradeMigrationSql = readFileSync(new URL(upgradeMigration.name, resourceDirectory), 'utf8');
    if (sha256(upgradeMigrationSql) !== upgradeMigration.checksum) throw new StorageError('MIGRATION_RESOURCES_INVALID');
    return {
      applicationId: document.application_id,
      directInstallUserVersion: document.direct_install_user_version,
      previousDirectInstallUserVersion: document.previous_direct_install_user_version,
      currentLedgerUserVersion: document.current_ledger_user_version,
      currentSchemaSha256: document.current_schema_sha256,
      previousSchemaSha256: document.previous_schema_sha256,
      schemaSql,
      upgradeMigration,
      upgradeMigrationSql,
      historicalLedger: document.historical_ledger,
    };
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('MIGRATION_RESOURCES_INVALID', { cause: error });
  }
}

function schemaDigest(db: Database.Database): string {
  const objects = db.prepare<[], SchemaObject>(
    "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_' ORDER BY type,name",
  ).all();
  return sha256(JSON.stringify(objects));
}

function inspectProjectRevisions(db: Database.Database): void {
  const rows = db.prepare<[], ProjectRevisionRow>(`SELECT id,project_id,revision_number,source_kind,source_location,
    repository_id,repository_url,base_branch,github_project_id,github_project_owner_id,status_field_id,status_options_json,
    implementer_profile_id,reviewer_profile_id,correction_limit,default_delivery_mode,automation_enabled,queue_order_json,
    guidance,created_at_ms,delivery_branch_json FROM project_revisions ORDER BY rowid`).all();
  for (const row of rows) {
    const source = {
      kind: row.source_kind,
      location: row.source_location,
      ...(row.repository_id && row.repository_url
        ? { repository_id: row.repository_id, repository_url: row.repository_url }
        : {}),
    };
    const githubProject = row.github_project_id === null ? null : {
      id: row.github_project_id,
      owner_id: row.github_project_owner_id,
      status_field_id: row.status_field_id,
      status_option_ids: readStatusOptionIds(parseJson(row.status_options_json, 'PROJECT_DATA_INVALID')),
    };
    const revision: unknown = {
      id: row.id,
      project_id: row.project_id,
      revision: row.revision_number,
      created_at_ms: row.created_at_ms,
      source,
      base_branch: row.base_branch,
      ...(row.delivery_branch_json === null
        ? {}
        : { delivery_branch: parseJson(row.delivery_branch_json, 'PROJECT_DATA_INVALID') }),
      github_project: githubProject,
      implementer_profile_id: row.implementer_profile_id,
      reviewer_profile_id: row.reviewer_profile_id,
      correction_limit: row.correction_limit,
      default_delivery_mode: row.default_delivery_mode,
      automation_enabled: row.automation_enabled === 1,
      queue_order: readQueueOrderJson(parseJson(row.queue_order_json, 'PROJECT_DATA_INVALID')),
      guidance: row.guidance,
    };
    if (!Value.Check(ProjectRevision, revision)) throw new StorageError('PROJECT_DATA_INVALID');
  }
}

function inspectCreationPlans(db: Database.Database): void {
  const rows = db.prepare<[], CreationPlanRow>(
    'SELECT plan_hash,plan_json FROM project_creations ORDER BY rowid',
  ).all();
  for (const row of rows) {
    const plan = parseJson(row.plan_json, 'OPERATION_DATA_INVALID');
    if (!Value.Check(ScaffoldPlanV3, plan) || digest(plan) !== row.plan_hash) {
      throw new StorageError('OPERATION_DATA_INVALID');
    }
  }
}

function inspectCurrentDomainData(db: Database.Database): void {
  readSettings(db);
  inspectProjectRevisions(db);
  inspectCreationPlans(db);
  for (const row of db.prepare<[], { capture_json: string }>('SELECT capture_json FROM attempts').iterate()) {
    readCapturedConfiguration(parseJson(row.capture_json, 'OPERATION_DATA_INVALID'));
  }
  for (const row of db.prepare<[], { attempt_id: string; project_id: string; repository_id: string; issue_id: string;
    capture_json: string; snapshot_json: string }>(`SELECT s.attempt_id,a.project_id,a.repository_id,a.issue_id,a.capture_json,s.snapshot_json
    FROM attempt_workspace_snapshots s JOIN attempts a ON a.id=s.attempt_id`).iterate()) {
    const capture = readCapturedConfiguration(parseJson(row.capture_json, 'OPERATION_DATA_INVALID'));
    const snapshot = parseJson(row.snapshot_json, 'OPERATION_DATA_INVALID') as import('#contracts').AttemptWorkspaceSnapshot;
    if (!Value.Check(AttemptWorkspaceSnapshot, snapshot) || capture.workspace.initial_state.kind !== 'pending_inherited_attempt' ||
        snapshot.identity.project_id !== row.project_id || snapshot.identity.repository_id !== row.repository_id || snapshot.identity.issue_id !== row.issue_id ||
        snapshot.predecessor_attempt_id !== capture.workspace.predecessor_attempt_id ||
        snapshot.inherited_base_sha !== capture.workspace.inherited_base_sha || snapshot.initial_state.kind !== 'inherited_attempt' ||
        snapshot.initial_state.source_attempt_id !== capture.workspace.predecessor_attempt_id ||
        snapshot.comparison_base_sha === null || snapshot.comparison_base_sha !== snapshot.initial_state.content_identity) {
      throw new StorageError('OPERATION_DATA_INVALID');
    }
  }
  for (const row of db.prepare<[], { choices_json: string }>('SELECT choices_json FROM preparation_revisions').iterate()) {
    readPreparationChoices(parseJson(row.choices_json, 'OPERATION_DATA_INVALID'));
  }
  for (const row of db.prepare<[], { attempt_id: string; project_id: string; issue_number: number | null; reference: string }>(
    `SELECT r.attempt_id,a.project_id,a.issue_number,r.reference FROM resources r JOIN attempts a ON a.id=r.attempt_id WHERE r.kind='implementation'`,
  ).iterate()) {
    if (row.issue_number === null || row.reference !== managedWorkspaceReference(row.project_id, row.issue_number)) {
      throw new StorageError('OPERATION_DATA_INVALID');
    }
  }
}

/** Recognizes only a provably empty database or one of the two current schema representations. */
export function inspectHistory(
  db: Database.Database,
  resources: SchemaRecognitionResources = loadSchemaRecognitionResources(),
): DatabaseRecognition {
  if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new StorageError('STORAGE_INTEGRITY_FAILED');
  const version: unknown = db.pragma('user_version', { simple: true });
  const identity: unknown = db.pragma('application_id', { simple: true });
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new StorageError('MIGRATION_HISTORY_INVALID');
  }
  if (identity !== 0 && identity !== resources.applicationId) throw new StorageError('DATABASE_UNKNOWN');

  const objects = db.prepare<[], { name: string }>(
    "SELECT name FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_' ORDER BY name",
  ).all();
  if (objects.length === 0 && identity === 0 && version === 0) {
    return { kind: 'empty', schemaVersion: 0 };
  }
  if (identity !== resources.applicationId) throw new StorageError('DATABASE_UNKNOWN');
  if (version > resources.directInstallUserVersion) throw new StorageError('DATABASE_NEWER_THAN_APPLICATION');
  const currentSchema = schemaDigest(db);
  const currentSchemaMatches = currentSchema === resources.currentSchemaSha256;
  const previousSchemaMatches = currentSchema === resources.previousSchemaSha256;
  if (!currentSchemaMatches && !previousSchemaMatches) throw new StorageError('DATABASE_SCHEMA_INCOMPATIBLE');

  const rows = db.prepare<[], HistoricalRow>(
    'SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version',
  ).all();
  if (rows.some(row => row.version > resources.currentLedgerUserVersion)) {
    throw new StorageError('DATABASE_NEWER_THAN_APPLICATION');
  }
  if (version === resources.directInstallUserVersion) {
    if (rows.length !== 0 || !currentSchemaMatches) throw new StorageError('MIGRATION_HISTORY_INVALID');
    inspectCurrentDomainData(db);
    const violations: unknown = db.pragma('foreign_key_check');
    if (!Array.isArray(violations) || violations.length !== 0) throw new StorageError('STORAGE_INTEGRITY_FAILED');
    return { kind: 'direct', schemaVersion: version };
  }
  if (version === resources.previousDirectInstallUserVersion && previousSchemaMatches && rows.length === 0) {
    inspectCurrentDomainData(db);
    const violations: unknown = db.pragma('foreign_key_check');
    if (!Array.isArray(violations) || violations.length !== 0) throw new StorageError('STORAGE_INTEGRITY_FAILED');
    return { kind: 'previous-direct', schemaVersion: version };
  }
  if (version === resources.currentLedgerUserVersion - 1 && previousSchemaMatches && rows.length === version) {
    rows.forEach((row, index) => {
      const expected = resources.historicalLedger[index];
      if (!expected || row.version !== expected.version || row.name !== expected.name ||
          !Number.isSafeInteger(row.applied_at_ms) || row.applied_at_ms < 0) throw new StorageError('MIGRATION_HISTORY_INVALID');
      if (row.checksum !== expected.checksum) throw new StorageError('MIGRATION_CHECKSUM_MISMATCH');
    });
    inspectCurrentDomainData(db);
    const violations: unknown = db.pragma('foreign_key_check');
    if (!Array.isArray(violations) || violations.length !== 0) throw new StorageError('STORAGE_INTEGRITY_FAILED');
    return { kind: 'previous-ledger', schemaVersion: version };
  }
  if (rows.length !== version || rows.length === 0) throw new StorageError('MIGRATION_HISTORY_INVALID');
  rows.forEach((row, index) => {
    const expected = resources.historicalLedger[index];
    if (!expected || row.version !== expected.version || row.name !== expected.name ||
        !Number.isSafeInteger(row.applied_at_ms) || row.applied_at_ms < 0) {
      throw new StorageError('MIGRATION_HISTORY_INVALID');
    }
    if (row.checksum !== expected.checksum) throw new StorageError('MIGRATION_CHECKSUM_MISMATCH');
  });
  if (version !== resources.currentLedgerUserVersion) throw new StorageError('DATABASE_SCHEMA_INCOMPATIBLE');

  inspectCurrentDomainData(db);
  const violations: unknown = db.pragma('foreign_key_check');
  if (!Array.isArray(violations) || violations.length !== 0) throw new StorageError('STORAGE_INTEGRITY_FAILED');
  return { kind: 'historical-ledger', schemaVersion: version };
}

export function upgradeRecognizedSchema(db: Database.Database, resources: SchemaRecognitionResources = loadSchemaRecognitionResources()): DatabaseRecognition {
  const before = inspectHistory(db, resources);
  if (before.kind !== 'previous-direct' && before.kind !== 'previous-ledger') return before;
  db.transaction(() => {
    db.exec(resources.upgradeMigrationSql);
    if (before.kind === 'previous-ledger') {
      db.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at_ms) VALUES (?,?,?,?)')
        .run(resources.upgradeMigration.version, resources.upgradeMigration.name, resources.upgradeMigration.checksum, Date.now());
      db.pragma(`user_version = ${resources.currentLedgerUserVersion}`);
    } else {
      db.pragma(`user_version = ${resources.directInstallUserVersion}`);
    }
    const upgraded = inspectHistory(db, resources);
    if (upgraded.kind !== (before.kind === 'previous-direct' ? 'direct' : 'historical-ledger')) {
      throw new StorageError('MIGRATION_HISTORY_INVALID');
    }
  }).immediate();
  return inspectHistory(db, resources);
}

export function initializeSchema(
  db: Database.Database,
  initializeSettings: () => void,
  resources: SchemaRecognitionResources = loadSchemaRecognitionResources(),
): DatabaseRecognition {
  try {
    if (inspectHistory(db, resources).kind !== 'empty') throw new StorageError('DATABASE_SCHEMA_INCOMPATIBLE');
    db.transaction(() => {
      db.exec(resources.schemaSql);
      db.pragma(`application_id = ${resources.applicationId}`);
      db.pragma(`user_version = ${resources.directInstallUserVersion}`);
      initializeSettings();
      const recognized = inspectHistory(db, resources);
      if (recognized.kind !== 'direct') throw new StorageError('DATABASE_SCHEMA_INCOMPATIBLE');
      return recognized;
    }).immediate();
    return { kind: 'direct', schemaVersion: resources.directInstallUserVersion };
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('MIGRATION_FAILED', { cause: error });
  }
}
