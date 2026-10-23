import { describe, expect, it } from 'vitest';
import type { StoredExecutionProfile } from '#contracts';
import {
  filterProfiles, isLastProfileOfType, profileModelKey, profileModelOptions,
  profileNameConfirmationMatches, profilesForRole,
} from './profile-collection.js';

const profiles: StoredExecutionProfile[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Café Delivery', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider-a', model: 'shared-model', effort: 'high', guidance: 'Use ações rápidas.', revision: 1, created_at_ms: 1, updated_at_ms: 1, composition_version: 1 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Revisão cuidadosa', profile_type: 'reviewer', executor: 'maestri-omp', provider: 'provider-b', model: 'shared-model', effort: null, guidance: 'Confira documentação.', revision: 1, created_at_ms: 2, updated_at_ms: 2, composition_version: 1 },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Implementador extra', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider-a', model: 'other-model', effort: 'medium', guidance: '', revision: 1, created_at_ms: 3, updated_at_ms: 3, composition_version: 1 },
];

describe('global profile collection filters', () => {
  it('matches the complete query in name or guidance without case or accent sensitivity', () => {
    expect(filterProfiles(profiles, { query: '  CAFE DELIVERY  ', modelKey: '', profileType: 'all' }).map((profile) => profile.id))
      .toEqual([profiles[0]?.id]);
    expect(filterProfiles(profiles, { query: '  ACOES RAPIDAS  ', modelKey: '', profileType: 'all' }).map((profile) => profile.id))
      .toEqual([profiles[0]?.id]);
  });

  it('preserves spaces inside the query and combines search, model pair, and role', () => {
    expect(filterProfiles(profiles, { query: 'cafe  delivery', modelKey: '', profileType: 'all' })).toEqual([]);
    expect(filterProfiles(profiles, { query: 'revisao', modelKey: profileModelKey('provider-b', 'shared-model'), profileType: 'reviewer' }))
      .toEqual([profiles[1]]);
  });

  it('derives unique provider and model pairs only from the supplied live profiles', () => {
    const duplicatePair = { ...profiles[0]!, id: '00000000-0000-4000-8000-000000000004', name: 'Outro perfil do mesmo par' };
    expect(profileModelOptions([...profiles, duplicatePair])).toEqual([
      { key: profileModelKey('provider-a', 'other-model'), provider: 'provider-a', model: 'other-model' },
      { key: profileModelKey('provider-a', 'shared-model'), provider: 'provider-a', model: 'shared-model' },
      { key: profileModelKey('provider-b', 'shared-model'), provider: 'provider-b', model: 'shared-model' },
    ]);
    expect(profileModelKey('provider-a', 'shared-model')).not.toBe(profileModelKey('provider-b', 'shared-model'));
  });

  it('offers profiles only to their matching role and recognizes the last live profile', () => {
    expect(profilesForRole(profiles, 'reviewer')).toEqual([profiles[1]]);
    expect(isLastProfileOfType(profiles, profiles[0]!.id, 'implementer')).toBe(false);
    expect(isLastProfileOfType(profiles, profiles[1]!.id, 'reviewer')).toBe(true);
  });

  it('requires the typed profile name for deletion confirmation', () => {
    expect(profileNameConfirmationMatches('Revisão cuidadosa', ' Revisão cuidadosa ')).toBe(true);
    expect(profileNameConfirmationMatches('Revisão cuidadosa', 'revisão cuidadosa')).toBe(false);
  });
});
