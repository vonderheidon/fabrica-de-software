// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HttpOperationSummary, HttpQueueObservation, HttpAttemptSummary, ProjectPage } from '#contracts';
import type { OnboardingController } from '../onboarding/useOnboarding.js';
import { PrincipalScreen } from '../../app/PrincipalScreen.js';
import { parseHash } from '../../app/hash-route.js';
import { requestJson } from '../../api/http.js';

const projectA = '11111111-1111-4111-8111-111111111111';
const projectB = '22222222-2222-4222-8222-222222222222';
const attemptA = '33333333-3333-4333-8333-333333333333';
const epoch = 1_800_000_000_000;
const automationEnabled = process.env.OBSERVATION_AUTOMATION === 'enabled';
const page = { items: [], next_cursor: null, has_more: false, event_cursor: '1' };
const onboarding: OnboardingController = {
  load: { snapshot: null, loading: false, refreshing: false, error: null }, operation: { status: 'idle' }, busy: false,
  refresh: async () => null, saveProjectsRoot: async () => {}, complete: async () => {}, suppress: async () => {}, saveTool: async () => {}, recover: async () => {},
};
function operation(login = 'synthetic-account'): HttpOperationSummary {
  return { stage_activity: null, account: { id: 'account', login, observed_id: 'account', observed_at_ms: epoch },
    host: { designated: 'synthetic-host', current: 'synthetic-host', matches: true },
    automation: { enabled: automationEnabled, dispatch_paused: false, project_enabled: null }, active_attempt: null, active_attempt_count: 0,
    next_candidates: [], candidate_observation: { state: 'not_observed', requires_revalidation: true, order: 'observed_queue_order', has_more: false },
    recent_results: [], impediments: [], integration_status: { kind: 'maestri_native', state: 'not_checked', observation: null, proves_provider_execution: false }, event_cursor: '1' };
}
function queue(title = 'Synthetic candidate', complete = true): HttpQueueObservation {
  return { scope: { kind: 'account', project_ids: [projectA, projectB] }, enabled: automationEnabled, valid: true, complete,
    observation_id: attemptA, summary_hash: 'a'.repeat(64), observed_at_ms: Date.now(), eligible_total: complete ? 1 : null,
    modes_by_project: [], account: { id: 'account', login: 'synthetic-account' }, host: { expected: 'host', observed: 'host', matches: true },
    order: { criterion: 'issue-number', description: 'Synthetic order' }, diagnostics: [], event_cursor: '1',
    polling: { interval_ms: 15_000, backoff_max_ms: 60_000, retry_at_ms: null, next_poll_at_ms: Date.now() + 15_000 },
    page: { ...page, items: [{ project_id: projectA, project_name: 'Synthetic A', item_id: 'item-a', kind: 'issue', issue_id: 'issue-a',
      number: 1, title, url: null, assignees: [], status: 'Ready', ready: true, ready_eligible: true, eligible: true, reasons: [],
      consumption: 'available', attempt_id: null, order: { position: 1, criterion: 'issue-number' } }] } };
}
function attempt(number = 1, projectId = projectA): HttpAttemptSummary {
  return { id: attemptA, project_id: projectId, issue_id: `issue-${number}`, issue_number: number, phase: 'completed', result: 'delivered',
    suspension: null, revision: 1, created_at_ms: epoch, updated_at_ms: epoch };
}
const catalog: ProjectPage = { ...page, items: [projectA, projectB].map((id, index) => ({ id, deletion: null,
  name: `Synthetic ${index ? 'B' : 'A'}`, account_id: 'account', source: { kind: 'local', location: 'synthetic' }, base_branch: 'main',
  revision: 1, current_revision_id: id, prerequisites: [] })) };

type Request = { id: number; route: string; screen: string; trigger: string; started: number; ended: number | null;
  aborted: boolean; abortWhilePending: boolean; completedAfterAbort: boolean; responseBytes: number;
  completion: 'pending' | 'success' | 'failure'; resolve: (body?: unknown, status?: number) => void };
type VisibleSample = { screen: string; block: string; trigger: string; phase: 'cold' | 'warm'; started: number; rendered: number;
  outcome: 'valid' | 'empty' | 'partial' | 'error' | 'previous' };
let root: Root;
let container: HTMLDivElement;
let screen: string;
let trigger: string;
let automatic: boolean;
let records: Request[];
let samples: VisibleSample[];
const openDialog = vi.fn();

function defaultBody(route: string): unknown {
  if (route === '/api/v1/session') return { csrf_token: 'synthetic', instance_id: 'synthetic-instance' };
  if (route.startsWith('/api/v1/operation')) return operation();
  if (route.startsWith('/api/v1/queue')) return queue();
  if (route.startsWith('/api/v1/attempts')) return page;
  if (route.startsWith('/api/v1/projects/')) return { project: catalog.items[0], prerequisites: [], deletion: null, event_cursor: '1' };
  if (route.startsWith('/api/v1/projects')) return catalog;
  throw new Error(`UNEXPECTED_SYNTHETIC_ROUTE: ${route}`);
}
function matching(route: string): Request[] { return records.filter(record => record.route.startsWith(route)); }
async function tick(ms = 20): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function useful(tab: string): Promise<void> {
  const expected = tab === 'tentativas' ? 'Nenhuma tentativa registrada' : 'Synthetic candidate';
  const refreshLabel = tab === 'dashboard' ? 'Atualizar painel' : tab === 'fila' ? 'Revalidar fila' : 'Atualizar';
  for (let elapsed = 0; elapsed < 100; elapsed++) {
    const refresh = [...container.querySelectorAll('button')].find(button => button.textContent === refreshLabel);
    if (container.textContent?.includes(expected) && refresh && !refresh.disabled && refresh.getAttribute('aria-disabled') !== 'true') return;
    await tick(1);
  }
  throw new Error('NO_USEFUL_DOM_WITHIN_SYNTHETIC_WINDOW');
}
async function render(tab: string, params = ''): Promise<void> {
  screen = tab; trigger = 'mount';
  const hash = `#principal/${tab}${params ? `?${params}` : ''}`;
  window.history.replaceState(null, '', hash);
  await act(async () => root.render(createElement(PrincipalScreen, { route: parseHash(hash), onboarding,
    onOpenDialog: openDialog, onOpenProfileDialog: vi.fn(), onOpenInitialSetup: vi.fn(), onActionError: vi.fn() })));
}
async function event(kind: string, projectId = projectA): Promise<void> {
  trigger = kind;
  await act(async () => window.dispatchEvent(kind === 'resync' ? new Event('factory-controller-resync') : new CustomEvent('factory-controller-event', {
    detail: { event_type: kind === 'global' ? 'settings.updated' : 'attempt.updated', project_id: kind === 'global' ? null : projectId,
      attempt_id: kind === 'global' ? null : attemptA, entity: { type: kind === 'global' ? 'configuration' : 'attempt', id: attemptA }, seq: '2' },
  })));
}
async function click(label: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === label);
  expect(button, label).toBeDefined(); expect(button!.disabled).toBe(false);
  trigger = 'manual'; await act(async () => button!.click());
}
async function finish(record: Request, body?: unknown, status = 200): Promise<void> {
  await act(async () => record.resolve(body, status));
}
function capture(block: string, start: number, text: string, outcome: VisibleSample['outcome'] = 'valid', phase: VisibleSample['phase'] = 'cold'): void {
  expect(container.textContent).toContain(text);
  samples.push({ screen, block, trigger, phase, started: start, rendered: Date.now(), outcome });
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(epoch); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  records = []; samples = []; automatic = true; screen = ''; trigger = 'mount'; openDialog.mockClear();
  localStorage.clear(); sessionStorage.clear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => new Promise<Response>(resolve => {
    const route = String(input);
    const record: Request = { id: records.length + 1, route, screen, trigger, started: Date.now(), ended: null,
      aborted: false, abortWhilePending: false, completedAfterAbort: false, responseBytes: 0, completion: 'pending', resolve: (body = defaultBody(route), status = 200) => {
        expect(record.ended).toBeNull(); record.ended = Date.now(); record.completion = status >= 400 ? 'failure' : 'success';
        record.completedAfterAbort = record.abortWhilePending;
        const serialized = JSON.stringify(body); record.responseBytes = Buffer.byteLength(serialized);
        resolve(new Response(serialized, { status, headers: { 'Content-Type': 'application/json', ETag: 'synthetic-etag' } }));
      } };
    records.push(record);
    init?.signal?.addEventListener('abort', () => { record.aborted = true; record.abortWhilePending = record.ended === null; });
    // Ignoring abort deliberately models an already-started dependency returning late.
    if (automatic || route === '/api/v1/session') setTimeout(() => record.resolve(), 10);
  }));
  // Establish the technical session outside each measured journey, including the first test.
  await act(async () => {
    const setup = requestJson('/api/v1/projects');
    await vi.advanceTimersByTimeAsync(30); await setup;
  });
  records = []; vi.setSystemTime(epoch);
});
afterEach(async () => {
  console.info('WEB_WINDOW_REPORT ' + JSON.stringify({ scenario: expect.getState().currentTestName, automationEnabled,
    requests: records.length, responseBytes: records.reduce((sum, record) => sum + record.responseBytes, 0),
    completions: Object.fromEntries(['pending', 'success', 'failure'].map(state => [state, records.filter(record => record.completion === state).length])),
    abortedPending: records.filter(record => record.abortWhilePending).length, drained: records.filter(record => record.completedAfterAbort).length,
    samples, routes: [...new Set(records.map(record => `${record.screen}:${record.trigger}:${record.route}`))].map(key => ({ key,
      count: records.filter(record => `${record.screen}:${record.trigger}:${record.route}` === key).length })) }));
  await act(async () => root.unmount()); container.remove();
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it.each(['dashboard', 'fila'])('records %s idle for 120 simulated seconds and manual refresh', async tab => {
  const start = Date.now(); await render(tab); await useful(tab);
  capture('queue', start, 'Synthetic candidate');
  if (tab === 'dashboard') {
    capture('operation', start, 'synthetic-account'); capture('active', start, 'Nenhuma tentativa ativa.', 'empty');
    capture('results', start, 'Nenhum resultado registrado.', 'empty'); capture('projects', start, 'Synthetic A');
  }
  trigger = 'timer';
  for (let index = 0; index < 600; index++) await tick(200);
  const counts = { operation: matching('/api/v1/operation').length, active: matching('/api/v1/attempts').length,
    queue: matching('/api/v1/queue').length, projects: matching('/api/v1/projects').length };
  expect(counts.queue).toBe(8);
  expect(counts.operation).toBe(tab === 'dashboard' ? 2 : 0);
  expect(counts.active).toBe(tab === 'dashboard' ? 2 : 0);
  const before = records.length; const refreshStart = Date.now();
  await click(tab === 'dashboard' ? 'Atualizar painel' : 'Revalidar fila');
  capture('queue', refreshStart, 'Synthetic candidate', 'previous', 'warm');
  await useful(tab); capture('queue', refreshStart, 'Synthetic candidate', 'valid', 'warm');
  expect(records.length - before).toBe(tab === 'dashboard' ? 4 : 1);
  expect(records.every(record => record.screen === tab && record.trigger.length > 0 && record.ended !== null)).toBe(true);
  console.info('Synthetic web idle', JSON.stringify({ tab, simulatedMs: 120_000, counts, samples }));
});

it('measures Dashboard to Queue to Attempts to Dashboard using the real route lifecycle', async () => {
  for (const tab of ['dashboard', 'fila', 'tentativas', 'dashboard']) {
    const start = Date.now(); await render(tab); await useful(tab);
    capture(tab, start, tab === 'tentativas' ? 'Nenhuma tentativa registrada' : 'Synthetic candidate', tab === 'tentativas' ? 'empty' : 'valid');
  }
  expect(matching('/api/v1/queue')).toHaveLength(3);
  expect(matching('/api/v1/operation')).toHaveLength(2);
  expect(matching('/api/v1/attempts')).toHaveLength(3);
  expect(matching('/api/v1/projects')).toHaveLength(3);
  expect(samples).toHaveLength(4);
  console.info('Synthetic web navigation', JSON.stringify({ requests: records.map(({ resolve: _resolve, ...record }) => record), samples }));
});

it.each(['dashboard', 'fila', 'tentativas'])('attributes spaced events, resync and coincident triggers on %s', async tab => {
  await render(tab, tab === 'tentativas' ? `projectId=${projectA}` : ''); await tick(30);
  const before = records.length;
  for (const project of [projectA, projectB]) for (let count = 0; count < 10; count++) { await event('attempt', project); await tick(200); }
  const eventReads = records.length - before;
  expect(eventReads).toBe(tab === 'dashboard' ? 60 : tab === 'fila' ? 20 : 10);
  // Attempts on the current page also refresh across project scope; empty pages do not.
  if (tab === 'tentativas') expect(matching('/api/v1/attempts').length).toBe(11);
  const preResync = records.length; await event('resync'); await tick(); expect(records.length).toBeGreaterThan(preResync);
  const preGlobal = records.length; await event('global'); await tick();
  expect(records.length - preGlobal).toBe(tab === 'dashboard' ? 3 : tab === 'fila' ? 1 : 0);
  trigger = 'coincident';
  const beforeCoincident = records.length;
  await act(async () => {
    window.dispatchEvent(new Event('factory-controller-resync'));
    window.dispatchEvent(new CustomEvent('factory-controller-event', { detail: { entity: { type: 'attempt', id: attemptA }, project_id: projectA, attempt_id: attemptA } }));
  });
  await tick(); expect(records.length).toBeGreaterThan(beforeCoincident);
  console.info('Synthetic web events', JSON.stringify({ tab, eventReads, coincidentReads: records.length - beforeCoincident }));
});

it('measures rendered partial, error, retained content and confirmed empty as different outcomes', async () => {
  automatic = false; const start = Date.now(); await render('fila'); await tick();
  expect(container.textContent).toContain('Aguardando leitura válida'); expect(container.textContent).not.toContain('Nenhum item nesta página');
  await finish(matching('/api/v1/queue').at(-1)!, queue('Partial candidate', false));
  capture('queue', start, 'Consulta incompleta', 'partial');
  const refreshStart = Date.now(); await click('Revalidar fila'); capture('queue', refreshStart, 'Partial candidate', 'previous', 'warm');
  await finish(matching('/api/v1/queue').at(-1)!, { code: 'SYNTHETIC_UNAVAILABLE', message: 'Falha sintética', request_id: 'synthetic' }, 503);
  capture('queue', refreshStart, 'Não foi possível atualizar a fila', 'error', 'warm');
  expect(container.textContent).toContain('Partial candidate'); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await click('Revalidar fila'); expect(container.textContent).toContain('Não foi possível atualizar a fila');
  const empty = queue(); empty.page.items = []; empty.eligible_total = 0;
  await finish(matching('/api/v1/queue').at(-1)!, empty); capture('queue', refreshStart, 'Nenhum item nesta página', 'empty', 'warm');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  console.info('Synthetic web outcomes', JSON.stringify(samples));
});

it.each([false, true])('discards A after invalidation and B completion, late A failure=%s', async failure => {
  await render('dashboard'); await tick(30); automatic = false;
  await event('attempt'); const old = matching('/api/v1/queue').at(-1)!;
  await event('resync'); const current = matching('/api/v1/queue').at(-1)!;
  expect(current.id).not.toBe(old.id); expect(old.aborted).toBe(true);
  await finish(current, queue('B current'));
  expect(container.textContent).toContain('B current');
  await finish(old, failure ? { code: 'SYNTHETIC_UNAVAILABLE', message: 'Late A failure', request_id: 'synthetic' } : queue('A obsolete'), failure ? 503 : 200);
  expect(container.textContent).toContain('B current'); expect(container.textContent).not.toContain('A obsolete'); expect(container.textContent).not.toContain('Late A failure');
  expect(old.ended).not.toBeNull(); expect(old.completion).toBe(failure ? 'failure' : 'success');
  expect(old.completedAfterAbort).toBe(true);
});

it('records coincident timer, event and resync without assuming recurring operation timers', async () => {
  await render('dashboard'); await useful('dashboard');
  const before = records.length; trigger = 'timer+event+resync';
  const due = matching('/api/v1/queue')[0]!.ended! + 15_000;
  await tick(due - Date.now() - 1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
    window.dispatchEvent(new Event('factory-controller-resync'));
    window.dispatchEvent(new CustomEvent('factory-controller-event', { detail: { entity: { type: 'attempt', id: attemptA }, project_id: projectA, attempt_id: attemptA } }));
  });
  await tick();
  expect(records.length).toBeGreaterThan(before);
  expect(records.filter(record => record.trigger === 'timer+event+resync').every(record => record.ended !== null)).toBe(true);
  console.info('Synthetic web coincident timer', JSON.stringify({ requests: records.slice(before).map(({ resolve: _resolve, ...record }) => record) }));
});

it('discards stale operation and active-attempt results and errors after their replacements render', async () => {
  await render('dashboard'); await useful('dashboard'); automatic = false;
  await event('attempt'); const oldOperation = matching('/api/v1/operation').at(-1)!; const oldActive = matching('/api/v1/attempts').at(-1)!;
  await event('resync');
  await finish(matching('/api/v1/operation').at(-1)!, operation('new-account'));
  await finish(matching('/api/v1/attempts').at(-1)!, { ...page, items: [attempt(2)] });
  await finish(oldOperation, operation('obsolete-account'));
  await finish(oldActive, { code: 'SYNTHETIC_UNAVAILABLE', message: 'Old active error', request_id: 'synthetic' }, 503);
  expect(oldOperation.aborted && oldActive.aborted).toBe(true);
  expect(container.textContent).toContain('new-account'); expect(container.textContent).toContain('Issue #2');
  expect(container.textContent).not.toContain('obsolete-account'); expect(container.textContent).not.toContain('Old active error');
});

it('renders attempt continuation and visible failure while retaining the current page', async () => {
  automatic = false; await render('tentativas'); await tick();
  await finish(matching('/api/v1/projects').at(-1)!, catalog);
  await finish(matching('/api/v1/attempts').at(-1)!, { ...page, items: [attempt()], has_more: true, next_cursor: 'attempt-next' });
  await click('Próxima'); const next = matching('/api/v1/attempts').at(-1)!;
  expect(next.route).toContain('cursor=attempt-next'); expect(container.textContent).toContain('#1');
  await finish(next, { ...page, items: [attempt(2)] }); expect(container.textContent).toContain('Página 2'); expect(container.textContent).toContain('#2');
  await click('Anterior'); await finish(matching('/api/v1/attempts').at(-1)!, { code: 'SYNTHETIC_UNAVAILABLE', message: 'Falha sintética', request_id: 'synthetic' }, 503);
  expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.textContent).toContain('#2'); expect(container.textContent).toContain('Página 2');
  await click('Tentar novamente'); await finish(matching('/api/v1/attempts').at(-1)!, { ...page, items: [attempt()] });
  expect(container.textContent).toContain('Página 1'); expect(container.querySelector('[role="alert"]')).toBeNull();
});

it.each(['attempt', 'resync'])('invalidates immediately before completion on %s and preserves selection by IDs', async kind => {
  await render('dashboard'); await tick(30); automatic = false;
  await event('attempt'); const old = matching('/api/v1/queue').at(-1)!;
  await event(kind); await finish(old, queue('Obsolete title'));
  expect(container.textContent).not.toContain('Obsolete title');
  const fresh = queue('Current title'); fresh.page.items[0]!.issue_id = 'selected-issue'; fresh.page.items[0]!.project_id = projectB;
  await finish(matching('/api/v1/queue').at(-1)!, fresh);
  await click('Preparar'); expect(openDialog).toHaveBeenCalledWith('preparation', expect.anything(), { projectId: projectB, issueId: 'selected-issue' });
});

it('continues queue pagination and restarts on conflict without accepting an old continuation', async () => {
  automatic = false; await render('fila'); await tick();
  const first = queue('First page'); first.page.has_more = true; first.page.next_cursor = 'synthetic-next';
  await finish(matching('/api/v1/queue').at(-1)!, first); await click('Próxima página');
  expect(matching('/api/v1/queue').at(-1)!.route).toContain('cursor=synthetic-next');
  expect(container.textContent).toContain('First page');
  await finish(matching('/api/v1/queue').at(-1)!, queue('Second page')); expect(container.textContent).toContain('Second page');
  await click('Página anterior'); await finish(matching('/api/v1/queue').at(-1)!, first); await click('Próxima página');
  await finish(matching('/api/v1/queue').at(-1)!, { code: 'QUEUE_CHANGED', message: 'Changed', request_id: 'synthetic' }, 409);
  expect(matching('/api/v1/queue').at(-1)!.route).not.toContain('cursor=');
  expect(container.textContent).toContain('A consulta foi reiniciada');
  await finish(matching('/api/v1/queue').at(-1)!, queue('Restarted')); expect(container.textContent).toContain('Restarted');
});

it('preserves attempt page and ID actions, then discards pending work on project change and unmount', async () => {
  automatic = false; await render('tentativas', `projectId=${projectA}`); await tick();
  await finish(matching('/api/v1/projects?').at(-1)!, catalog);
  await finish(matching('/api/v1/projects/').at(-1)!, { project: catalog.items[0] });
  await finish(matching('/api/v1/attempts').at(-1)!, { ...page, items: [attempt()], has_more: true, next_cursor: 'attempt-next' });
  await click('Consultar'); expect(openDialog).toHaveBeenCalledWith('detail', expect.anything(), { attemptId: attemptA, projectId: projectA });
  await click('Próxima'); const previousProject = matching('/api/v1/attempts').at(-1)!;
  expect(previousProject.route).toContain('cursor=attempt-next'); expect(container.textContent).toContain('#1');
  await render('tentativas', `projectId=${projectB}`); expect(previousProject.aborted).toBe(true);
  const current = matching('/api/v1/attempts').at(-1)!; expect(current.route).toContain(projectB); expect(current.route).not.toContain('cursor=');
  await finish(current, { ...page, items: [attempt(2, projectB)] });
  await finish(previousProject, { ...page, items: [attempt(99)] }); expect(container.textContent).toContain('#2'); expect(container.textContent).not.toContain('#99');
  await click('Atualizar'); const leaving = matching('/api/v1/attempts').at(-1)!;
  await render('fila'); expect(leaving.aborted).toBe(true);
  await finish(leaving, { ...page, items: [attempt(88)] }); expect(container.textContent).not.toContain('#88');
});
