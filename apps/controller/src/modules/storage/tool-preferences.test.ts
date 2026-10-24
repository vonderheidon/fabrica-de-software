import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from './index.js';
import { applyMigrations, loadMigrations } from './migrations.js';
import { seedSettings } from './settings.js';
import type { SettingsUpdate, ToolPreferences } from '#contracts';

const directories: string[] = [];
function temporaryDirectory(): string {
  const cache = resolve('.cache');
  mkdirSync(cache, { recursive: true });
  const path = mkdtempSync(join(cache, 'factory-tool-preferences-'));
  directories.push(path);
  return path;
}
const emptyPreferences = (): ToolPreferences => ({
  format_version: 1,
  git: { preferred_path: null, last_validated_at_ms: null },
  maestri: { preferred_path: null, last_validated_at_ms: null },
  omp: { preferred_path: null, last_validated_at_ms: null },
  powershell: { preferred_path: null, last_validated_at_ms: null },
});

afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('persisted local tool preferences', () => {
  it('adds the settings JSON through migration 30 without changing existing settings', () => {
    const directory = temporaryDirectory();
    const database = new Database(join(directory, 'factory.sqlite'));
    database.pragma('foreign_keys = ON');
    const migrations = loadMigrations();
    applyMigrations(database, migrations.slice(0, 29), () => seedSettings(database));
    const before = database.prepare<[], { installation_id: string; account_id: string | null; gh_executable_path: string | null }>(
      "SELECT installation_id,account_id,gh_executable_path FROM factory_settings WHERE id='local'").get();
    if (!before) throw new Error('settings row missing');

    applyMigrations(database, migrations, () => { throw new Error('existing installation must not be reseeded'); });

    expect(database.pragma('user_version', { simple: true })).toBe(42);
    expect(database.prepare("SELECT installation_id,account_id,gh_executable_path,tool_preferences_json FROM factory_settings WHERE id='local'").get())
      .toEqual({ ...before, tool_preferences_json: JSON.stringify(emptyPreferences()) });
    expect(database.pragma('foreign_key_check')).toEqual([]);
    database.close();
  });

  it('persists validated paths independently from GH and recovers the same command despite changed timestamps', () => {
    const directory = temporaryDirectory();
    const storage = openStorage({ dataDirectory: directory });
    const before = storage.getGlobalConfiguration();
    const preferences = emptyPreferences();
    preferences.git = { preferred_path: 'C:\\Program Files ç\\Git\\cmd\\git.exe', last_validated_at_ms: 1234 };
    preferences.omp = { preferred_path: 'C:\\Tools\\omp.exe', last_validated_at_ms: 2345 };
    const body: SettingsUpdate = { changes: {}, tool_preferences: preferences };
    const operationId = randomUUID();
    const operation = storage.saveSettings({ operationId, expectedRevision: before.etag, body, changes: {} });
    expect(operation.state).toBe('succeeded');
    const saved = storage.getGlobalConfiguration().view.tool_preferences;
    expect(saved).toEqual(preferences);
    expect(storage.getGitHubExecutablePath()).toBeNull();

    const replayBody: SettingsUpdate = { changes: {}, tool_preferences: { ...preferences,
      git: { ...preferences.git, last_validated_at_ms: 9999 }, omp: { ...preferences.omp, last_validated_at_ms: 9999 } } };
    const replay = storage.recoverConfigurationCommand({ kind: 'settings.update', operationId, expectedRevision: before.etag, body: replayBody });
    expect(replay).toEqual(operation);
    storage.close();
  });

  it('refreshes a validation timestamp on startup only for the saved path', () => {
    const directory = temporaryDirectory(); const storage = openStorage({ dataDirectory: directory });
    const before = storage.getGlobalConfiguration(); const preferences = emptyPreferences();
    preferences.git = { preferred_path: 'C:\\Tools\\git.exe', last_validated_at_ms: null };
    storage.saveSettings({ operationId: randomUUID(), expectedRevision: before.etag, body: { changes: {}, tool_preferences: preferences }, changes: {} });
    const saved = storage.getGlobalConfiguration(); const revision = saved.view.settings.revision;

    storage.recordToolPreferenceValidation({ git: 'C:\\Tools\\git.exe', omp: 'C:\\unrelated\\omp.exe' });

    const observed = storage.getGlobalConfiguration();
    expect(observed.view.tool_preferences.git.last_validated_at_ms).toEqual(expect.any(Number));
    expect(observed.view.tool_preferences.omp.last_validated_at_ms).toBeNull();
    expect(observed.view.settings.revision).toBe(revision);
    storage.close();
  });
});
