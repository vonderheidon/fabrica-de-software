import { describe, expect, it } from 'vitest';
import type { ExecutionCatalog, ExecutionProfile } from '#contracts';
import { profileChangesForSave, profileCombinationValid, selectProfileModel, selectProfileProvider } from './profile-editor.js';

const catalog: ExecutionCatalog = {
  state: 'loaded', executor: 'maestri-omp', executor_version: 'test', observed_at_ms: 1,
  models: [
    { provider: 'provider-a', provider_name: 'Provider A', model: 'shared', model_name: 'Shared', efforts: ['low', 'high'] },
    { provider: 'provider-b', provider_name: 'Provider B', model: 'shared', model_name: 'Shared B', efforts: ['high'] },
    { provider: 'provider-b', provider_name: 'Provider B', model: 'no-effort', model_name: 'No effort', efforts: [] },
  ],
};

const profile: ExecutionProfile = {
  name: 'Implementador', profile_type: 'implementer', executor: 'maestri-omp',
  provider: 'provider-a', model: 'shared', effort: 'high', guidance: '',
};

describe('profile editor selections', () => {
  it('keeps model and effort when a newly selected provider supports them', () => {
    expect(selectProfileProvider(profile, catalog, 'provider-b')).toMatchObject({ provider: 'provider-b', model: 'shared', effort: 'high' });
  });

  it('clears only model and effort when the provider change makes the model incompatible', () => {
    expect(selectProfileProvider(profile, catalog, 'missing-provider')).toMatchObject({ provider: 'missing-provider', model: '', effort: null });
  });

  it('preserves a compatible effort and clears an effort that the new model does not support', () => {
    expect(selectProfileModel(profile, catalog, 'shared').effort).toBe('high');
    expect(selectProfileModel(profile, catalog, 'no-effort').effort).toBeNull();
  });

  it('represents a model without effort choices as a valid explicit null', () => {
    const next = selectProfileProvider(profile, catalog, 'provider-b');
    const noEffort = selectProfileModel(next, catalog, 'no-effort');
    expect(noEffort.effort).toBeNull();
    expect(profileCombinationValid(catalog, noEffort)).toBe(true);
    expect(profileChangesForSave(null, null, noEffort, catalog)).toEqual([{
      action: 'create', profile: { ...noEffort, effort: null },
    }]);
  });

  it('rejects null when the selected model currently offers effort choices', () => {
    const missingEffort = { ...profile, effort: null };
    expect(profileCombinationValid(catalog, missingEffort)).toBe(false);
    expect(profileChangesForSave('profile-1', profile, missingEffort, catalog)).toEqual([]);
  });
});

describe('profile editor save patches', () => {
  it('emits one create command only for a catalog-valid combination', () => {
    expect(profileChangesForSave(null, null, profile, catalog)).toHaveLength(1);
    expect(profileChangesForSave(null, null, { ...profile, provider: 'missing' }, catalog)).toEqual([]);
  });

  it('saves name and guidance without sending an invalid draft combination', () => {
    const draft = { ...profile, name: 'Novo nome', guidance: 'Orientação', model: 'removed-model', effort: 'removed-effort' };
    expect(profileChangesForSave('profile-1', profile, draft, catalog)).toEqual([{
      action: 'update', id: 'profile-1', changes: { name: 'Novo nome', guidance: 'Orientação' },
    }]);
  });

  it('sends only the changed, catalog-valid fields in one update command', () => {
    const next = { ...profile, provider: 'provider-b', model: 'no-effort', effort: null, guidance: 'Orientação nova' };
    expect(profileChangesForSave('profile-1', profile, next, catalog)).toEqual([{
      action: 'update', id: 'profile-1', changes: {
        provider: 'provider-b', model: 'no-effort', effort: null, guidance: 'Orientação nova',
      },
    }]);
  });

  it('preserves a saved choice missing from a refreshed catalog while saving metadata', () => {
    const refreshed: ExecutionCatalog = { ...catalog, models: catalog.models.filter((model) => model.provider !== profile.provider) };
    expect(profileChangesForSave('profile-1', profile, { ...profile, name: 'Nome atualizado' }, refreshed)).toEqual([{
      action: 'update', id: 'profile-1', changes: { name: 'Nome atualizado' },
    }]);
  });

  it('saves a role change as part of the existing profile update command', () => {
    expect(profileChangesForSave('profile-1', profile, { ...profile, profile_type: 'reviewer' }, catalog)).toEqual([{
      action: 'update', id: 'profile-1', changes: { profile_type: 'reviewer' },
    }]);
  });

  it('allows metadata changes when the catalog is unavailable and preserves the stored combination', () => {
    const unavailable: ExecutionCatalog = { state: 'unavailable', observed_at_ms: 2, diagnostics: [{ code: 'OFFLINE', message: 'Offline', recovery: 'Retry' }] };
    expect(profileChangesForSave('profile-1', profile, { ...profile, name: 'Novo nome' }, unavailable)).toEqual([{
      action: 'update', id: 'profile-1', changes: { name: 'Novo nome' },
    }]);
  });
});
