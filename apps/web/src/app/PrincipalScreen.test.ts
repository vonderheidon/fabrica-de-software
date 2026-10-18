import { describe, expect, it } from 'vitest';
import type { ProjectPage } from '#contracts';
import { isProjectPage } from './PrincipalScreen.js';

const page: ProjectPage = {
  items: [{
    id: 'abcdef12-1234-4123-8123-123456789012', name: 'Factory project', account_id: null,
    source: { kind: 'local', location: 'C:/projects/factory' }, base_branch: 'main', revision: 1,
    current_revision_id: 'abcdef12-1234-4123-8123-123456789013', prerequisites: [],
  }],
  next_cursor: null, has_more: false, event_cursor: '0',
};

describe('Principal project page consumer', () => {
  it('recognizes current project pages, including an empty catalogue', () => {
    expect(isProjectPage(page)).toBe(true);
    expect(isProjectPage({ ...page, items: [] })).toBe(true);
  });

  it('rejects legacy pagination aliases instead of classifying them as current pages', () => {
    expect(isProjectPage({ items: page.items, nextCursor: null, hasMore: false, eventCursor: '0' })).toBe(false);
    expect(isProjectPage({ ...page, nextCursor: null, eventCursor: '0' })).toBe(false);
  });

  it('does not classify other panels or invalid project data as a project page', () => {
    for (const value of [null, {}, { settings: {}, profiles: [], eventCursor: '0' },
      { ...page, items: [{}] }, { ...page, has_more: 'false' }]) {
      expect(isProjectPage(value)).toBe(false);
    }
  });
});
