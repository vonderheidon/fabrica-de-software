import { expect, it } from 'vitest';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { observationScenarios, withObservationFixture } from '../fixtures/observation-baseline.js';

it.each(['unchanged', 'closed', 'blocker', 'assignees', 'no-assignee', 'no-membership', 'invalid-criteria'] as const)(
  'preserves the full context facts required by queue eligibility with %s', async change => {
    const meter = new BackendMeasurement();
    await withObservationFixture(observationScenarios[1]!, async f => {
      const issue = f.issues.values().next().value!;
      if (change === 'closed') issue.state = 'CLOSED';
      if (change === 'blocker') issue.blockers = [{ id: 'I_blocker', number: 99, title: 'Open blocker', url: `${issue.repository.url}/issues/99`, state: 'OPEN' }];
      if (change === 'assignees') issue.assignees.push({ id: 'OTHER', login: 'other' });
      if (change === 'no-assignee') issue.assignees = [];
      if (change === 'no-membership') issue.memberships = [];
      if (change === 'invalid-criteria') issue.body = 'No criteria';
      const queue = await f.github.getIssueContextById(issue.id, { purpose: 'queue' });
      const full = await f.readFullIssueContext(issue.id);
      expect(queue.state).toBe('complete');
      expect(full.state).toBe('complete');
      if (!full.data || !('comments' in full.data)) throw new Error('FULL_CONTEXT_REQUIRED');
      const { comments: _comments, references: _references, ...expected } = full.data;
      expect(queue.data).toEqual(expected);
      expect(queue.data).not.toHaveProperty('comments');
      expect(queue.data).not.toHaveProperty('references');
      expect(full.data).toHaveProperty('comments');
      expect(full.data).toHaveProperty('references');
    }, { meter, wire: true, path: 'composed' });
  },
);
