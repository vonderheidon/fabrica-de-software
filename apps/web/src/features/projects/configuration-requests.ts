import type { ConfigurationOptionsQuery, ConfigurationUpdate, GlobalChanges, ProfileChanges, ProjectChanges, SettingsUpdate } from '#contracts';

export function configurationCommand(projectChanges: ProjectChanges | null, changes: GlobalChanges, profiles?: ProfileChanges): ConfigurationUpdate | SettingsUpdate {
  const profileChanges = profiles === undefined ? {} : { profile_changes: profiles };
  if (projectChanges === null) return { changes, ...profileChanges };
  const fields: Partial<ProjectChanges> = {};
  if (projectChanges.source !== undefined) fields.source = projectChanges.source;
  if (projectChanges.base_branch !== undefined) fields.base_branch = projectChanges.base_branch;
  if (projectChanges.delivery_branch !== undefined) fields.delivery_branch = projectChanges.delivery_branch;
  if (projectChanges.github_project !== undefined) fields.github_project = projectChanges.github_project;
  if (projectChanges.implementer_profile_id !== undefined) fields.implementer_profile_id = projectChanges.implementer_profile_id;
  if (projectChanges.reviewer_profile_id !== undefined) fields.reviewer_profile_id = projectChanges.reviewer_profile_id;
  if (projectChanges.correction_limit !== undefined) fields.correction_limit = projectChanges.correction_limit;
  if (projectChanges.default_delivery_mode !== undefined) fields.default_delivery_mode = projectChanges.default_delivery_mode;
  if (projectChanges.automation_enabled !== undefined) fields.automation_enabled = projectChanges.automation_enabled;
  if (projectChanges.guidance !== undefined) fields.guidance = projectChanges.guidance;
  const queue_order = projectChanges.queue_order;
  const cleanQueueOrder = queue_order === undefined ? undefined : queue_order.use_board_position === undefined ? {} : { use_board_position: queue_order.use_board_position };
  return { project_changes: { ...fields, ...(cleanQueueOrder === undefined ? {} : { queue_order: cleanQueueOrder }) },
    ...(Object.keys(changes).length ? { global_changes: changes } : {}), ...profileChanges };
}
export function configurationOptionsParams(selection: Pick<ConfigurationOptionsQuery, 'owner_id' | 'github_project_id' | 'status_field_id'>, cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.owner_id) params.set('owner_id', selection.owner_id);
  if (selection.github_project_id) params.set('github_project_id', selection.github_project_id);
  if (selection.status_field_id) params.set('status_field_id', selection.status_field_id);
  if (cursor !== undefined) params.set('cursor', cursor);
  return params;
}
