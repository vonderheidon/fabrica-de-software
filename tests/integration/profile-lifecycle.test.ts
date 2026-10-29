import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptCapture, ProfileChanges, ProjectConfiguration } from '#contracts';
import { loadMigrations } from '../fixtures/historical-schema.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { ExecutionError } from '../../apps/controller/src/modules/execution/index.js';
import { attemptFixture } from '../fixtures/attempt.js';
import { removeProfileEffortSchema } from '../fixtures/profile-effort-schema.js';

function saveProfileChanges(f: Awaited<ReturnType<typeof attemptFixture>>, changes: ProfileChanges) {
  const settings = f.storage.getGlobalConfiguration();
  return f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag,
    body: { changes: {}, profile_changes: changes }, changes: {} });
}

async function createCapturedAttempt(f: Awaited<ReturnType<typeof attemptFixture>>): Promise<string> {
  removeProjectProfileDefaults(f);
  const saved = await f.preparations.createPreparation(f.projectId, {
    issue_id: f.issue.id, delivery_mode: 'icr', guidance: '', overrides: {
      implementer_profile: { kind: 'reference', id: f.profile.id, revision: f.profile.revision },
      reviewer_profile: { kind: 'reference', id: f.reviewerProfile.id, revision: f.reviewerProfile.revision },
    },
  }, { operationId: randomUUID(), expectedRevision: undefined });
  const preparation = saved.view.preparation;
  const settings = f.storage.getSettings();
  const configuration = f.storage.getConfiguration(f.projectId);
  if (!preparation.issue || !preparation.base_sha || !preparation.criteria_preview.executable || !settings.account_id) {
    throw new Error('PROFILE_ATTEMPT_FIXTURE_INCOMPLETE');
  }
  const operationId = randomUUID();
  const capture: AttemptCapture = {
    formatVersion: 1,
    v3Delivery: { format_version: 1, publication_target: null, publication_target_hash: null, authorization_operation_id: operationId },
    preparationId: preparation.id,
    preparationRevision: preparation.revision,
    summaryHash: preparation.summary_hash,
    accountId: settings.account_id,
    issue: preparation.issue,
    baseSha: preparation.base_sha,
    configuration: preparation.effective_configuration,
    criteria: preparation.criteria_preview.criteria,
    criteriaDigest: preparation.criteria_preview.digest,
    roleResources: f.roles,
    tools: f.tools,
  };
  const accepted = f.storage.createAttempt({
    command: { operationId, expectedRevision: saved.etag, body: {
      preparationId: preparation.id, preparationRevision: preparation.revision,
      authorizedSummaryHash: preparation.summary_hash, authorized: true,
    } },
    capture,
    configurationETag: configuration.etag,
    preparationETag: saved.etag,
  });
  return accepted.operation.resource.id;
}

function removeProjectProfileDefaults(f: Awaited<ReturnType<typeof attemptFixture>>): void {
  const current = f.storage.getConfiguration(f.projectId);
  const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...fields } = current.view.configuration;
  const changes = { implementer_profile_id: null, reviewer_profile_id: null } as const;
  const configuration: ProjectConfiguration = { ...fields, ...changes };
  f.storage.saveConfiguration({
    operationId: randomUUID(), projectId: f.projectId, expectedRevision: current.etag,
    body: { project_changes: changes }, configuration, globalChanges: {},
  });
}

describe('execution profile lifecycle and serialized references', () => {
  it('soft-deletes an unused profile and permits its live name to be reused with another ID', async () => {
    const f = await attemptFixture();
    try {
      const beforeRevision = f.storage.getGlobalConfiguration().view.settings.revision;
      const created = saveProfileChanges(f, [{ action: 'create', profile: {
        name: 'Reusable name', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: '',
      } }]);
      expect(created.receipt?.revision).toBe(beforeRevision + 1);
      const old = f.storage.getGlobalConfiguration().view.profiles.find((profile) => profile.name === 'Reusable name');
      if (!old) throw new Error('PROFILE_CREATE_FAILED');
      saveProfileChanges(f, [{ action: 'delete', id: old.id }]);
      expect(f.db.prepare('SELECT deleted_at_ms FROM execution_profiles WHERE id=?').get(old.id)).toMatchObject({ deleted_at_ms: expect.any(Number) });
      expect(f.storage.getGlobalConfiguration().view.profiles.some((profile) => profile.id === old.id)).toBe(false);

      saveProfileChanges(f, [{ action: 'create', profile: {
        name: 'Reusable name', profile_type: 'reviewer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: '',
      } }]);
      const replacement = f.storage.getGlobalConfiguration().view.profiles.find((profile) => profile.name === 'Reusable name');
      expect(replacement).toMatchObject({ profile_type: 'reviewer' });
      expect(replacement?.id).not.toBe(old.id);
      expect(f.storage.getGlobalConfiguration().view.profile_counts).toMatchObject({ implementer: 1, reviewer: 2 });
      expect(created.state).toBe('succeeded');
    } finally { await f.close(); }
  });

  it('blocks type changes and deletion for current defaults across accounts, with sanitized project IDs', async () => {
    const f = await attemptFixture();
    try {
      removeProjectProfileDefaults(f);
      const now = Date.now();
      f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)')
        .run('ACCOUNT_other', 'other-user', now, now, now);
      f.db.prepare("UPDATE factory_settings SET account_id='ACCOUNT_other', revision=revision+1, updated_at_ms=? WHERE id='local'").run(now);
      const otherProjectId = f.register();
      f.db.prepare("UPDATE factory_settings SET account_id='ACCOUNT_test', revision=revision+1, updated_at_ms=? WHERE id='local'").run(now + 1);

      const changed = [{ action: 'update' as const, id: f.profile.id, changes: { profile_type: 'reviewer' as const } }];
      const typeError = (() => {
        try { saveProfileChanges(f, changed); } catch (error) { return error; }
        return null;
      })();
      expect(typeError).toMatchObject({ code: 'PROFILE_TYPE_CHANGE_BLOCKED', details: { facts: {
        blocking_project_count: 1, blocking_project_ids: otherProjectId, blocking_project_ids_truncated: false,
      } } });

      const deleteError = (() => {
        try { saveProfileChanges(f, [{ action: 'delete', id: f.profile.id }]); } catch (error) { return error; }
        return null;
      })();
      expect(deleteError).toMatchObject({ code: 'PROFILE_DELETE_BLOCKED', details: { facts: {
        blocking_project_count: 1, blocking_project_ids: otherProjectId,
      } } });
      expect(f.storage.getGlobalConfiguration().view.profiles.find((profile) => profile.id === f.profile.id)?.profile_type).toBe('implementer');
    } finally { await f.close(); }
  });

  it('supports type changes and logical deletion in the aggregate configuration save', async () => {
    const f = await attemptFixture();
    try {
      const create = saveProfileChanges(f, [{ action: 'create', profile: {
        name: 'Aggregate maintenance', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: '',
      } }]);
      const profile = f.storage.getGlobalConfiguration().view.profiles.find((item) => item.name === 'Aggregate maintenance');
      if (!profile) throw new Error('PROFILE_CREATE_FAILED');
      const current = f.storage.getConfiguration(f.projectId);
      const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...fields } = current.view.configuration;
      const configuration = { ...fields, correction_limit: 3 };
      const operation = f.storage.saveConfiguration({
        operationId: randomUUID(), projectId: f.projectId, expectedRevision: current.etag,
        body: { project_changes: { correction_limit: 3 }, profile_changes: [{ action: 'update', id: profile.id, changes: { profile_type: 'reviewer' } }] },
        configuration, globalChanges: {},
      });
      expect(operation.state).toBe('succeeded');
      expect(f.storage.getConfiguration(f.projectId).view.configuration.correction_limit).toBe(3);
      expect(f.storage.getGlobalConfiguration().view.profiles.find((item) => item.id === profile.id)?.profile_type).toBe('reviewer');

      const next = f.storage.getConfiguration(f.projectId);
      const { id: _nextId, project_id: _nextProjectId, revision: _nextRevision, created_at_ms: _nextCreatedAt, ...nextFields } = next.view.configuration;
      const deleteOperation = f.storage.saveConfiguration({
        operationId: randomUUID(), projectId: f.projectId, expectedRevision: next.etag,
        body: { project_changes: { guidance: 'Aggregate save with logical deletion.' }, profile_changes: [{ action: 'delete', id: profile.id }] },
        configuration: { ...nextFields, guidance: 'Aggregate save with logical deletion.' }, globalChanges: {},
      });
      expect(deleteOperation.state).toBe('succeeded');
      expect(f.storage.getGlobalConfiguration().view.profiles.some((item) => item.id === profile.id)).toBe(false);

      const attached = f.storage.getConfiguration(f.projectId);
      const { id: _attachedId, project_id: _attachedProjectId, revision: _attachedRevision, created_at_ms: _attachedCreatedAt, ...attachedFields } = attached.view.configuration;
      const roleSwap = { implementer_profile_id: f.reviewerProfile.id, reviewer_profile_id: f.profile.id } as const;
      const roleChange = f.storage.saveConfiguration({
        operationId: randomUUID(), projectId: f.projectId, expectedRevision: attached.etag,
        body: { project_changes: roleSwap, profile_changes: [
          { action: 'update', id: f.profile.id, changes: { profile_type: 'reviewer' } },
          { action: 'update', id: f.reviewerProfile.id, changes: { profile_type: 'implementer' } },
        ] },
        configuration: { ...attachedFields, ...roleSwap }, globalChanges: {},
      });
      expect(roleChange.state).toBe('succeeded');
      const types = new Map(f.storage.getGlobalConfiguration().view.profiles.map((item) => [item.id, item.profile_type]));
      expect(types.get(f.profile.id)).toBe('reviewer');
      expect(types.get(f.reviewerProfile.id)).toBe('implementer');
      expect(create.state).toBe('succeeded');
    } finally { await f.close(); }
  });

  it('allows an aggregate type change when the same save replaces the current project default', async () => {
    const f = await attemptFixture();
    try {
      saveProfileChanges(f, [{ action: 'create', profile: {
        name: 'Replace before type change', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: '',
      } }]);
      const profile = f.storage.getGlobalConfiguration().view.profiles.find((item) => item.name === 'Replace before type change');
      if (!profile) throw new Error('PROFILE_CREATE_FAILED');
      const current = f.storage.getConfiguration(f.projectId);
      const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...fields } = current.view.configuration;
      const assign = { implementer_profile_id: profile.id } as const;
      f.storage.saveConfiguration({ operationId: randomUUID(), projectId: f.projectId, expectedRevision: current.etag,
        body: { project_changes: assign }, configuration: { ...fields, ...assign }, globalChanges: {} });

      const assigned = f.storage.getConfiguration(f.projectId);
      const { id: _assignedId, project_id: _assignedProjectId, revision: _assignedRevision, created_at_ms: _assignedCreatedAt, ...assignedFields } = assigned.view.configuration;
      const replace = { implementer_profile_id: f.profile.id } as const;
      const result = f.storage.saveConfiguration({ operationId: randomUUID(), projectId: f.projectId, expectedRevision: assigned.etag,
        body: { project_changes: replace, profile_changes: [{ action: 'update', id: profile.id, changes: { profile_type: 'reviewer' } }] },
        configuration: { ...assignedFields, ...replace }, globalChanges: {} });

      expect(result.state).toBe('succeeded');
      expect(f.storage.getGlobalConfiguration().view.profiles.find((item) => item.id === profile.id)?.profile_type).toBe('reviewer');
      expect(f.storage.getConfiguration(f.projectId).view.configuration.implementer_profile_id).toBe(f.profile.id);
    } finally { await f.close(); }
  });

  it('serializes a stale project default save against deletion', async () => {
    const f = await attemptFixture();
    try {
      saveProfileChanges(f, [{ action: 'create', profile: {
        name: 'Concurrent selection', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: '',
      } }]);
      const selected = f.storage.getGlobalConfiguration().view.profiles.find((item) => item.name === 'Concurrent selection');
      if (!selected) throw new Error('PROFILE_CREATE_FAILED');
      const config = f.storage.getConfiguration(f.projectId);
      const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...fields } = config.view.configuration;
      const changes = { implementer_profile_id: selected.id };
      const saveProject = () => f.storage.saveConfiguration({ operationId: randomUUID(), projectId: f.projectId,
        expectedRevision: config.etag, body: { project_changes: changes }, configuration: { ...fields, ...changes }, globalChanges: {} });
      const deleteProfile = () => saveProfileChanges(f, [{ action: 'delete', id: selected.id }]);
      const outcomes = await Promise.allSettled([Promise.resolve().then(saveProject), Promise.resolve().then(deleteProfile)]);
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const currentConfig = f.storage.getConfiguration(f.projectId).view.configuration;
      const currentProfile = f.storage.getGlobalConfiguration().view.profiles.find((item) => item.id === selected.id);
      expect(currentConfig.implementer_profile_id === selected.id).toBe(currentProfile !== undefined);
    } finally { await f.close(); }
  });

  it('revalidates a saved preparation after its referenced profile is deleted or changes type', async () => {
    for (const action of ['delete', 'change_type'] as const) {
      const f = await attemptFixture();
      try {
        saveProfileChanges(f, [{ action: 'create', profile: {
          name: `Prepared ${action}`, profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: '',
        } }]);
        const profile = f.storage.getGlobalConfiguration().view.profiles.find((item) => item.name === `Prepared ${action}`);
        if (!profile) throw new Error('PROFILE_CREATE_FAILED');
        const prepared = await f.preparations.createPreparation(f.projectId, {
          issue_id: f.issue.id, delivery_mode: 'icr', guidance: '',
          overrides: { implementer_profile: { kind: 'reference', id: profile.id, revision: profile.revision } },
        }, { operationId: randomUUID(), expectedRevision: undefined });

        if (action === 'delete') saveProfileChanges(f, [{ action: 'delete', id: profile.id }]);
        else saveProfileChanges(f, [{ action: 'update', id: profile.id, changes: { profile_type: 'reviewer' } }]);

        await expect(f.preparations.revalidateSummary({ preparationId: prepared.view.preparation.id,
          preparationRevision: prepared.view.preparation.revision, authorizedSummaryHash: prepared.view.preparation.summary_hash }))
          .rejects.toMatchObject({ code: 'SUMMARY_CHANGED' });
        await expect(f.pipeline.startAttempt({ preparationId: prepared.view.preparation.id,
          preparationRevision: prepared.view.preparation.revision, authorizedSummaryHash: prepared.view.preparation.summary_hash, authorized: true },
        { operationId: randomUUID(), expectedRevision: prepared.etag })).rejects.toMatchObject({ code: 'SUMMARY_CHANGED' });
        expect(f.db.prepare('SELECT count(*) AS count FROM attempts').get()).toEqual({ count: 0 });
      } finally { await f.close(); }
    }
  });

  it('checks captured IDs in either role for every result-null lifecycle state, but ignores uncertain cleanup after closure', async () => {
    const f = await attemptFixture();
    try {
      saveProfileChanges(f, [{ action: 'create', profile: {
        name: 'Same model, different identity', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: '',
      } }]);
      const unrelated = f.storage.getGlobalConfiguration().view.profiles.find((profile) => profile.name === 'Same model, different identity');
      if (!unrelated) throw new Error('PROFILE_CREATE_FAILED');
      const attemptId = await createCapturedAttempt(f);
      expect(() => saveProfileChanges(f, [{ action: 'delete', id: unrelated.id }])).not.toThrow();
      const activeStates = [
        { phase: 'preparing', suspension: null },
        { phase: 'implementing', suspension: null },
        { phase: 'implementing', suspension: 'HUMAN_DECISION' },
        { phase: 'verifying', suspension: null },
        { phase: 'reviewing', suspension: null },
        { phase: 'publishing', suspension: null },
      ] as const;
      for (const state of activeStates) {
        f.db.prepare('UPDATE attempts SET phase=?, suspension=? WHERE id=?').run(state.phase, state.suspension, attemptId);
        for (const profile of [f.profile, f.reviewerProfile]) {
          expect(() => saveProfileChanges(f, [{ action: 'delete', id: profile.id }])).toThrowError(
            expect.objectContaining({ code: 'PROFILE_ACTIVE_ATTEMPT_BLOCKED' }),
          );
        }
      }

      f.db.prepare("UPDATE resources SET stop_state='uncertain' WHERE attempt_id=?").run(attemptId);
      f.storage.interruptAttempts();
      expect(f.storage.getAttempt(attemptId).result).toBe('interrupted');
      for (const profile of [f.profile, f.reviewerProfile]) {
        expect(() => saveProfileChanges(f, [{ action: 'delete', id: profile.id }])).not.toThrow();
      }
    } finally { await f.close(); }
  });

  it('allows a type change while an attempt is active and preserves the captured role values', async () => {
    const f = await attemptFixture();
    try {
      const attemptId = await createCapturedAttempt(f);
      const before = f.storage.getAttemptCapture(attemptId);
      saveProfileChanges(f, [{ action: 'update', id: f.profile.id, changes: { profile_type: 'reviewer' } }]);
      const after = f.storage.getAttemptCapture(attemptId);
      expect(after).toEqual(before);
      expect(f.storage.getGlobalConfiguration().view.profiles.find((profile) => profile.id === f.profile.id)?.profile_type).toBe('reviewer');
    } finally { await f.close(); }
  });

  it('rejects mismatched role selections in project and preparation writes on the server', async () => {
    const f = await attemptFixture();
    try {
      const current = f.storage.getConfiguration(f.projectId);
      const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...fields } = current.view.configuration;
      const mismatched = { ...fields, implementer_profile_id: f.reviewerProfile.id, reviewer_profile_id: null };
      expect(() => f.storage.saveConfiguration({ operationId: randomUUID(), projectId: f.projectId, expectedRevision: current.etag,
        body: { project_changes: { implementer_profile_id: f.reviewerProfile.id, reviewer_profile_id: null } }, configuration: mismatched, globalChanges: {} })).toThrowError(
        expect.objectContaining({ code: 'PROFILE_TYPE_MISMATCH' }),
      );
      removeProjectProfileDefaults(f);
      await expect(f.preparations.createPreparation(f.projectId, {
        issue_id: f.issue.id, delivery_mode: 'icr', guidance: '',
        overrides: { implementer_profile: { kind: 'reference', id: f.reviewerProfile.id, revision: f.reviewerProfile.revision } },
      }, { operationId: randomUUID(), expectedRevision: undefined })).rejects.toMatchObject({ code: 'PROFILE_TYPE_MISMATCH' });
    } finally { await f.close(); }
  });

  it('allows one live profile to serve both project and inherited preparation roles', async () => {
    const f = await attemptFixture();
    try {
      const current = f.storage.getConfiguration(f.projectId);
      const shared = { implementer_profile_id: f.profile.id, reviewer_profile_id: f.profile.id } as const;
      const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...fields } = current.view.configuration;
      f.storage.saveConfiguration({ operationId: randomUUID(), projectId: f.projectId, expectedRevision: current.etag,
        body: { project_changes: shared }, configuration: { ...fields, ...shared }, globalChanges: {} });

      const prepared = await f.preparations.createPreparation(f.projectId, {
        issue_id: f.issue.id, delivery_mode: 'icr', guidance: '', overrides: {},
      }, { operationId: randomUUID(), expectedRevision: undefined });
      expect(prepared.view.preparation.effective_configuration.implementer_profile?.name).toBe(f.profile.name);
      expect(prepared.view.preparation.effective_configuration.reviewer_profile?.name).toBe(f.profile.name);
    } finally { await f.close(); }
  });

  it('blocks starts when a role type is missing, rejects loaded catalog mismatches, and permits unavailable catalog attempts', async () => {
    const missing = await attemptFixture();
    try {
      removeProjectProfileDefaults(missing);
      const prepared = await missing.preparations.createPreparation(missing.projectId, {
        issue_id: missing.issue.id, delivery_mode: 'icr', guidance: '',
        overrides: { reviewer_profile: { kind: 'value', profile: {
          name: missing.reviewerProfile.name, executor: missing.reviewerProfile.executor, provider: missing.reviewerProfile.provider,
          model: missing.reviewerProfile.model, effort: missing.reviewerProfile.effort, guidance: missing.reviewerProfile.guidance,
        } } },
      }, { operationId: randomUUID(), expectedRevision: undefined });
      saveProfileChanges(missing, [{ action: 'delete', id: missing.reviewerProfile.id }]);
      const completedAt = 123;
      missing.db.prepare("UPDATE factory_settings SET onboarding_completed_at_ms=? WHERE id='local'").run(completedAt);
      saveProfileChanges(missing, [{ action: 'delete', id: missing.profile.id }]);
      expect(missing.db.prepare("SELECT onboarding_completed_at_ms FROM factory_settings WHERE id='local'").get())
        .toEqual({ onboarding_completed_at_ms: completedAt });
      expect(missing.storage.getGlobalConfiguration().view.profile_counts).toEqual({ all: 0, implementer: 0, reviewer: 0 });
      await expect(missing.pipeline.startAttempt({
        preparationId: prepared.view.preparation.id, preparationRevision: prepared.view.preparation.revision,
        authorizedSummaryHash: prepared.view.preparation.summary_hash, authorized: true,
      }, { operationId: randomUUID(), expectedRevision: prepared.etag })).rejects.toMatchObject({
        code: 'PROFILE_TYPES_REQUIRED', details: { recovery: expect.stringContaining('Configuração > Perfis') },
      });
      expect(missing.db.prepare('SELECT count(*) AS count FROM attempts').get()).toEqual({ count: 0 });
    } finally { await missing.close(); }

    const invalid = await attemptFixture();
    try {
      const prepared = await invalid.prepare();
      vi.mocked(invalid.execution.getCatalog).mockResolvedValue({ state: 'loaded', executor: 'maestri-omp', executor_version: 'fixture', observed_at_ms: 2,
        models: [{ provider: 'different-provider', provider_name: 'different-provider', model: 'available-only', model_name: 'Available only', efforts: ['medium'] }] });
      const operation = randomUUID();
      await expect(invalid.pipeline.startAttempt(prepared.body, { operationId: operation, expectedRevision: prepared.saved.etag }))
        .rejects.toMatchObject({ code: 'PROFILE_CATALOG_MISMATCH', details: { facts: { profile_role: 'implementer', profile_id: invalid.profile.id } } });
      expect(invalid.db.prepare('SELECT count(*) AS count FROM attempts').get()).toEqual({ count: 0 });
    } finally { await invalid.close(); }

    const unavailable = await attemptFixture();
    try {
      const prepared = await unavailable.prepare();
      vi.mocked(unavailable.execution.startPassage).mockRejectedValue(new ExecutionError('RESOURCE_INVALID'));
      const operation = await unavailable.pipeline.startAttempt(prepared.body, { operationId: randomUUID(), expectedRevision: prepared.saved.etag });
      expect(operation.resource.type).toBe('attempt');
      await unavailable.pipeline.drain();
      expect(unavailable.storage.getAttempt(operation.resource.id).result).toBeNull();
      expect(unavailable.storage.getAttempt(operation.resource.id).diagnostic).toBe('RESOURCE_INVALID');
    } finally { await unavailable.close(); }
  });

  it('adds lifecycle columns in place and fails closed on legacy untyped profiles without changing the database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'factory-profile-migration-'));
    let storage: ReturnType<typeof openStorage> | undefined;
    let db: Database.Database | undefined;
    try {
      storage = openStorage({ dataDirectory: directory });
      const profileChanges: ProfileChanges = [{ action: 'create', profile: { name: 'Legacy profile', profile_type: 'implementer',
        executor: 'maestri-omp', provider: 'provider', model: 'model', effort: 'high', guidance: '' } }];
      const current = storage.getGlobalConfiguration();
      storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag,
        body: { changes: {}, profile_changes: profileChanges }, changes: {} });
      const insertedProfile = storage.getGlobalConfiguration().view.profiles[0];
      if (!insertedProfile) throw new Error('PROFILE_CREATE_FAILED');
      db = new Database(join(directory, 'factory.sqlite'));
      const table = db.prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE type='table' AND name='execution_profiles'").get();
      expect(table?.sql).toContain('profile_type TEXT');
      expect(table?.sql).toContain('name_key TEXT');
      expect(db.prepare("SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name='execution_profiles_lifecycle'").get()).toBeUndefined();
      const columns = db.prepare<[], { name: string }>("PRAGMA table_info('execution_profiles')").all().map((column) => column.name);
      expect(columns).toEqual(expect.arrayContaining(['profile_type', 'name_key', 'deleted_at_ms']));
      expect(() => db!.prepare(`INSERT INTO execution_profiles(id,name,executor,provider,model,effort,guidance,revision,created_at_ms,updated_at_ms,
        profile_type,name_key,deleted_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
        .run(randomUUID(), 'Missing type', 'maestri-omp', 'provider', 'model', 'high', '', 1, 10, 10, null, 'missing type'))
        .toThrow(/PROFILE_DATA_INVALID/);
      expect(() => db!.prepare('DELETE FROM execution_profiles WHERE id=?').run(insertedProfile.id)).toThrow(/IMMUTABLE_RECORD/);
      db.close(); db = undefined;
      storage.close(); storage = undefined;

      db = new Database(join(directory, 'factory.sqlite'));
      removeProfileEffortSchema(db);
      const nullableEffort = loadMigrations().find((migration) => migration.version === 22);
      if (!nullableEffort) throw new Error('PROFILE_EFFORT_MIGRATION_MISSING');
      db.pragma('foreign_keys = OFF');
      db.transaction(() => {
        db!.exec(nullableEffort.sql);
        db!.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at_ms) VALUES (?,?,?,?)')
          .run(nullableEffort.version, nullableEffort.name, nullableEffort.checksum, Date.now());
        db!.pragma('user_version = 22');
      }).immediate();
      db.pragma('foreign_keys = ON');
      expect(db.pragma('foreign_key_check')).toEqual([]);
      db.close(); db = undefined;
      const before = createHash('sha256').update(readFileSync(join(directory, 'factory.sqlite'))).digest('hex');
      expect(() => openStorage({ dataDirectory: directory })).toThrowError(expect.objectContaining({ code: 'DATABASE_SCHEMA_INCOMPATIBLE' }));
      const after = createHash('sha256').update(readFileSync(join(directory, 'factory.sqlite'))).digest('hex');
      expect(after).toBe(before);
    } finally {
      db?.close();
      storage?.close();
      rmSync(directory, { recursive: true });
    }
  });
});
