import type { ProfileType, StoredExecutionProfile } from '#contracts';

export type ProfileTypeFilter = 'all' | ProfileType;

export interface ProfileModelOption {
  readonly key: string;
  readonly provider: string;
  readonly model: string;
}

export interface ProfileCollectionFilters {
  readonly query: string;
  readonly modelKey: string;
  readonly profileType: ProfileTypeFilter;
}

function searchValue(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

export function profileModelKey(provider: string, model: string): string {
  return JSON.stringify([provider, model]);
}

export function profilesForRole<Profile extends { profile_type: ProfileType }>(
  profiles: readonly Profile[],
  profileType: ProfileType,
): Profile[] {
  return profiles.filter((profile) => profile.profile_type === profileType);
}

export function profileModelOptions(profiles: readonly StoredExecutionProfile[]): ProfileModelOption[] {
  const unique = new Map<string, ProfileModelOption>();
  for (const profile of profiles) {
    const key = profileModelKey(profile.provider, profile.model);
    if (!unique.has(key)) unique.set(key, { key, provider: profile.provider, model: profile.model });
  }
  return [...unique.values()].sort((left, right) => left.provider.localeCompare(right.provider, 'pt-BR') || left.model.localeCompare(right.model, 'pt-BR'));
}

export function filterProfiles(
  profiles: readonly StoredExecutionProfile[],
  filters: ProfileCollectionFilters,
): StoredExecutionProfile[] {
  const query = searchValue(filters.query.trim());
  return profiles.filter((profile) => {
    if (filters.profileType !== 'all' && profile.profile_type !== filters.profileType) return false;
    if (filters.modelKey && profileModelKey(profile.provider, profile.model) !== filters.modelKey) return false;
    if (!query) return true;
    return searchValue(profile.name).includes(query) || searchValue(profile.guidance).includes(query);
  });
}

export function isLastProfileOfType(
  profiles: readonly StoredExecutionProfile[],
  profileId: string,
  profileType: ProfileType,
): boolean {
  return profiles.filter((profile) => profile.profile_type === profileType).length === 1 &&
    profiles.some((profile) => profile.id === profileId && profile.profile_type === profileType);
}

export function profileNameConfirmationMatches(expectedName: string, suppliedName: string): boolean {
  return suppliedName.trim() === expectedName;
}
