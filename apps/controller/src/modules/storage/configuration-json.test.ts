import { expect, it } from 'vitest';
import { readStatusOptionIds, storeStatusOptions } from './configuration-json.js';

it('rejects a four-state mapping and preserves the five current IDs without inventing Backlog', () => {
  const legacy = { ready: 'R', inProgress: 'IP', inReview: 'IR', delivered: 'D' };
  expect(() => readStatusOptionIds(legacy)).toThrowError(expect.objectContaining({ code: 'PROJECT_DATA_INVALID' }));
  expect(legacy).not.toHaveProperty('backlog');

  const current = { backlog: 'B', ready: 'R', in_progress: 'IP', in_review: 'IR', delivered: 'D' };
  const readCurrent = readStatusOptionIds({ backlog: 'B', ...legacy });
  expect(readCurrent).toEqual(current);
  expect(storeStatusOptions(readCurrent)).toEqual({ backlog: 'B', ...legacy });
});
