import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';
import { vi } from 'vitest';
import { getGitHubRunnerLifecycle, type GhRunner } from '../../apps/controller/src/modules/github/transport.js';

export type Completion = 'success' | 'failure' | 'timeout' | 'cancelled' | 'pending';
export type Layer = 'http' | 'logical' | 'graphql' | 'sql';
export interface Span {
  id: number; observation: string; purpose: string; layer: Layer; operation: string;
  start: number; end: number | null; completion: Completion; afterAbort: boolean; startedAfterAbort: boolean;
  physicalEnd: number | null; physicalCompletion: 'not_started' | 'observed' | 'unknown';
}
export interface BackendMeasurementRecord {
  scenario: string; purpose: string; source_kind: 'simulation'; repetition: number;
  logical_calls: number; physical_sends: number; response_bytes: number | null;
  conservative_unknown_consumption_bytes: number; peak_in_flight: number; peak_logical_in_flight: number;
  admission_wait_ms: number; provider_simulated_ms: number; cooldown_blocks: number;
  duration_ms: number; result: string; equivalent: boolean | null;
  physical_completion: 'observed' | 'unknown' | 'not_started';
  selected_fields_absent?: string[];
}
/** Test-only instrumentation. Never retains SQL, bindings, URL queries or remote payloads. */
export class BackendMeasurement {
  readonly spans: Span[] = [];
  private readonly context = new AsyncLocalStorage<{ observation: string; purpose: string }>();
  private readonly aborted = new Set<string>();
  private readonly responseBytes = new Map<string, number | null>();
  private readonly unknownConsumptionBytes = new Map<string, number>();
  private readonly admissionWaitMs = new Map<string, number>();
  private readonly providerSimulatedMs = new Map<string, number>();
  private readonly cooldownBlocks = new Map<string, number>();
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
      startedAfterAbort: this.aborted.has(context.observation), physicalEnd: null,
      physicalCompletion: layer === 'graphql' ? 'unknown' : 'not_started' };
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
      const physical: { span: Span | null } = { span: null };
      let sent = false;
      try {
        const result = await run(input, () => {
          if (sent) throw new Error('DUPLICATE_SEND_CALLBACK');
          sent = true; physical.span = this.begin('graphql', 'page');
          onSend?.();
          }, responseBytes);
        if (physical.span) { physical.span.physicalCompletion = 'observed'; physical.span.physicalEnd = this.now(); }
        this.finish(physical.span, 'success'); return result;
      } catch (error) {
        const lifecycle = getGitHubRunnerLifecycle(error);
        if (physical.span) {
          physical.span.physicalCompletion = lifecycle?.physicallyClosed ? 'observed' : 'unknown';
          if (lifecycle?.physicallyClosed) physical.span.physicalEnd = this.now();
          if (lifecycle && !lifecycle.physicallyClosed) {
            const span = physical.span;
            void lifecycle.completion.then(() => {
              span.physicalCompletion = 'observed'; span.physicalEnd = this.now();
            });
          }
        }
        this.finish(physical.span, error instanceof Error && error.name === 'TimeoutError' ? 'timeout'
          : error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failure');
        throw error;
      }
    };
  }
  noteResponseBytes(bytes: number | null): void {
    const context = this.context.getStore();
    if (!context) return;
    const previous = this.responseBytes.get(context.observation);
    if (bytes === null || previous === null) this.responseBytes.set(context.observation, null);
    else this.responseBytes.set(context.observation, (previous ?? 0) + bytes);
  }
  noteCooldownBlock(): void {
    const context = this.context.getStore();
    if (context) this.cooldownBlocks.set(context.observation, (this.cooldownBlocks.get(context.observation) ?? 0) + 1);
  }
  noteAdmissionWaitMs(durationMs: number): void {
    const context = this.context.getStore();
    if (context) this.admissionWaitMs.set(context.observation,
      (this.admissionWaitMs.get(context.observation) ?? 0) + Math.max(0, durationMs));
  }
  noteProviderSimulatedMs(durationMs: number): void {
    const context = this.context.getStore();
    if (context) this.providerSimulatedMs.set(context.observation,
      (this.providerSimulatedMs.get(context.observation) ?? 0) + Math.max(0, durationMs));
  }
  noteConservativeUnknownConsumptionBytes(bytes: number): void {
    const context = this.context.getStore();
    if (context) this.unknownConsumptionBytes.set(context.observation,
      (this.unknownConsumptionBytes.get(context.observation) ?? 0) + Math.max(0, bytes));
  }
  record(observation: string | undefined, input: {
    scenario: string; purpose: string; repetition: number; result: string; equivalent: boolean | null;
    selected_fields_absent?: string[];
  }): BackendMeasurementRecord {
    const selected = this.spans.filter(span => observation === undefined || span.observation === observation);
    const sends = selected.filter(span => span.layer === 'graphql');
    const concurrencyPeak = (spans: Span[], end: (span: Span) => number | null) => {
      const events = spans.flatMap(span => [{ time: span.start, delta: 1 }, ...(end(span) === null ? [] : [{ time: end(span)!, delta: -1 }])])
        .sort((a, b) => a.time - b.time || a.delta - b.delta);
      let active = 0; let peak = 0;
      for (const event of events) { active += event.delta; peak = Math.max(peak, active); }
      return peak;
    };
    const logical = selected.filter(span => span.layer === 'logical');
    const duration = selected.filter(span => span.operation === 'scenario' && span.end !== null)
      .reduce((total, span) => total + span.end! - span.start, 0);
    const physicalStates = new Set(sends.map(span => span.physicalCompletion));
    const byteSamples = observation === undefined ? [...this.responseBytes.values()]
      : [this.responseBytes.has(observation) ? this.responseBytes.get(observation)! : null];
    const blockedSamples = observation === undefined ? [...this.cooldownBlocks.values()] : [this.cooldownBlocks.get(observation) ?? 0];
    return {
      ...input, source_kind: 'simulation', logical_calls: selected.filter(span => span.layer === 'logical').length,
      physical_sends: sends.length, response_bytes: sends.length === 0 ? 0 : byteSamples.length === 0 || byteSamples.some(bytes => bytes === null)
        ? null : byteSamples.reduce<number>((total, bytes) => total + (bytes ?? 0), 0),
      conservative_unknown_consumption_bytes: observation === undefined ? [...this.unknownConsumptionBytes.values()].reduce((sum, bytes) => sum + bytes, 0)
        : this.unknownConsumptionBytes.get(observation) ?? 0,
      peak_in_flight: concurrencyPeak(sends, span => span.physicalEnd),
      peak_logical_in_flight: concurrencyPeak(logical, span => span.end),
      admission_wait_ms: observation === undefined ? [...this.admissionWaitMs.values()].reduce((sum, ms) => sum + ms, 0)
        : this.admissionWaitMs.get(observation) ?? 0,
      provider_simulated_ms: observation === undefined ? [...this.providerSimulatedMs.values()].reduce((sum, ms) => sum + ms, 0)
        : this.providerSimulatedMs.get(observation) ?? 0,
      cooldown_blocks: blockedSamples.reduce((total, count) => total + count, 0), duration_ms: duration,
      physical_completion: sends.length === 0 ? 'not_started' : physicalStates.has('unknown') ? 'unknown' : 'observed',
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
