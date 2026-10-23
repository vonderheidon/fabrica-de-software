import { expect, it } from 'vitest';
import { readStatusOptionIds, storeStatusOptions } from './configuration-json.js';

it('preserves legacy status option keys and only writes backlog when supplied', () => {
  const legacy = { ready: 'R', inProgress: 'IP', inReview: 'IR', delivered: 'D' };
  const readLegacy = readStatusOptionIds(legacy);
  expect(readLegacy).toEqual({ ready: 'R', in_progress: 'IP', in_review: 'IR', delivered: 'D' });
  expect(Object.hasOwn(readLegacy, 'backlog')).toBe(false);
  expect(storeStatusOptions(readLegacy)).toEqual(legacy);

  const current = { backlog: 'B', ready: 'R', in_progress: 'IP', in_review: 'IR', delivered: 'D' };
  const readCurrent = readStatusOptionIds({ backlog: 'B', ...legacy });
  expect(readCurrent).toEqual(current);
  expect(storeStatusOptions(readCurrent)).toEqual({ backlog: 'B', ...legacy });
});
