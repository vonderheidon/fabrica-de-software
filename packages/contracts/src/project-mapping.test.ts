import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ProjectChanges, ProjectMapping, ReadProjectMapping } from './projects.js';

const legacy = { id: 'P', owner_id: 'O', status_field_id: 'F', status_option_ids: {
  ready: 'R', in_progress: 'IP', in_review: 'IR', delivered: 'D',
} };
const v3 = { ...legacy, status_option_ids: { backlog: 'B', ...legacy.status_option_ids } };

describe('V3 and legacy Project mappings', () => {
  it('reads exactly the historical four-key mapping or the five-key V3 mapping', () => {
    expect(Value.Check(ReadProjectMapping, legacy)).toBe(true);
    expect(Value.Check(ReadProjectMapping, v3)).toBe(true);
    expect(Value.Check(ProjectMapping, v3)).toBe(true);
    expect(Value.Check(ProjectMapping, { ...v3, status_option_ids: { backlog: 'SAME', ready: 'SAME', in_progress: 'SAME', in_review: 'SAME', delivered: 'SAME' } })).toBe(false);
    expect(Value.Check(ReadProjectMapping, { ...legacy, status_option_ids: { ...legacy.status_option_ids, backlog: null } })).toBe(false);
    expect(Value.Check(ReadProjectMapping, { ...legacy, status_option_ids: { ...legacy.status_option_ids, extra: 'X' } })).toBe(false);
  });
  it('accepts only V3 or null in project changes', () => {
    expect(Value.Check(ProjectChanges, { github_project: v3 })).toBe(true);
    expect(Value.Check(ProjectChanges, { github_project: null })).toBe(true);
    expect(Value.Check(ProjectChanges, { github_project: legacy })).toBe(false);
  });
});
