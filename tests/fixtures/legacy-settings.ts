import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

/** Seed for disposable historical schemas only; never used by production. */
export function seedLegacySettings(db: Database.Database, dataRoot: string): void {
  const now = Date.now();
  db.prepare(`INSERT INTO factory_settings (
    id, installation_id, account_id, designated_host, projects_root, data_root,
    maestri_settings_json, automation_enabled, time_defaults_json,
    cost_defaults_json, artifact_policy_json, created_at_ms, updated_at_ms, revision
  ) VALUES ('local', ?, NULL, NULL, NULL, ?, ?, 0, ?, ?, ?, ?, ?, 1)`).run(
    randomUUID(), dataRoot, JSON.stringify({ formatVersion: 1 }),
    JSON.stringify({ formatVersion: 1, pollingIntervalMs: 15_000, passageActiveTimeMs: 1_800_000, questionTtl: { state: 'not_configured' } }),
    JSON.stringify({ formatVersion: 1, limit: { state: 'not_configured' } }),
    JSON.stringify({ formatVersion: 1, automaticDeletion: false }), now, now,
  );
}
