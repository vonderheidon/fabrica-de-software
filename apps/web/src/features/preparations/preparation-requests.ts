import type { PreparationChoices, PreparationUpdate } from '#contracts';

export function changedChoices(before: PreparationChoices, after: PreparationChoices): PreparationUpdate['changes'] {
  const changes: PreparationUpdate['changes'] = {};
  if (before.issue_id !== after.issue_id) changes.issue_id = after.issue_id;
  if (before.delivery_mode !== after.delivery_mode) changes.delivery_mode = after.delivery_mode;
  if (before.guidance !== after.guidance) changes.guidance = after.guidance;
  if (JSON.stringify(before.overrides) !== JSON.stringify(after.overrides)) changes.overrides = after.overrides;
  return changes;
}
export function hasBlockingPrerequisites(prerequisites: readonly { code: string }[]): boolean {
  // The start command revalidates the executor; this observation never authorizes execution.
  return prerequisites.some((item) => item.code !== 'EXECUTOR_REVALIDATION_REQUIRED');
}

