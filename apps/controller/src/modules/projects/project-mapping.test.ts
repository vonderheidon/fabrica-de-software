import { expect, it } from 'vitest';
import type { ProjectConfiguration } from '#contracts';
import { validateProjectConfiguration } from './index.js';

const base: Omit<ProjectConfiguration, 'github_project'> = {
  source: { kind: 'github', location: 'https://github.com/org/repo', repository_id: 'REPO', repository_url: 'https://github.com/org/repo' },
  base_branch: 'main', implementer_profile_id: null, reviewer_profile_id: null, correction_limit: 2,
  default_delivery_mode: 'icr', automation_enabled: false, queue_order: { use_board_position: true }, guidance: '',
};
const mapping: NonNullable<ProjectConfiguration['github_project']> = { id: 'P', owner_id: 'O', status_field_id: 'F',
  status_option_ids: { backlog: 'B', ready: 'R', in_progress: 'IP', in_review: 'IR', delivered: 'D' } };

it('requires five distinct status option IDs for new V3 project mappings while retaining valid legacy reads', () => {
  expect(() => validateProjectConfiguration({ ...base, github_project: { ...mapping, status_option_ids: { ...mapping.status_option_ids, delivered: 'B' } } }))
    .toThrowError(expect.objectContaining({ code: 'STATUS_MAPPING_INVALID' }));
  expect(() => validateProjectConfiguration({ ...base, github_project: { id: 'P', owner_id: 'O', status_field_id: 'F',
    status_option_ids: { ready: 'R', in_progress: 'IP', in_review: 'IR', delivered: 'D' } } })).not.toThrow();
});
