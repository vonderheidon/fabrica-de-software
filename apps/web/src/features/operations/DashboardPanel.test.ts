import { describe, expect, it } from 'vitest';
import type { HttpQueueItem } from '#contracts';
import { upcomingCandidates } from './DashboardPanel.js';

const issue: HttpQueueItem = {
  project_id: 'abcdef12-1234-4123-8123-123456789012', project_name: 'Projeto', item_id: 'item', kind: 'issue',
  issue_id: 'issue', number: 1, title: 'Issue pronta', url: null, assignees: [], status: 'Ready', ready: true,
  ready_eligible: true, eligible: false, reasons: ['AUTOMATION_DISABLED'], consumption: 'available', attempt_id: null,
  order: { position: 1, criterion: 'issue-number', value: null },
};

describe('dashboard upcoming candidates', () => {
  it('shows a ready issue when only project automation prevents automatic dispatch without changing eligibility', () => {
    expect(upcomingCandidates([issue])).toEqual([issue]);
    expect(issue.eligible).toBe(false);
    expect(issue.reasons).toEqual(['AUTOMATION_DISABLED']);
  });
  it.each(['ALREADY_CONSUMED', 'ASSIGNEE_MISMATCH', 'ATTEMPT_ACTIVE', 'READ_INCOMPLETE'] as const)('does not present %s as an automation-only impediment', (reason) => {
    expect(upcomingCandidates([{ ...issue, reasons: ['AUTOMATION_DISABLED', reason] }])).toEqual([]);
  });
  it('keeps eligible candidates in observed order and limits the preview to five', () => {
    const items = Array.from({ length: 7 }, (_, index) => ({ ...issue, item_id: String(index), eligible: true, reasons: [] }));
    expect(upcomingCandidates(items).map((item) => item.item_id)).toEqual(['0', '1', '2', '3', '4']);
  });
  it('does not treat an unready issue as ready because automation is disabled', () => {
    expect(upcomingCandidates([{ ...issue, ready_eligible: false }])).toEqual([]);
  });
});
