import { describe, expect, it } from 'vitest';
import type { PreparationChoices } from '#contracts';
import { changedChoices, hasBlockingPrerequisites } from './preparation-requests.js';

describe('preparation authorization prerequisites', () => {
  it('allows summary review while executor validation remains deferred to start', () => {
    expect(hasBlockingPrerequisites([{ code: 'EXECUTOR_REVALIDATION_REQUIRED' }])).toBe(false);
  });
  it.each(['ASSIGNEE_MISMATCH', 'ORIGIN_INVALID', 'REMOTE_UNCONFIRMED', 'BASE_UNCONFIRMED', 'FUTURE_BLOCKER'])('keeps %s blocking even alongside deferred executor validation', (code) => {
    expect(hasBlockingPrerequisites([{ code: 'EXECUTOR_REVALIDATION_REQUIRED' }, { code }])).toBe(true);
  });
});

describe('preparation choice changes', () => {
  const choices: PreparationChoices = { issue_id: 'issue', delivery_mode: 'commit', guidance: '', overrides: {} };
  it('sends only the fields the form offers, never a per-attempt publication destination', () => {
    expect(changedChoices(choices, { ...choices, delivery_mode: 'pr', guidance: 'x' })).toEqual({ delivery_mode: 'pr', guidance: 'x' });
    expect(changedChoices(choices, { ...choices })).toEqual({});
  });
});
