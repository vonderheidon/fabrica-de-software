import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { FactorySettings } from '#contracts';
import type Database from 'better-sqlite3';
import { StorageError } from './errors.js';

export function seedSettings(db: Database.Database, dataRoot: string): void {
  const now = Date.now();
  db.prepare(`INSERT INTO factory_settings (
    id, installation_id, account_id, designated_host, projects_root, data_root,
    maestri_settings_json, automation_enabled, time_defaults_json,
    cost_defaults_json, artifact_policy_json, created_at_ms, updated_at_ms, revision
  ) VALUES ('local', ?, NULL, NULL, NULL, ?, ?, 0, ?, ?, ?, ?, ?, 1)`).run(
    randomUUID(), dataRoot,
    JSON.stringify({ formatVersion: 1 }),
    JSON.stringify({ formatVersion: 1, pollingIntervalMs: 15_000, passageActiveTimeMs: 1_800_000, questionTtl: { state: 'not_configured' } }),
    JSON.stringify({ formatVersion: 1, limit: { state: 'not_configured' } }),
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
  data_root: unknown;
  maestri_settings_json: string;
  automation_enabled: unknown;
  time_defaults_json: string;
  cost_defaults_json: string;
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
      installationId: row.installation_id,
      accountId: row.account_id,
      designatedHost: row.designated_host,
      projectsRoot: row.projects_root,
      dataRoot: row.data_root,
      maestriSettings: JSON.parse(row.maestri_settings_json) as unknown,
      automationEnabled: row.automation_enabled === 1,
      timeDefaults: JSON.parse(row.time_defaults_json) as unknown,
      costDefaults: JSON.parse(row.cost_defaults_json) as unknown,
      artifactPolicy: JSON.parse(row.artifact_policy_json) as unknown,
      revision: row.revision,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    };
    if (!Value.Check(FactorySettings, settings)) throw new StorageError('SETTINGS_INVALID');
    return settings;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('SETTINGS_INVALID', { cause: error });
  }
}
