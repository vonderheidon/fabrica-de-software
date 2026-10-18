import type { ConfigurationOptionsQuery, ConfigurationUpdate, GlobalChanges, ProfileChanges, ProjectChanges, SettingsUpdate } from '#contracts';

export function configurationCommand(projectChanges: ProjectChanges | null, changes: GlobalChanges, profiles?: ProfileChanges): ConfigurationUpdate | SettingsUpdate {
  const profileChanges = profiles === undefined ? {} : { profile_changes: profiles };
  return projectChanges === null ? { changes, ...profileChanges }
    : { project_changes: projectChanges, ...(Object.keys(changes).length ? { global_changes: changes } : {}), ...profileChanges };
}
export function configurationOptionsParams(selection: Pick<ConfigurationOptionsQuery, 'owner_id' | 'github_project_id' | 'status_field_id'>, cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.owner_id) params.set('owner_id', selection.owner_id);
  if (selection.github_project_id) params.set('github_project_id', selection.github_project_id);
  if (selection.status_field_id) params.set('status_field_id', selection.status_field_id);
  if (cursor !== undefined) params.set('cursor', cursor);
  return params;
}
