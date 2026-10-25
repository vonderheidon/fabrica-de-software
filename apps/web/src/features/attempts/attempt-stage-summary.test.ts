// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { StageActivity } from '#contracts';
import { AttemptStageSummary } from './AttemptStageSummary.js';

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
const activity: StageActivity = { stage: 'implementing', started_at_ms: 1000, elapsed_ms: 60_000, last_activity_at_ms: 1000, observed_at_ms: 61_000, deadline_at_ms: null, remaining_ms: null, tracking_state: 'tracked', availability: 'known', reason: null };
async function render(value: StageActivity | null = activity, stale = false) {
  if (!root) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); }
  await act(async () => root!.render(createElement(AttemptStageSummary, { activity: value, stale })));
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('updates only the visual elapsed clock without changing observed activity or announcing every tick', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.setSystemTime(61_000);
  const before = JSON.stringify(activity);
  await render(); expect(host.textContent).toContain('1 min 0 s');
  await act(async () => vi.advanceTimersByTime(2000)); expect(host.textContent).toContain('1 min 2 s');
  expect(JSON.stringify(activity)).toBe(before); expect(host.querySelector('time')?.dateTime).toBe(new Date(1000).toISOString());
  expect(host.querySelector('[aria-live], [role="status"]')).toBeNull(); expect(host.textContent).not.toContain('Prazo restante');
  await render(activity, true); const stale = host.textContent;
  await act(async () => vi.advanceTimersByTime(3000)); expect(host.textContent).toBe(stale); expect(host.textContent).toContain('Dados da consulta anterior');
});
it('keeps absence explicit and distinguishes waiting, lost tracking and a configured deadline', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.setSystemTime(61_000);
  await render({ ...activity, stage: 'waiting_decision', deadline_at_ms: 62_000, remaining_ms: 1000 });
  expect(host.textContent).toContain('Aguardando decisão'); expect(host.textContent).toContain('Prazo restante');
  await act(async () => vi.advanceTimersByTime(1000)); expect(host.textContent).toContain('Prazo atingido');
  await render({ ...activity, stage: 'tracking_lost', tracking_state: 'lost', deadline_at_ms: null });
  expect(host.textContent).toContain('Acompanhamento perdido'); expect(host.textContent).toContain('não comprova parada física');
  await render({ ...activity, availability: 'unavailable', elapsed_ms: null, started_at_ms: null, last_activity_at_ms: null });
  expect(host.textContent?.match(/Indisponível/g)).toHaveLength(2); expect(host.textContent).not.toContain('%');
});
