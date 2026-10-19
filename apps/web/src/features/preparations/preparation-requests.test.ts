import { describe, expect, it } from 'vitest';
import { hasBlockingPrerequisites } from './preparation-requests.js';

describe('preparation authorization prerequisites', () => {
  it('allows summary review while executor validation remains deferred to start', () => {
    expect(hasBlockingPrerequisites([{ code: 'EXECUTOR_REVALIDATION_REQUIRED' }])).toBe(false);
  });
  it.each(['ASSIGNEE_MISMATCH', 'ORIGIN_INVALID', 'REMOTE_UNCONFIRMED', 'BASE_UNCONFIRMED', 'FUTURE_BLOCKER'])('keeps %s blocking even alongside deferred executor validation', (code) => {
    expect(hasBlockingPrerequisites([{ code: 'EXECUTOR_REVALIDATION_REQUIRED' }, { code }])).toBe(true);
  });
});
