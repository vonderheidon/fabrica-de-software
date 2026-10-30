import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { HttpQueueItem, HttpQueueObservation } from '#contracts';
import { DashboardPanel } from './DashboardPanel.js';

vi.mock('./useOperation.js', () => ({ useOperation: () => ({ data: null, loading: false, refreshing: false, error: null, stale: false }) }));
vi.mock('./useActiveAttempt.js', () => ({ useActiveAttempt: () => ({ data: null, valid: true, loading: false, refreshing: false, error: null, stale: false }) }));
vi.mock('../queue/useQueue.js', () => ({ useQueue: () => ({ load: { status: 'ready', observation }, pageNotice: '' }) }));

const item: HttpQueueItem = {
  project_id: 'project', project_name: 'Factory', item_id: 'item-24', kind: 'issue', issue_id: 'issue-24',
  number: 24, title: 'Consumed Ready issue', url: null, assignees: [{ id: 'account', login: 'operator' }],
  status: 'Ready', ready: true, ready_eligible: true, eligible: false, reasons: ['ALREADY_CONSUMED'],
  consumption: 'consumed', attempt_id: 'attempt', order: { position: 1, criterion: 'issue-number' },
};
const observation: HttpQueueObservation = {
  scope: { kind: 'account', project_ids: ['project'] }, enabled: false, valid: true, complete: true,
  observation_id: null, summary_hash: null, observed_at_ms: 1, eligible_total: 0, modes_by_project: [],
  account: { id: 'account', login: 'operator' }, host: { expected: 'host', observed: 'host', matches: true },
  order: { criterion: 'issue-number', description: 'Issue order' },
  page: { items: [item, { ...item, item_id: 'item-25', issue_id: 'issue-25', number: 25,
    title: 'Blocked Ready issue', ready_eligible: false, reasons: ['OPEN_BLOCKERS'], consumption: 'available',
    attempt_id: null, order: { position: 2, criterion: 'issue-number' } }], next_cursor: null, has_more: false, event_cursor: '0' },
  diagnostics: [], event_cursor: '0',
  polling: { interval_ms: 15_000, backoff_max_ms: 60_000, retry_at_ms: null, next_poll_at_ms: 15_000 },
};

it('distinguishes two Ready issues from zero upcoming candidates without offering to prepare blocked or consumed issues', () => {
  const noop = () => {};
  const asyncNoop = async () => {};
  const props: ComponentProps<typeof DashboardPanel> = {
    projects: null, projectsLoad: { loading: false, refreshing: false, error: null, stale: false, empty: true },
    onRefreshProjects: noop, onOpenSetup: noop, onPrepare: noop, onAttempt: noop,
    onboarding: { load: { snapshot: null, loading: false, refreshing: false, error: null }, operation: { status: 'idle' },
      busy: false, refresh: async () => null, saveProjectsRoot: asyncNoop, complete: asyncNoop, suppress: asyncNoop,
      saveTool: asyncNoop, recover: asyncNoop },
  };
  const html = renderToStaticMarkup(createElement(DashboardPanel, props));
  expect(html).toContain('2 issues em Ready nesta página');
  expect(html).toContain('nenhum próximo candidato disponível');
  expect(html).not.toContain('Nenhuma issue pronta');
  expect(html).not.toContain('>Preparar</button>');
});
