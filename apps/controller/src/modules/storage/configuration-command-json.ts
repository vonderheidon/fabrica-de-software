import type { ConfigurationUpdate, PreparationChoices, PreparationUpdate, ProfileChanges, ProjectChanges, ProjectRegistration, SettingsUpdate } from '#contracts';
import { storeCheck, storeMapping } from './configuration-json.js';

// Idempotency hashes retain the immediately preceding public command shape.
// Common snake_case fields were already public before this family changed.
// These projections never accept legacy aliases at the HTTP boundary.
function projectChanges(value: ProjectChanges) {
  const order = value.queue_order;
  return {
    ...(value.source === undefined ? {} : { source: value.source }),
    ...(value.base_branch === undefined ? {} : { baseBranch: value.base_branch }),
    ...(value.github_project === undefined ? {} : { githubProject: value.github_project === null ? null : storeMapping(value.github_project) }),
    ...(value.implementer_profile_id === undefined ? {} : { implementerProfileId: value.implementer_profile_id }),
    ...(value.reviewer_profile_id === undefined ? {} : { reviewerProfileId: value.reviewer_profile_id }),
    ...(value.checks === undefined ? {} : { checks: value.checks.map(storeCheck) }),
    ...(value.correction_limit === undefined ? {} : { correctionLimit: value.correction_limit }),
    ...(value.default_delivery_mode === undefined ? {} : { defaultDeliveryMode: value.default_delivery_mode }),
    ...(value.automation_enabled === undefined ? {} : { automationEnabled: value.automation_enabled }),
    ...(order === undefined ? {} : { queueOrder: {
      ...(order.priority_field_id === undefined ? {} : { priorityFieldId: order.priority_field_id }),
      ...(order.priority_direction === undefined ? {} : { priorityDirection: order.priority_direction }),
      ...(order.use_board_position === undefined ? {} : { useBoardPosition: order.use_board_position }),
    } }),
    ...(value.guidance === undefined ? {} : { guidance: value.guidance }),
  };
}
export function registrationCommandJson(value: ProjectRegistration, githubProject?: NonNullable<import('#contracts').ProjectConfiguration['github_project']>) {
  return { name: value.name, source: value.source, baseBranch: value.base_branch,
    ...(githubProject === undefined ? {} : { githubProject: requireV3Mapping(githubProject) }) };
}
function requireV3Mapping(mapping: NonNullable<import('#contracts').ProjectConfiguration['github_project']>) {
  if (!('backlog' in mapping.status_option_ids)) throw new Error('PROJECT_MAPPING_INVALID');
  return { id: mapping.id, owner_id: mapping.owner_id, status_field_id: mapping.status_field_id, status_option_ids: mapping.status_option_ids };
}
function profileChangesJson(value: ProfileChanges) {
  return value.map((command) => command.action === 'create'
    ? { action: command.action, profile: { ...command.profile, guidance: command.profile.guidance ?? '' } }
    : command);
}
export function settingsCommandJson(value: SettingsUpdate) {
  const preferences = value.tool_preferences;
  return { changes: value.changes,
    ...(value.onboarding_changes === undefined ? {} : { onboardingChanges: value.onboarding_changes }),
    ...(value.profile_changes === undefined ? {} : { profileChanges: profileChangesJson(value.profile_changes) }),
    ...(value.gh_executable_path === undefined ? {} : { gh_executable_path: value.gh_executable_path }),
    ...(value.account_binding === undefined ? {} : { account_binding: value.account_binding }),
    ...(preferences === undefined ? {} : { tool_preferences: {
      format_version: preferences.format_version,
      git: { preferred_path: preferences.git.preferred_path },
      maestri: { preferred_path: preferences.maestri.preferred_path },
      omp: { preferred_path: preferences.omp.preferred_path },
      powershell: { preferred_path: preferences.powershell.preferred_path },
    } }),
  };
}
export function configurationCommandJson(value: ConfigurationUpdate) {
  return { projectChanges: projectChanges(value.project_changes),
    ...(value.global_changes === undefined ? {} : { globalChanges: value.global_changes }),
    ...(value.profile_changes === undefined ? {} : { profileChanges: profileChangesJson(value.profile_changes) }),
  };
}
function preparationChanges(value: PreparationUpdate['changes']) {
  const overrides = value.overrides;
  return {
    ...(value.issue_id === undefined ? {} : { issueId: value.issue_id }),
    ...(value.delivery_mode === undefined ? {} : { deliveryMode: value.delivery_mode }),
    ...(value.guidance === undefined ? {} : { guidance: value.guidance }),
    ...(overrides === undefined ? {} : { overrides: {
      ...(overrides.base_branch === undefined ? {} : { baseBranch: overrides.base_branch }),
      ...(overrides.implementer_profile === undefined ? {} : { implementerProfile: overrides.implementer_profile }),
      ...(overrides.reviewer_profile === undefined ? {} : { reviewerProfile: overrides.reviewer_profile }),
      ...(overrides.checks === undefined ? {} : { checks: overrides.checks.map(storeCheck) }),
      ...(overrides.correction_limit === undefined ? {} : { correctionLimit: overrides.correction_limit }),
      ...(overrides.time_defaults === undefined ? {} : { timeDefaults: overrides.time_defaults }),
      ...(overrides.artifact_policy === undefined ? {} : { artifactPolicy: overrides.artifact_policy }),
    } }),
  };
}
export function preparationCommandJson(value: PreparationChoices | PreparationUpdate) {
  if ('changes' in value) return { changes: preparationChanges(value.changes) };
  return { ...preparationChanges(value), ...(value.previous_attempt_id === undefined ? {} : { previousAttemptId: value.previous_attempt_id }) };
}
