import { expect, it } from 'vitest';
import { selectionAfterProjectDeletion } from './deletion-selection.js';

it('clears only the still selected removed registration and preserves unrelated filters', () => {
  const params = new URLSearchParams('projectId=removed&attemptId=old&deliveryId=old&operationId=old&dialog=detail&search=texto');
  const next = selectionAfterProjectDeletion(params, 'removed');
  expect(next?.toString()).toBe('search=texto');
  expect(params.get('projectId')).toBe('removed');
});
it('keeps an alternate selection intact when an old request completes late', () => {
  const params = new URLSearchParams('projectId=other&attemptId=current&dialog=detail');
  expect(selectionAfterProjectDeletion(params, 'removed')).toBeNull();
  expect(params.toString()).toBe('projectId=other&attemptId=current&dialog=detail');
  expect(selectionAfterProjectDeletion(new URLSearchParams(), 'removed')).toBeNull();
});
