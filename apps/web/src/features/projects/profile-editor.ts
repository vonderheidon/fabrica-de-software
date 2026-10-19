import type { ExecutionCatalog, ExecutionProfile, ProfileChanges, ProfilePatch } from '#contracts';

export function catalogModel(catalog: ExecutionCatalog | null, provider: string, model: string) {
  if (!catalog || catalog.state !== 'loaded') return undefined;
  return catalog.models.find((entry) => entry.provider === provider && entry.model === model);
}

export function profileCombinationValid(catalog: ExecutionCatalog | null, profile: ExecutionProfile): boolean {
  const model = catalogModel(catalog, profile.provider, profile.model);
  if (!model) return false;
  return model.efforts.length === 0
    ? profile.effort === null
    : profile.effort !== null && model.efforts.includes(profile.effort);
}

function compatibleEffort(model: NonNullable<ReturnType<typeof catalogModel>>, effort: string | null): string | null {
  if (model.efforts.length === 0) return null;
  return effort !== null && model.efforts.includes(effort) ? effort : null;
}

export function selectProfileProvider(profile: ExecutionProfile, catalog: ExecutionCatalog | null, provider: string): ExecutionProfile {
  const compatibleModel = catalogModel(catalog, provider, profile.model);
  if (!compatibleModel) return { ...profile, provider, model: '', effort: null };
  return { ...profile, provider, effort: compatibleEffort(compatibleModel, profile.effort) };
}

export function selectProfileModel(profile: ExecutionProfile, catalog: ExecutionCatalog | null, model: string): ExecutionProfile {
  const compatibleModel = catalogModel(catalog, profile.provider, model);
  return { ...profile, model, effort: compatibleModel ? compatibleEffort(compatibleModel, profile.effort) : null };
}

export function profileChangesForSave(
  profileId: string | null,
  baseline: ExecutionProfile | null,
  draft: ExecutionProfile,
  catalog: ExecutionCatalog | null,
): ProfileChanges {
  if (!profileId) {
    if (!profileCombinationValid(catalog, draft)) return [];
    return [{ action: 'create', profile: { ...draft, name: draft.name.trim() } }];
  }
  if (!baseline) return [];

  const changes: ProfilePatch = {};
  if (baseline.name !== draft.name) changes.name = draft.name.trim();
  if (baseline.profile_type !== draft.profile_type) changes.profile_type = draft.profile_type;
  if (baseline.guidance !== draft.guidance) changes.guidance = draft.guidance;

  const selectionChanged = (['provider', 'model', 'effort'] as const).some((key) => baseline[key] !== draft[key]);
  if (selectionChanged && profileCombinationValid(catalog, draft)) {
    for (const key of ['provider', 'model', 'effort'] as const) {
      if (baseline[key] !== draft[key]) Object.assign(changes, { [key]: draft[key] });
    }
  }

  return Object.keys(changes).length > 0 ? [{ action: 'update', id: profileId, changes }] : [];
}
