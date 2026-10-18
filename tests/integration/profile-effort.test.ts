import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { ExecutionProfile } from '#contracts';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { attemptFixture } from '../fixtures/attempt.js';

describe('nullable execution profile effort', () => {
  it('preserves null through the attempt capture and exact effective-profile confirmation', async () => {
    const f = await attemptFixture(tmpdir(), 'b'.repeat(40), null);
    try {
      const prepared = await f.prepare();
      const operation = await f.pipeline.startAttempt(prepared.body, prepared.context);
      await f.pipeline.drain();
      const capture = f.storage.getAttemptCapture(operation.resource.id);
      const passage = f.persistence.getPassage({ passageId: f.storage.getAttempt(operation.resource.id).passageId });
      expect(capture.configuration.implementer_profile?.effort).toBeNull();
      expect(passage.effectiveProfile?.effort).toBeNull();
    } finally { await f.close(); }
  });

  it('persists absent effort as SQL NULL and keeps it absent after reopen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'factory-profile-effort-'));
    let storage: ReturnType<typeof openStorage> | undefined;
    let probe: Database.Database | undefined;
    try {
      storage = openStorage({ dataDirectory: directory });
      const profileBody = { action: 'create' as const, profile: { name: 'Existing profile', profile_type: 'implementer' as const, executor: 'maestri-omp' as const, provider: 'provider', model: 'model', effort: 'high', guidance: '' } };
      storage.saveSettings({ operationId: randomUUID(), expectedRevision: storage.getGlobalConfiguration().etag,
        body: { changes: {}, profile_changes: [profileBody] }, changes: {} });
      const existingProfile = storage.getGlobalConfiguration().view.profiles[0];
      if (!existingProfile) throw new Error('PROFILE_NOT_FOUND');
      expect(existingProfile?.effort).toBe('high');

      const currentSettings = storage.getGlobalConfiguration();
      const absentEffort = { action: 'create' as const, profile: { name: 'No effort', profile_type: 'reviewer' as const, executor: 'maestri-omp' as const, provider: 'provider', model: 'plain-model', effort: null, guidance: '' } };
      storage.saveSettings({ operationId: randomUUID(), expectedRevision: currentSettings.etag,
        body: { changes: {}, profile_changes: [absentEffort] }, changes: {} });
      const saved = storage.getGlobalConfiguration().view.profiles.find(profile => profile.name === absentEffort.profile.name);
      if (!saved) throw new Error('PROFILE_NOT_FOUND');
      expect(saved.effort).toBeNull();
      expect(Value.Check(ExecutionProfile, { ...absentEffort.profile, effort: null })).toBe(true);
      expect(Value.Check(ExecutionProfile, { ...absentEffort.profile, effort: '' })).toBe(false);
      probe = new Database(join(directory, 'factory.sqlite')); probe.pragma('foreign_keys = ON');
      expect(probe.prepare('SELECT effort FROM execution_profiles WHERE id=?').get(saved.id)).toEqual({ effort: null });
      expect(probe.pragma('foreign_key_check')).toEqual([]);
      probe.close(); probe = undefined;
      storage.close(); storage = undefined;
      storage = openStorage({ dataDirectory: directory });
      expect(storage.getGlobalConfiguration().view.profiles.find(profile => profile.name === absentEffort.profile.name)?.effort).toBeNull();
    } finally {
      probe?.close(); storage?.close(); rmSync(directory, { recursive: true });
    }
  });
});
