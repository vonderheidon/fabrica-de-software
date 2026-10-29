import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ProjectChanges, ProjectMapping, ProjectRevision } from './projects.js';

const legacy = { id: 'P', owner_id: 'O', status_field_id: 'F', status_option_ids: {
  ready: 'R', in_progress: 'IP', in_review: 'IR', delivered: 'D',
} };
const v3 = { ...legacy, status_option_ids: { backlog: 'B', ...legacy.status_option_ids } };

describe('current Project mappings', () => {
  it('rejects four-key mappings in both mapping and revision reads', () => {
    expect(Value.Check(ProjectMapping, legacy)).toBe(false);
    expect(Value.Check(ProjectRevision.properties.github_project, legacy)).toBe(false);
    expect(Value.Check(ProjectRevision.properties.github_project, v3)).toBe(true);
    expect(Value.Check(ProjectMapping, v3)).toBe(true);
    expect(Value.Check(ProjectMapping, { ...v3, status_option_ids: { backlog: 'SAME', ready: 'SAME', in_progress: 'SAME', in_review: 'SAME', delivered: 'SAME' } })).toBe(false);
    expect(Value.Check(ProjectMapping, { ...legacy, status_option_ids: { ...legacy.status_option_ids, backlog: null } })).toBe(false);
    expect(Value.Check(ProjectMapping, { ...legacy, status_option_ids: { ...legacy.status_option_ids, extra: 'X' } })).toBe(false);
  });
  it('accepts only V3 or null in project changes', () => {
    expect(Value.Check(ProjectChanges, { github_project: v3 })).toBe(true);
    expect(Value.Check(ProjectChanges, { github_project: null })).toBe(true);
    expect(Value.Check(ProjectChanges, { github_project: legacy })).toBe(false);
  });
});
