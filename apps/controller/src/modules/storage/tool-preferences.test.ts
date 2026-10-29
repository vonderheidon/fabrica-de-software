import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from './index.js';
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
