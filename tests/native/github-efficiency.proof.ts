import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { expect, it } from 'vitest';
import * as contracts from '#contracts';
import * as storage from '../../apps/controller/src/modules/storage/index.js';
import * as pipeline from '../../apps/controller/src/modules/pipeline/index.js';
import * as mapping from '../../apps/controller/src/modules/projects/status-mapping.js';
import { createQueue } from '../../apps/controller/src/modules/projects/queue.js';
import { createClient } from '../../apps/controller/src/modules/github/client.js';
import { GraphQLReader } from '../../apps/controller/src/modules/github/transport.js';
import { observationFixture } from '../fixtures/observation-baseline.js';
import { observationWire } from '../fixtures/observation-wire.js';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reference = 'd036f9dd590188c72dd38eb300b73a378377a9b5';
const require = createRequire(import.meta.url);
const hashes: Record<string, { before: string; after: string }> = {};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const blob = (path: string) => execFileSync('git', ['show', `${reference}:${path}`], { cwd: root, encoding: 'utf8' });
const modules = new Map<string, Record<string, unknown>>();

function historical(name: 'queries' | 'transport' | 'client' | 'queue'): Record<string, unknown> {
  const cached = modules.get(name); if (cached) return cached;
  const path = `apps/controller/src/modules/${name === 'queue' ? 'projects' : 'github'}/${name}.ts`;
  const source = blob(path);
  hashes[path] = { before: digest(source), after: digest(readFileSync(new URL(path, new URL('../../', import.meta.url)), 'utf8')) };
  const exports: Record<string, unknown> = {}; modules.set(name, exports);
  const resolveImport = (specifier: string): unknown => {
    if (specifier === '#contracts') return contracts;
    if (specifier === '../storage/index.js') return storage;
    if (specifier === '../pipeline/index.js') return pipeline;
    if (specifier === './status-mapping.js') return mapping;
    if (specifier === '../github/index.js') return historical('client');
    for (const moduleName of ['queries', 'transport'] as const) if (specifier === `./${moduleName}.js`) return historical(moduleName);
    if (specifier.startsWith('node:') || specifier === '@sinclair/typebox/value') return require(specifier);
    throw new Error(`UNEXPECTED_REFERENCE_IMPORT:${specifier}`);
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 }, fileName: path }).outputText;
  // Only fixed, versioned repository modules are evaluated; no checkout or source copy is written.
  new Function('require', 'exports', compiled)(resolveImport, exports);
  return exports;
}

it.each([10, 100])('compares five alternating pairs using identical %i-issue project data and actions', async issuesPerProject => {
  const beforeRuntime = {
    createClient: historical('client').createClient as typeof createClient,
    GraphQLReader: historical('transport').GraphQLReader as typeof GraphQLReader,
  };
  const beforeQueue = historical('queue').createQueue as typeof createQueue;
  const samples: { version: string; repetition: number; sends: number; bytes: number; elapsedMs: number; usefulMs: number }[] = [];
  for (let repetition = 0; repetition < 5; repetition++) {
    const f = await observationFixture({ id: 'paired-efficiency', issuesPerProject, memberships: 1,
      pages: 1, latencyMs: 1, largeCommentBytes: 0 });
    try {
      let expectedRows: unknown;
      for (const version of repetition % 2 ? ['after', 'before'] : ['before', 'after']) {
        const meter = new BackendMeasurement();
        const remote = observationWire({ issues: f.issues, items: f.items, projects: f.projects, pages: 1,
          account: () => 'ACCOUNT_test', latencyMs: 1 }, meter, { applyLatency: true }, 'client',
        version === 'before' ? beforeRuntime : { createClient, GraphQLReader });
        const queue = (version === 'before' ? beforeQueue : createQueue)({ storage: f.storage, github: remote,
          workspaces: f.workspaces, hostName: 'synthetic-host' });
        let elapsedMs = 0; let usefulMs = 0; let sends = 0; let bytes = 0;
        for (let cycle = 0; cycle < 3; cycle++) {
          if (cycle) f.advance(11_000);
          const name = `${version}-${repetition}-${cycle}`;
          await meter.observe(name, 'display', () => meter.measure('http', 'scenario', async () => {
            const start = performance.now();
            const [screen, scheduler] = await Promise.all([queue.read({ limit: '7' }), queue.observe({ limit: '100' })]);
            usefulMs += performance.now() - start;
            expect(screen.observation.complete).toBe(true);
            expect(screen.items).toHaveLength(issuesPerProject * 2);
            expect(scheduler.items).toEqual(screen.items);
            const rows = screen.items;
            if (!expectedRows) expectedRows = rows;
            else expect(rows).toEqual(expectedRows);
            const warm = await queue.read({ limit: '7' });
            expect(warm.items).toEqual(rows);
            const page = await queue.read({ limit: '7', cursor: screen.observation.page.next_cursor! });
            expect(page.observation.page.items).toEqual(rows.slice(7, 14));
          }));
          const record = meter.record(name, { scenario: 'paired-repeated', purpose: 'display', repetition: repetition + 1,
            result: 'completed', equivalent: true });
          expect(record.physical_sends).toBe(version === 'before' ? 3 * (8 + issuesPerProject * 10) : 8 + issuesPerProject * 4);
          expect(record.response_bytes).not.toBeNull();
          elapsedMs += record.duration_ms; sends += record.physical_sends; bytes += record.response_bytes!;
          console.log(`QUEUE_PAIRED_CYCLE ${JSON.stringify({ version, cycle,
            virtual_offset_ms: cycle * 11_000, items: f.issues.size, ...record, points: null,
            logical_calls_instrumented: false })}`);
        }
        const sample = { version, repetition: repetition + 1, sends, bytes, elapsedMs, usefulMs };
        samples.push(sample);
        console.log(`QUEUE_PAIRED ${JSON.stringify({ items: issuesPerProject * 2, ...sample, points: null })}`);
        f.advance(11_000);
      }
    } finally { await f.close(); }
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[2]!;
  const before = samples.filter(row => row.version === 'before');
  const after = samples.filter(row => row.version === 'after');
  console.log(`QUEUE_PAIRED_SUMMARY ${JSON.stringify({ items: issuesPerProject * 2, reference, hashes,
    repetitions: 5, cycles: 3, virtual_offsets_ms: [0, 11_000, 22_000], latency_ms: 1,
    before, after, reduction_percent: 100 * (1 - after[0]!.sends / before[0]!.sends),
    useful_median_before_ms: median(before.map(row => row.usefulMs)), useful_median_after_ms: median(after.map(row => row.usefulMs)),
    time_target_reduction_percent: 20, time_target_met: median(after.map(row => row.usefulMs)) <= 0.8 * median(before.map(row => row.usefulMs)),
    points: null, source_kind: 'simulation', reference_scope: 'queue-client-queries-transport; current storage/contracts/support' })}`);
});

