import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { HttpQueueObservation } from '#contracts';
import { QueuePanel } from '../apps/web/src/features/queue/QueuePanel.js';
import type { QueueLoad } from '../apps/web/src/features/queue/useQueue.js';

function observation(): HttpQueueObservation {
  return {
    scope: { kind: 'account', project_ids: [] }, enabled: true, valid: true, complete: true,
    observation_id: null, summary_hash: null, observed_at_ms: 1, eligible_total: 0,
    modes_by_project: [], account: { id: 'account', login: 'operator' },
    host: { expected: 'host', observed: 'host', matches: true },
    order: { criterion: 'priority', description: 'Configured priority' },
    page: { items: [{
      project_id: 'project', project_name: 'Portal', item_id: 'item', kind: 'issue', issue_id: 'issue',
      number: 42, title: 'Issue com título comprido para conferir a tabela', url: null,
      assignees: [{ id: 'account', login: 'operator' }], status: 'Done', ready: false,
      ready_eligible: false, eligible: false, reasons: ['ISSUE_CLOSED', 'STATUS_MISMATCH'],
      consumption: 'consumed', attempt_id: 'attempt', order: { position: 1, criterion: 'priority', value: null },
    }], next_cursor: null, has_more: false, event_cursor: '0' },
    diagnostics: [], event_cursor: '0',
    polling: { interval_ms: 15_000, backoff_max_ms: 60_000, retry_at_ms: null, next_poll_at_ms: 15_000 },
  };
}

function render(load: QueueLoad): string {
  const noop = () => {};
  const props: ComponentProps<typeof QueuePanel> = {
    load, pageNotice: '', pauseNotice: '', pauseUncertain: false, pausing: false, canGoBack: false,
    onConsultPause: noop, onRefresh: noop, onNextPage: noop, onPreviousPage: noop,
    onEnable: noop, onPause: noop, onAuthority: noop,
  };
  return renderToStaticMarkup(createElement(QueuePanel, props));
}

it('keeps the observed queue and rows visible during background refresh without transient notices', () => {
  const html = render({ status: 'loading', observation: observation(), etag: 'revision', previousError: null });
  expect(html).toContain('Ligada');
  expect(html).toContain('Issue com título comprido');
  expect(html).toContain('Ver autoridade');
  expect(html).not.toContain('dado desatualizado');
  expect(html).not.toContain('Atualizando a observação');
  expect(html).not.toContain('queue-error');
  expect(html).not.toContain('queue-degraded');
});

it('preserves a genuine query failure throughout a retry', () => {
  const previousError = { message: 'Não foi possível consultar o GitHub.', requestId: null };
  const html = render({ status: 'loading', observation: observation(), etag: 'revision', previousError });
  expect(html).toContain('Não foi possível atualizar a fila');
  expect(html).toContain(previousError.message);
  expect(html).toContain('Os dados da última consulta foram mantidos');
});

it('keeps consumption and each ineligibility reason in the situation column', () => {
  const html = render({ status: 'ready', observation: observation(), etag: 'revision' });
  expect(html.match(/scope="col"/g)).toHaveLength(5);
  expect(html).toContain('Já consumida');
  expect(html).toContain('<li>Issue fechada</li>');
  expect(html).toContain('<li>Status não é Ready</li>');
  expect(html).toContain('data-label="Ações"');
});

it('does not describe an available but ineligible issue as ready to start', () => {
  const data = observation();
  data.page.items[0]!.consumption = 'available';
  const html = render({ status: 'ready', observation: data, etag: 'revision' });
  expect(html).toContain('Não elegível');
  expect(html).not.toContain('Aguardando início automático');
});
