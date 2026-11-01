import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { HttpQueueObservation } from '#contracts';
import { QueueEnableSummary, QueuePanel } from '../apps/web/src/features/queue/QueuePanel.js';
import type { QueueLoad } from '../apps/web/src/features/queue/useQueue.js';

function observation(): HttpQueueObservation {
  return {
    scope: { kind: 'account', project_ids: [] }, enabled: true, valid: true, complete: true,
    observation_id: null, summary_hash: null, observed_at_ms: 1, eligible_total: 0,
    modes_by_project: [], account: { id: 'account', login: 'operator' },
    host: { expected: 'host', observed: 'host', matches: true },
    order: { criterion: 'issue-number', description: 'Projetos por ID; posição do quadro; número crescente e ID.' },
    page: { items: [{
      project_id: 'project', project_name: 'Portal', item_id: 'item', kind: 'issue', issue_id: 'issue',
      number: 42, title: 'Issue com título comprido para conferir a tabela', url: null,
      assignees: [{ id: 'account', login: 'operator' }], status: 'Done', ready: false,
      ready_eligible: false, eligible: false, reasons: ['ISSUE_CLOSED', 'STATUS_MISMATCH'],
      consumption: 'consumed', attempt_id: 'attempt', order: { position: 1, criterion: 'issue-number' },
    }], next_cursor: null, has_more: false, event_cursor: '0' },
    diagnostics: [], event_cursor: '0',
    polling: { interval_ms: 15_000, backoff_max_ms: 60_000, retry_at_ms: null, next_poll_at_ms: 15_000 },
  };
}

function render(load: QueueLoad, linkedAccountId: string | null = 'account'): string {
  const noop = () => {};
  const props: ComponentProps<typeof QueuePanel> = {
    load, linkedAccountId, pageNotice: '', pauseNotice: '', pauseUncertain: false, retryAtMs: null, canRefresh: load.status !== 'loading', pausing: false, canGoBack: false,
    onConsultPause: noop, onRefresh: noop, onNextPage: noop, onPreviousPage: noop,
    onEnable: noop, onPause: noop, onAuthority: noop,
  };
  return renderToStaticMarkup(createElement(QueuePanel, props));
}

it('retains rate-limit and identity warnings while refreshing the same observation', () => {
  const data = observation(); data.account = { id: null, login: null };
  data.diagnostics = [{ code: 'RATE_LIMITED', message: 'Aguarde.', recovery: 'Consultar depois.' }];
  data.polling.retry_at_ms = 123456;
  const html = render({ status: 'loading', observation: data, etag: '"1"', previousError: null });
  expect(html).toContain('Consulta ao GitHub pausada pelo limite de uso');
  expect(html).toContain('A consulta não confirmou a conta GitHub');
});

it('explains a ticket content blocker in the existing queue situation cell', () => {
  const data = observation();
  data.page.items[0] = { ...data.page.items[0]!, ready: true, eligible: false, consumption: 'available', attempt_id: null,
    reasons: ['ISSUE_OBJECTIVE_REQUIRED', 'CRITERION_ID_DUPLICATED'] };
  const html = render({ status: 'ready', observation: data, etag: 'revision' });
  expect(html).toContain('Descreva o objetivo sob Objetivo, Descrição ou What to build');
  expect(html).toContain('Use um identificador diferente para cada critério');
  expect(html).not.toContain('ISSUE_OBJECTIVE_REQUIRED');
});

it('keeps the observed queue visible and labels it while refreshing', () => {
  const html = render({ status: 'loading', observation: observation(), etag: 'revision', previousError: null });
  expect(html).toContain('Atualizando');
  expect(html).toContain('Última leitura');
  expect(html).toContain('Issue com título comprido');
  expect(html).toContain('Ver autoridade');
  expect(html).toContain('Já consumida na última leitura');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('disabled=""');
  expect(html).not.toContain('queue-error');
  expect(html).not.toContain('queue-degraded');
});

it('shows the server order in the enable summary without repeating it in the queue panel', () => {
  const data = observation();
  const panel = render({ status: 'ready', observation: data, etag: 'revision' });
  const enableSummary = renderToStaticMarkup(createElement(QueueEnableSummary, { observation: data }));
  expect(panel).not.toContain(data.order.description);
  expect(panel).toContain('<span>01</span>');
  expect(enableSummary).toContain(data.order.description);
  expect(`${panel}${enableSummary}`.toLowerCase()).not.toContain('prioridade');
});

it('preserves a genuine query failure throughout a retry', () => {
  const previousError = { message: 'Não foi possível consultar o GitHub.', requestId: null };
  const html = render({ status: 'loading', observation: observation(), etag: 'revision', previousError });
  expect(html).toContain('Não foi possível atualizar a fila');
  expect(html).toContain(previousError.message);
  expect(html).toContain('Os dados da última consulta foram mantidos');
});

it('presents an occupied queue as normal waiting while preserving actual diagnostic warnings', () => {
  const data = observation();
  data.diagnostics = [{ code: 'QUEUE_OCCUPIED', message: 'Já existe uma tentativa ativa.', recovery: 'A fila pode consumir o próximo candidato quando a tentativa terminar.' }];
  const waiting = render({ status: 'ready', observation: data, etag: 'revision' });
  expect(waiting).toContain('Aguardando a tentativa em andamento');
  expect(waiting).toContain('<span class="pill neutral">Em espera</span>');
  expect(waiting).toContain(data.diagnostics[0]!.recovery);
  expect(waiting).not.toContain('Atenção necessária');
  expect(waiting).not.toContain('Indisponível');

  data.diagnostics.push({ code: 'READ_INCOMPLETE', message: 'Falha na leitura do projeto.', recovery: 'Revalide a fila.' });
  const failed = render({ status: 'ready', observation: data, etag: 'revision' });
  expect(failed).toContain('Aguardando a tentativa em andamento');
  expect(failed).toContain('Leitura incompleta');
  expect(failed).toContain('Indisponível');
  expect(failed).toContain('pill warn');
});

it('marks the preserved list stale after refresh failure', () => {
  const html = render({ status: 'error', observation: observation(), etag: 'revision',
    message: 'Não foi possível consultar o GitHub.', requestId: null });
  expect(html).toContain('Dados desatualizados');
  expect(html).toContain('Última leitura');
  expect(html).toContain('Elegíveis na última leitura');
  expect(html).toContain('Não foi possível atualizar a fila');
  expect(html).toContain('Issue com título comprido');
  expect(html).toContain('disabled=""');
});

it('shows a rate-limit retry forecast without promising a successful response', () => {
  const data = observation();
  data.diagnostics = [{ code: 'RATE_LIMITED', message: 'Consultas GitHub pausadas.', recovery: 'Aguarde.' }];
  data.polling.retry_at_ms = 60_000;
  const html = render({ status: 'ready', observation: data, etag: 'revision' });
  expect(html).toContain('Consulta ao GitHub pausada pelo limite de uso');
  expect(html).toContain('Nova consulta prevista a partir de');
  expect(html).toContain('não garante que o GitHub responderá com sucesso');
});

it('separates the saved account binding from an unavailable or mismatched observation', () => {
  const current = observation();
  current.account = { id: 'other-account', login: 'other-user' };
  expect(render({ status: 'ready', observation: current, etag: 'revision' }, 'saved-account'))
    .toContain('Divergente · @other-user observada');

  const unavailable = observation();
  unavailable.account = { id: null, login: null };
  expect(render({ status: 'ready', observation: unavailable, etag: 'revision' }, 'saved-account'))
    .toContain('Vínculo salvo · confirmação indisponível');
});

it('keeps an explicit first-read state without inventing counts', () => {
  const html = render({ status: 'loading', observation: null, etag: null, previousError: null });
  expect(html).toContain('Consultando a fila pela primeira vez');
  expect(html).toContain('Aguardando leitura válida');
  expect(html).toContain('Não confirmado');
  expect(html).not.toContain('<dd>0</dd>');
});

it('keeps consumption and each ineligibility reason in the situation column', () => {
  const html = render({ status: 'ready', observation: observation(), etag: 'revision' });
  expect(html.match(/scope="col"/g)).toHaveLength(5);
  expect(html).toContain('Já consumida');
  expect(html).toContain('<li>Issue fechada</li>');
  expect(html).toContain('<li>Status não é Ready</li>');
  expect(html).toContain('data-label="Ações"');
});

it('disables queue reads during the retry backoff and shows the next attempt time', () => {
  const retryAtMs = Date.now() + 5_000;
  const html = render({ status: 'error', observation: observation(), etag: 'revision', message: 'temporarily unavailable', requestId: null });
  const blocked = renderToStaticMarkup(createElement(QueuePanel, {
    load: { status: 'error', observation: observation(), etag: 'revision', message: 'temporarily unavailable', requestId: null },
    linkedAccountId: 'account', pageNotice: '', pauseNotice: '', pauseUncertain: false, retryAtMs, canRefresh: false,
    onConsultPause: () => {}, onRefresh: () => {}, onNextPage: () => {}, onPreviousPage: () => {}, canGoBack: true,
    pausing: false, onEnable: () => {}, onPause: () => {}, onAuthority: () => {},
  }));
  expect(html).toContain('temporarily unavailable');
  expect(blocked.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  expect(blocked).toContain('Nova tentativa automática prevista a partir de');
});

it('does not describe an available but ineligible issue as ready to start', () => {
  const data = observation();
  data.page.items[0]!.consumption = 'available';
  const html = render({ status: 'ready', observation: data, etag: 'revision' });
  expect(html).toContain('Não elegível');
  expect(html).not.toContain('Aguardando início automático');
});
