import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';
import { vi } from 'vitest';
import type { GhRunner } from '../../apps/controller/src/modules/github/transport.js';

export type Completion = 'success' | 'failure' | 'timeout' | 'cancelled' | 'pending';
export type Layer = 'http' | 'logical' | 'graphql' | 'sql';
export interface Span {
  id: number; observation: string; purpose: string; layer: Layer; operation: string;
  start: number; end: number | null; completion: Completion; afterAbort: boolean; startedAfterAbort: boolean;
}
/** Test-only instrumentation. Never retains SQL, bindings, URL queries or remote payloads. */
export class BackendMeasurement {
  readonly spans: Span[] = [];
  private readonly context = new AsyncLocalStorage<{ observation: string; purpose: string }>();
  private readonly aborted = new Set<string>();
  constructor(private readonly now: () => number = () => performance.now()) {}
  abort(observation: string): void { this.aborted.add(observation); }
  observe<T>(observation: string, purpose: string, run: () => T): T {
    return this.context.run({ observation, purpose }, run);
  }
  private begin(layer: Layer, operation: string): Span | null {
    const context = this.context.getStore();
    if (!context) return null; // setup and teardown are outside the measured journey
    const span: Span = { ...context, id: this.spans.length + 1, layer, operation,
      start: this.now(), end: null, completion: 'pending', afterAbort: false,
      startedAfterAbort: this.aborted.has(context.observation) };
    this.spans.push(span);
    return span;
  }
  private finish(span: Span | null, completion: Completion): void {
    if (!span) return;
    span.end = this.now(); span.completion = completion;
    span.afterAbort = this.aborted.has(span.observation);
  }
  async measure<T>(layer: Layer, operation: string, run: () => Promise<T>, classify: (value: T) => Completion = () => 'success'): Promise<T> {
    const span = this.begin(layer, operation);
    try { const value = await run(); this.finish(span, classify(value)); return value; }
    catch (error) {
      this.finish(span, error instanceof Error && error.name === 'TimeoutError' ? 'timeout'
        : error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failure');
      throw error;
    }
  }
  /** Physical send starts at the existing runner onSend callback, never at logical invocation. */
  runner(run: GhRunner): GhRunner {
    return async (input, onSend, responseBytes) => {
      let span: Span | null = null;
      let sent = false;
      try {
        const result = await run(input, () => {
          if (sent) throw new Error('DUPLICATE_SEND_CALLBACK');
          sent = true; span = this.begin('graphql', 'page'); onSend?.();
          }, responseBytes);
        this.finish(span, 'success'); return result;
      } catch (error) {
        this.finish(span, error instanceof Error && error.name === 'TimeoutError' ? 'timeout'
          : error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failure');
        throw error;
      }
    };
  }
  /** Hooks execution, not prepare(): reused prepared statements count on every invocation. */
  installSql(): () => void {
    const probe = new Database(':memory:');
    const prototype: object = Object.getPrototypeOf(probe.prepare('SELECT 1'));
    probe.close();
    const hooks = (['all', 'get', 'run'] as const).map(method => {
      const target = prototype as Record<typeof method, (...args: unknown[]) => unknown>;
      const original = target[method];
      const meter = this;
      return vi.spyOn(target, method).mockImplementation(function(this: unknown, ...args: unknown[]) {
        const span = meter.begin('sql', method);
        try { const result: unknown = Reflect.apply(original, this, args); meter.finish(span, 'success'); return result; }
        catch (error) { meter.finish(span, 'failure'); throw error; }
      });
    });
    const original = Database.prototype.exec;
    const meter = this;
    const exec = vi.spyOn(Database.prototype, 'exec').mockImplementation(function(this: Database.Database, sql: string) {
      const span = meter.begin('sql', 'exec');
      try { const result = original.call(this, sql); meter.finish(span, 'success'); return result; }
      catch (error) { meter.finish(span, 'failure'); throw error; }
    });
    return () => { for (const hook of hooks) hook.mockRestore(); exec.mockRestore(); };
  }
  report(observation?: string, peakLayer: Layer = 'graphql', peakOperation?: string) {
    const selected = this.spans.filter(s => observation === undefined || s.observation === observation);
    const dependencies = selected.filter(s => s.layer === 'graphql' || s.layer === 'sql');
    const completed = dependencies.filter((s): s is Span & { end: number } => s.end !== null);
    const events = selected.filter(s => s.layer === peakLayer && (peakOperation === undefined || s.operation === peakOperation)).flatMap(s => [{ time: s.start, delta: 1 }, ...(s.end === null ? [] : [{ time: s.end, delta: -1 }])])
      .sort((a, b) => a.time - b.time || a.delta - b.delta);
    let active = 0; let peak = events.length ? 1 : 0;
    for (const event of events) { active += event.delta; peak = Math.max(peak, active); }
    return {
      counts: Object.fromEntries((['success', 'failure', 'timeout', 'cancelled', 'pending'] as const)
        .map(state => [state, selected.filter(s => s.completion === state).length])),
      dependencyWorkMs: completed.reduce((sum, s) => sum + s.end - s.start, 0),
      dependencyWindowMs: completed.length ? Math.max(...completed.map(s => s.end)) - Math.min(...completed.map(s => s.start)) : 0,
      httpMs: selected.filter(s => s.layer === 'http' && s.end !== null).map(s => s.end! - s.start),
      byOperation: [...new Set(selected.map(s => `${s.layer}:${s.operation}`))].map(key => ({
        key, count: selected.filter(s => `${s.layer}:${s.operation}` === key).length,
      })),
      peak,
      drainedAfterAbort: selected.filter(s => s.layer === 'graphql' && s.afterAbort && !s.startedAfterAbort).length,
      sendsAfterAbort: selected.filter(s => s.layer === 'graphql' && s.startedAfterAbort).length,
    };
  }
}
