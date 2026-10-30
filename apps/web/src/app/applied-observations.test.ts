// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useControllerEvents } from './useControllerEvents.js';
import { useAppliedObservation } from './applied-observations.js';
import { EventConnectionStatus } from './EventConnectionStatus.js';

vi.mock('../api/http.js', () => ({ requestJson: vi.fn(async () => ({ event_cursor: '1' })) }));
const sources: Source[] = [];
class Source {
  static CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { sources.push(this); }
  addEventListener() {}
  close() { this.readyState = 2; }
  open() { this.readyState = 1; this.onopen?.(); }
  fail() { this.readyState = 0; this.onerror?.(); }
}
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
function Surface({ pending, failed, revision }: { pending: boolean; failed: boolean; revision: number }) {
  useAppliedObservation(true, pending, failed, revision);
  const state = useControllerEvents();
  return createElement('div', {}, createElement(EventConnectionStatus, { state }), createElement('p', {}, `Revisão aplicada: ${revision}`));
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); sources.length = 0; vi.unstubAllGlobals(); });
it('distinguishes applying recovered data from reconnecting the event stream', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('EventSource', Source);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const render = async (pending: boolean, failed: boolean, revision: number) => act(async () => root!.render(createElement(Surface, { pending, failed, revision })));
  await render(true, false, 0);
  await act(async () => sources[0]!.open());
  expect(host.textContent).toContain('Aplicando atualizações');
  await render(false, false, 1); expect(host.textContent).toContain('Atualizações conectadas');
  await render(false, true, 2); expect(host.textContent).toContain('Falha nas atualizações');
  await act(async () => window.dispatchEvent(new CustomEvent('health-http-success')));
  expect(host.textContent).toContain('Falha nas atualizações');
  await render(true, false, 3); expect(host.textContent).toContain('Falha nas atualizações');
  await render(false, false, 4); expect(host.textContent).toContain('Atualizações conectadas');
  await act(async () => sources[0]!.fail()); expect(host.textContent).toContain('Falha nas atualizações');
  await act(async () => sources[0]!.open()); expect(host.textContent).toContain('Aplicando atualizações');
  await render(false, false, 5); expect(host.textContent).toContain('Atualizações conectadas');
  expect(host.textContent).toContain('Revisão aplicada: 5');
});

it('keeps confirmed health during background reads but waits for applied data after a real resync', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('EventSource', Source);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const render = async (pending: boolean, failed: boolean, revision: number) => act(async () => root!.render(createElement(Surface, { pending, failed, revision })));
  await render(true, false, 0);
  await act(async () => sources[0]!.open());
  expect(host.textContent).toContain('Aplicando atualizações');
  await render(false, false, 1);
  await render(true, false, 2);
  expect(host.textContent).toContain('Atualizações conectadas');
  await render(false, false, 3);
  await act(async () => sources[0]!.open());
  expect(host.textContent).toContain('Aplicando atualizações');
  await render(true, false, 4);
  expect(host.textContent).toContain('Aplicando atualizações');
  await render(false, false, 5);
  expect(host.textContent).toContain('Atualizações conectadas');
  await render(false, true, 6);
  expect(host.textContent).toContain('Falha nas atualizações');
  await render(true, false, 7);
  expect(host.textContent).toContain('Falha nas atualizações');
  await render(false, false, 8);
  expect(host.textContent).toContain('Atualizações conectadas');
});
