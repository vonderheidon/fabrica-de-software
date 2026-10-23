import { readTimeDefaults, readArtifactPolicy } from './common-json.js';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Value } from '@sinclair/typebox/value';
import { FactorySettings, ToolPreferences } from '#contracts';
import type { ToolPreferences as ToolPreferencesValue } from '#contracts';
import type Database from 'better-sqlite3';
import { StorageError } from './errors.js';

export function seedSettings(db: Database.Database): void {
  const now = Date.now();
  db.prepare(`INSERT INTO factory_settings (
    id, installation_id, account_id, designated_host, projects_root,
    automation_enabled, time_defaults_json,
    artifact_policy_json, created_at_ms, updated_at_ms, revision
  ) VALUES ('local', ?, NULL, ?, NULL, 0, ?, ?, ?, ?, 1)`).run(
    randomUUID(), hostname(),
    JSON.stringify({ formatVersion: 1, pollingIntervalMs: 15_000, passageActiveTimeMs: 1_800_000, questionTtl: { state: 'not_configured' } }),
    JSON.stringify({ formatVersion: 1, automaticDeletion: false }),
    now, now,
  );
}

interface SettingsRow {
  id: unknown;
  installation_id: unknown;
  account_id: unknown;
  designated_host: unknown;
  projects_root: unknown;
  automation_enabled: unknown;
  time_defaults_json: string;
  artifact_policy_json: string;
  revision: unknown;
  created_at_ms: unknown;
  updated_at_ms: unknown;
}

export function readSettings(db: Database.Database): FactorySettings {
  try {
    const rows = db.prepare<[], SettingsRow>('SELECT * FROM factory_settings').all();
    const row = rows[0];
    if (rows.length !== 1 || !row || (row.automation_enabled !== 0 && row.automation_enabled !== 1)) {
      throw new StorageError('SETTINGS_INVALID');
    }
    const settings: unknown = {
      id: row.id,
      installation_id: row.installation_id,
      account_id: row.account_id,
      designated_host: row.designated_host,
      projects_root: row.projects_root,
      automation_enabled: row.automation_enabled === 1,
      time_defaults: readTimeDefaults(JSON.parse(row.time_defaults_json) as unknown),
      artifact_policy: readArtifactPolicy(JSON.parse(row.artifact_policy_json) as unknown),
      revision: row.revision,
      created_at_ms: row.created_at_ms,
      updated_at_ms: row.updated_at_ms,
    };
    if (!Value.Check(FactorySettings, settings)) throw new StorageError('SETTINGS_INVALID');
    return settings;
  } catch (error) {
    if (error instanceof StorageError && error.code === 'SETTINGS_INVALID') throw error;
    throw new StorageError('SETTINGS_INVALID', { cause: error });
  }
}

/** Called by trusted startup while holding the installation lock, before consumers exist. */
export function captureLocalHost(db: Database.Database): void {
  const currentHost = hostname();
  if (!currentHost.trim() || currentHost.length > 256) throw new StorageError('SETTINGS_INVALID');
  db.transaction(() => {
    db.prepare(`UPDATE factory_settings SET designated_host = ?, revision = revision + 1, updated_at_ms = ?
      WHERE id = 'local' AND designated_host IS NOT ?`).run(currentHost, Date.now(), currentHost);
    readSettings(db);
  }).immediate();
}

/** GitHub CLI installation details stay outside the general settings response. */
export function readGitHubExecutablePath(db: Database.Database): string | null {
  const row = db.prepare<[], { gh_executable_path: unknown }>(
    "SELECT gh_executable_path FROM factory_settings WHERE id = 'local'",
  ).get();
  if (!row || (row.gh_executable_path !== null &&
      (typeof row.gh_executable_path !== 'string' || !row.gh_executable_path.trim()))) {
    throw new StorageError('SETTINGS_INVALID');
  }
  return row.gh_executable_path;
}

export function readToolPreferences(db: Database.Database): ToolPreferencesValue {
  const columns = db.prepare<[], { name: string }>("PRAGMA table_info('factory_settings')").all();
  if (!columns.some(column => column.name === 'tool_preferences_json')) {
    // Historical read projections remain valid while migration 030 is pending; this never writes a backfill.
    return {
      format_version: 1,
      git: { preferred_path: null, last_validated_at_ms: null },
      maestri: { preferred_path: null, last_validated_at_ms: null },
      omp: { preferred_path: null, last_validated_at_ms: null },
      powershell: { preferred_path: null, last_validated_at_ms: null },
    };
  }
  const row = db.prepare<[], { tool_preferences_json: unknown }>(
    "SELECT tool_preferences_json FROM factory_settings WHERE id = 'local'",
  ).get();
  try {
    const preferences: unknown = row && typeof row.tool_preferences_json === 'string'
      ? JSON.parse(row.tool_preferences_json) as unknown : null;
    if (!Value.Check(ToolPreferences, preferences)) throw new StorageError('SETTINGS_INVALID');
    return preferences;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('SETTINGS_INVALID', { cause: error });
  }
}

export function recordToolPreferenceValidation(db: Database.Database, validatedPaths: Readonly<Partial<Record<'git' | 'maestri' | 'omp' | 'powershell', string>>>): void {
  // This timestamp is observation metadata; it never changes the saved path or host capability.
  db.transaction(() => {
    const current = readToolPreferences(db);
    let changed = false;
    const next = { ...current };
    for (const tool of ['git', 'maestri', 'omp', 'powershell'] as const) {
      const validatedPath = validatedPaths[tool];
      if (validatedPath && current[tool].preferred_path?.toLowerCase() === validatedPath.toLowerCase()) {
        const timestamp = Math.max(Date.now(), current[tool].last_validated_at_ms ?? 0);
        if (timestamp !== current[tool].last_validated_at_ms) {
          next[tool] = { ...current[tool], last_validated_at_ms: timestamp };
          changed = true;
        }
      }
    }
    if (changed) db.prepare("UPDATE factory_settings SET tool_preferences_json = ? WHERE id = 'local'").run(JSON.stringify(next));
  }).immediate();
}

export function readLinkedGitHubAccount(db: Database.Database): { id: string; login: string } | null {
  const settings = readSettings(db);
  if (settings.account_id === null) return null;
  const row = db.prepare<[string], { id: string; login: string }>(
    'SELECT github_account_id AS id, login FROM accounts WHERE github_account_id = ?',
  ).get(settings.account_id);
  if (!row) throw new StorageError('SETTINGS_INVALID');
  return row;
}
