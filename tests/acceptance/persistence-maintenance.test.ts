import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { HttpOperationSummary as OperationSummary } from '#contracts';
import { publicationFixture } from '../fixtures/publication.js';
import { captureFixture } from '../fixtures/capture.js';
import { assertNoContent, auditDatabase, inventory, sha256, sizes } from '../fixtures/persistence-measurement.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { createEnvironmentRecovery } from '../../apps/controller/src/modules/workspaces/recovery.js';
import { createRetainedVerifier } from '../../apps/controller/src/modules/workspaces/retention.js';
import type { GitReader } from '../../apps/controller/src/modules/workspaces/git.js';

const markers = ['changed tracked bytes\n', 'IMPLEMENTATION_INDEX_UNCHANGED', 'EXCLUDED_IGNORED_BYTES_987', 'EXCLUDED_SECRET_BYTES_123', 'CACHE_CONTENT_AC29_76543210', 'diff --git'];

async function observeQueryPlans<T>(read: () => Promise<T>) {
  const prepare = Database.prototype.prepare;
  const plans = new Map<string, { sqlSha256: string; plan: unknown[] }>();
  const spy = vi.spyOn(Database.prototype, 'prepare').mockImplementation(function (this: Database.Database, sql: string) {
    const statement = prepare.call(this, sql);
    const database = this;
    return new Proxy(statement, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (['all', 'get', 'iterate'].includes(String(property)) && /^\s*SELECT\b/iu.test(sql)) {
          return (...bindings: unknown[]) => {
            const sqlSha256 = sha256(sql);
            if (!plans.has(sqlSha256)) {
              const explained = prepare.call(database, `EXPLAIN QUERY PLAN ${sql}`);
              const plan = Reflect.apply(explained.all, explained, bindings) as unknown[];
              plans.set(sqlSha256, { sqlSha256, plan });
            }
            return Reflect.apply(value as (...args: unknown[]) => unknown, target, bindings);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
  try {
    const result = await read();
    expect(plans.size).toBeGreaterThan(0);
    return { result, statements: [...plans.values()] };
  } finally { spy.mockRestore(); }
}

function observeContentIO(directory: string) {
  const readers = [vi.spyOn(fs, 'readFileSync'), vi.spyOn(fs, 'openSync'), vi.spyOn(fs, 'readdirSync'), vi.spyOn(fs, 'statSync'), vi.spyOn(fs, 'lstatSync'),
    vi.spyOn(fsPromises, 'readFile'), vi.spyOn(fsPromises, 'open'), vi.spyOn(fsPromises, 'readdir'), vi.spyOn(fsPromises, 'stat'), vi.spyOn(fsPromises, 'lstat')];
  syncBuiltinESMExports();
  return {
    assertNoContentIO() {
      const root = directory.replaceAll('\\', '/').toLowerCase();
      const forbidden = readers.some(reader => reader.mock.calls.some(args => {
        const path = String(args[0]).replaceAll('\\', '/').toLowerCase();
        return ['work', 'git'].some(part => path === `${root}/${part}` || path.startsWith(`${root}/${part}/`));
      }));
      expect(forbidden, 'summary reads must not access work/Git files').toBe(false);
    },
    clear() { for (const reader of readers) reader.mockClear(); },
    assertInstrumented() { expect(readers[5]).toHaveBeenCalled(); },
    restore() { for (const reader of readers) reader.mockRestore(); syncBuiltinESMExports(); },
  };
}

it('measures final HTTP projections at 0/16/64 MiB and retains producer/reviewer evidence after close/reopen and eligible removal (controlled Git)', async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  const f = await publicationFixture(false, 'icr', true, { temporaryRoot: join(process.cwd(), '.cache') });
  let app: ReturnType<typeof createApp> | undefined;
  let restarted: ReturnType<typeof openStorage> | undefined;
  let recoveryPipeline: ReturnType<typeof createPipeline> | undefined;
  let restartedAudit: Database.Database | undefined;
  try {
    const producer = f.status().passageId;
    const binding = f.persistence.getPassage({ passageId: producer }).binding;
    const captured = await captureFixture(f.directory, { attemptId: f.attemptId, passageId: producer, deliveryId: binding.deliveryVersion });
    await writeFile(join(captured.implementation, '.gitignore'), '/node_modules/\n/cache/\n.env\n'); captured.untracked.push('.gitignore');
    Object.assign(f.workspaces, { captureDelivery: vi.fn(captured.capture) });
     const producerChecks = [{ id: 'npm.cmd run typecheck', outcome: 'passed', evidence: 'Producer result for the captured workspace' }];
     await f.implement(producerChecks); await f.approve();
    const deliveryId = f.status().deliveryId!;
    const approved = f.storage.getReview(deliveryId)!;
    expect(approved.state).toBe('approved');
     expect(f.storage.getProducerResult(deliveryId)?.result.checks).toEqual(producerChecks);
     expect(f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('verification_runs','checks','artifacts')").all()).toEqual([]);
    // Revoke coordination and explicitly confirm the two simulated terminals. No physical process is claimed.
    f.persistence.recordCancellation(f.attemptId, randomUUID());
    for (const passageId of [producer, approved.passageId]) f.persistence.recordStop({ passageId }, { passageId, state: 'confirmed' });
    await f.pipeline.close();
    app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined, undefined, undefined, f.pipeline);
    await app.ready();
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'x-factory-client': 'web' }, payload: {} });
    expect(bootstrap.statusCode).toBe(200);
    const headers = { host: '127.0.0.1:4310', cookie: bootstrap.cookies.map(c => `${c.name}=${c.value}`).join('; ') };
    const endpoints: Record<string, string> = {
      catalog: '/api/v1/projects', listings: '/api/v1/attempts?limit=1', history: `/api/v1/events?attempt_id=${f.attemptId}`,
      polling: `/api/v1/attempts/${f.attemptId}`, delivery: `/api/v1/deliveries/${deliveryId}`,
       producerResult: `/api/v1/deliveries/${deliveryId}/producer-result`, rounds: `/api/v1/attempts/${f.attemptId}/rounds`, dashboard: '/api/v1/operation',
    };
    const pagedPassages = `/api/v1/attempts/${f.attemptId}?section=passages&limit=1`;
    const firstPassagePage = await app.inject({ url: pagedPassages, headers });
    expect(firstPassagePage.statusCode).toBe(200);
    const firstPassagePageBody = firstPassagePage.json<{ details: { items: { id: string }[]; next_cursor: string | null; has_more: boolean } | null }>().details;
    expect(firstPassagePageBody).not.toBeNull();
    expect(firstPassagePageBody!.items).toHaveLength(1); expect(firstPassagePageBody!.has_more).toBe(true);
    expect(firstPassagePageBody!.next_cursor).toBeTruthy();
    const pagedPassagesNext = `${pagedPassages}&cursor=${encodeURIComponent(firstPassagePageBody!.next_cursor!)}`;
    endpoints.pagedPassagesNext = pagedPassagesNext;
    const secondPassagePage = await app.inject({ url: pagedPassagesNext, headers });
    expect(secondPassagePage.statusCode).toBe(200);
    const secondPassagePageDetails = secondPassagePage.json<{ details: { items: { id: string }[] } | null }>().details;
    expect(secondPassagePageDetails).not.toBeNull();
    expect(secondPassagePageDetails!.items.map(item => item.id)).not.toContain(firstPassagePageBody!.items[0]!.id);
    const baseline = new Map<string, string>();
    const probeBaseline = new Map<string, string>();
    const stages = [];
    const callsBefore = captured.calls.length;
    const eventsBefore = f.db.prepare('SELECT max(seq) AS seq FROM events').get();
    const versionBefore = f.db.pragma('data_version', { simple: true });
    const cache = join(captured.implementation, 'node_modules', '.cache'); await mkdir(cache, { recursive: true });
    for (const cacheBytes of [0, 16_777_216, 67_108_864]) {
      if (cacheBytes) {
        const chunk = Buffer.alloc(1_048_576); chunk.fill('CACHE_CONTENT_AC29_76543210');
        // A normal dense file, not sparse/truncated allocation. It lives solely in this fixture.
        const { open } = await import('node:fs/promises');
        const file = await open(join(cache, 'ignored.bin'), 'w');
        try { for (let i = 0; i < cacheBytes / chunk.length; i++) await file.writeFile(chunk); await file.sync(); } finally { await file.close(); }
      }
      const measured = [];
      const queryPlans: { surface: string; statements: { sqlSha256: string; plan: unknown[] }[] }[] = [];
      const probeHashes: { surface: string; payloadSha256: string }[] = [];
      const contentIO = observeContentIO(f.directory);
      try {
      // Positive control ensures the instrumentation actually sees named builtin imports.
      await readFile(join(captured.implementation, '.git', 'index')); contentIO.assertInstrumented(); contentIO.clear();
      for (const [name, url] of Object.entries(endpoints)) {
        const elapsed: number[] = []; const payloadBytes: number[] = [];
        // One warm-up per surface, then twenty sequential samples including HTTP serialization.
        for (let sample = -1; sample < 20; sample++) {
          const start = performance.now();
          // Reuse the existing warm-up so instrumentation does not change request
          // counts/rate limits. Bindings and SQL text never enter the report.
          const observation = sample === -1 ? await observeQueryPlans(() => app!.inject({ url, headers })) : null;
          const response = observation ? observation.result : await app.inject({ url, headers });
          const duration = performance.now() - start;
          if (observation) queryPlans.push({ surface: name, statements: observation.statements });
          expect(response.statusCode, name).toBe(200);
          let body = response.body;
          if (name === 'listings') {
            const page = response.json<{ items: Record<string, unknown>[] }>();
            expect(page.items).toHaveLength(1);
            expect(page.items[0]).not.toHaveProperty('capture');
            expect(page.items[0]).not.toHaveProperty('producer_result');
            expect(page.items[0]).not.toHaveProperty('review');
          }
          if (name === 'polling') {
            const detail = response.json<Record<string, unknown>>();
            expect(detail).not.toHaveProperty('capture');
            expect(detail).not.toHaveProperty('producer_result');
            expect(detail).not.toHaveProperty('review_details');
          }
          if (name === 'dashboard') {
            const dto = response.json<OperationSummary>();
            // Read-time diagnostics have an observation timestamp. Preserve every other field.
            dto.impediments = dto.impediments.map(d => ({ ...d, observed_at_ms: 0 })); body = JSON.stringify(dto);
          }
          // Query-time stage observations change even when persisted facts stay identical.
          body = JSON.stringify(JSON.parse(body) as unknown, (key, value: unknown) => key === 'observed_at_ms' ? 0 : value);
          if (!baseline.has(name)) baseline.set(name, body);
          expect(body, name).toBe(baseline.get(name)); assertNoContent(Buffer.from(body), markers);
          if (sample >= 0) { elapsed.push(duration); payloadBytes.push(Buffer.byteLength(response.body)); }
        }
        elapsed.sort((a, b) => a - b);
        measured.push({ surface: name, samples: elapsed.length, payloadMinBytes: Math.min(...payloadBytes), payloadMaxBytes: Math.max(...payloadBytes),
         medianMs: (elapsed[9]! + elapsed[10]!) / 2, p95Ms: elapsed[18], maxMs: elapsed[19], stablePayloadSha256: sha256(baseline.get(name)!) });
      }
      const probes = [
        ['pagedPassages', pagedPassages],
        ['emptySearch', '/api/v1/attempts?issue_number=999999'],
        ['attemptDetail', `/api/v1/attempts/${f.attemptId}`],
        ['pagedPassagesNext', pagedPassagesNext],
      ] as const;
      for (const [name, url] of probes) {
        const response = await app.inject({ url, headers });
        expect(response.statusCode, name).toBe(200);
        if (name === 'emptySearch') expect(response.json<{ items: unknown[] }>().items).toEqual([]);
        if (name === 'pagedPassages') {
          const details = response.json<{ details: { items: { id: string }[]; has_more: boolean } | null }>().details;
          expect(details).not.toBeNull(); expect(details!.items).toHaveLength(1); expect(details!.has_more).toBe(true);
          expect(details!.items[0]!.id).toBe(firstPassagePageBody!.items[0]!.id);
        }
        if (name === 'attemptDetail') {
          const detail = response.json<Record<string, unknown>>();
          expect(detail).not.toHaveProperty('capture'); expect(detail).not.toHaveProperty('producer_result');
          expect(detail.details).toBeNull(); expect(detail.v3_details).toBeNull();
        }
        if (name === 'pagedPassagesNext') {
          const details = response.json<{ details: { items: { id: string }[] } | null }>().details;
          expect(details).not.toBeNull(); expect(details!.items).toHaveLength(1);
          expect(details!.items.map(item => item.id)).not.toContain(firstPassagePageBody!.items[0]!.id);
        }
        const normalized = JSON.stringify(JSON.parse(response.body) as unknown, (key, value: unknown) => key === 'observed_at_ms' ? 0 : value);
        assertNoContent(Buffer.from(normalized), markers);
        if (!probeBaseline.has(name)) probeBaseline.set(name, normalized);
        expect(normalized, name).toBe(probeBaseline.get(name));
        probeHashes.push({ surface: name, payloadSha256: sha256(normalized) });
      }
      contentIO.assertNoContentIO();
      } finally { contentIO.restore(); }
      const files = await inventory(f.directory);
      expect(files.filter(file => file.path.startsWith('git/')).every(file => file.path === `git/${f.attemptId}.git/factory-owner`)).toBe(true);
      for (const file of files.filter(p => !p.path.startsWith('work/') && !p.path.startsWith('issues/') && !p.path.startsWith('git/'))) {
        assertNoContent(await readFile(join(f.directory, file.path)), markers);
         expect(['factory.sqlite', 'factory.sqlite-wal', 'factory.sqlite-shm'].includes(file.path)).toBe(true);
      }
      stages.push({ generatedCacheBytes: cacheBytes, sizes: sizes(files), measurements: measured, queryPlans, probes: probeHashes, audit: auditDatabase(f.db, markers) });
    }
    // Compare official logical data and retained producer/reviewer records, not a zero-growth SQLite SLA.
    expect(stages.map(s => s.audit)).toEqual([stages[0]!.audit, stages[0]!.audit, stages[0]!.audit]);
    expect(stages.map(s => s.queryPlans)).toEqual([stages[0]!.queryPlans, stages[0]!.queryPlans, stages[0]!.queryPlans]);
    for (const stage of stages) {
      expect(stage.sizes.operationalWorkBytes - stages[0]!.sizes.operationalWorkBytes).toBe(stage.generatedCacheBytes);
      expect(stage.sizes.otherAuxiliaryBytes).toBe(0);
    }
    expect(f.db.pragma('data_version', { simple: true })).toBe(versionBefore);
    expect(f.db.prepare('SELECT max(seq) AS seq FROM events').get()).toEqual(eventsBefore);
    expect(captured.calls.length).toBe(callsBefore);
    const approvedDelivery = f.storage.getDelivery(deliveryId).delivery;
     expect((await inventory(f.directory)).some(file => file.path.startsWith('artifacts/'))).toBe(false);
    const controlledObjectBytes = [...captured.blobs.values()].reduce((n, b) => n + b.length, 0);
    for (const blob of captured.blobs.values()) assertNoContent(blob, markers.filter(m => m !== 'changed tracked bytes\n'));
    await app.close(); app = undefined;
    // Close the inspection connection too: reopening must not borrow a live SQLite
    // connection from the first controller. This still is not a process restart.
    f.db.close();
    restarted = openStorage({ dataDirectory: f.directory });
    restartedAudit = new Database(join(f.directory, 'factory.sqlite'), { readonly: true });
    expect(restarted.getDelivery(deliveryId).delivery).toEqual(approvedDelivery);
    expect(restarted.getReview(deliveryId)).toEqual(approved);
     expect(restarted.getProducerResult(deliveryId)?.result.checks).toEqual(producerChecks);
     expect(restartedAudit!.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('verification_runs','checks','artifacts')").all()).toEqual([]);
    const afterRestartSizes = sizes(await inventory(f.directory));
    await unlink(join(captured.implementation, '.env'));
    const run: GitReader = async (cwd, args, options) => {
      if (args.includes('ls-tree') && args.at(-1) === approvedDelivery.commitSha) {
        return { exitCode: 0, stdout: [...captured.trees.get(approvedDelivery.contentIdentity!)!].map(([name, hash]) => `100644 blob ${hash}\t${name}\0`).join('') };
      }
      if (args.includes('ls-files')) return { exitCode: 0, stdout: [...new Set([...captured.base.keys(), ...captured.untracked])].map(p => p + '\0').join('') };
      return captured.run(cwd, args, options);
    };
    const recovery = createEnvironmentRecovery(f.directory, run, undefined, async p => p, async () => f.directory, async () => captured.implementation);
    const workspaces = { ...f.workspaces, ...recovery };
    recoveryPipeline = createPipeline({ ...f.dependencies, storage: restarted, workspaces });
    const resource = restarted.getResources(f.attemptId).entries.find(r => r.kind === 'implementation')!;
    const plan = await recoveryPipeline.getRemovalPlan(f.attemptId, resource.id);
    expect(plan.view.capability.available).toBe(true);
    const operation = await recoveryPipeline.removeResource(f.attemptId, resource.id, { confirmed: true, planHash: plan.view.planHash }, { operationId: randomUUID(), expectedRevision: plan.etag });
    await recoveryPipeline.drain(); expect(restarted.getOperation(operation.operation_id)?.state).toBe('succeeded');
    expect(restarted.getResources(f.attemptId).entries.find(r => r.id === resource.id)?.removed).toBe(true);
     expect((await inventory(f.directory)).some(file => file.path.startsWith('artifacts/'))).toBe(false);
    const afterRemovalSizes = sizes(await inventory(f.directory));
    const eventsAfterRemoval = restartedAudit.prepare('SELECT max(seq) AS seq FROM events').get();
    const verify = createRetainedVerifier(f.directory, captured.run, async p => p, async () => f.directory);
    await verify(approvedDelivery);
    const diff = await captured.diff(approvedDelivery, {});
    expect(diff.entries.some(entry => entry.patch?.includes('changed tracked bytes'))).toBe(true);
    const unavailable: GitReader = async (cwd, args, options) => args.includes('fsck') ? { exitCode: 1, stdout: '' } : captured.run(cwd, args, options);
    await expect(createRetainedVerifier(f.directory, unavailable, async p => p, async () => f.directory)(approvedDelivery)).rejects.toMatchObject({ code: 'DELIVERY_GIT_UNAVAILABLE' });
    expect(restarted.getDelivery(deliveryId).delivery).toEqual(approvedDelivery);
    auditDatabase(restartedAudit, markers);
    console.log('AC29_REPORT ' + JSON.stringify({ formatVersion: 1, level: 'real_sqlite_filesystem_http_inject_controlled_git_review_canonicalization',
      node: process.version, schemaVersion: restarted.getDiagnostics().schemaVersion, stages, controlledObjectBytes,
      identity: { attemptId: f.attemptId, deliveryId, gitRef: approvedDelivery.gitRef, tree: approvedDelivery.contentIdentity, base: approvedDelivery.baseSha },
      afterRestartSizes, afterRemovalSizes, metadataChanges: { eventsBefore, eventsAfterRemoval, cause: 'Explicit removal operation, durable receipt and resource state, plus controller close/reopen; outside the read-only cache comparison.' },
       recovery: { controller: 'in_process_close_reopen', approvedRefTreeBasePreserved: true, eligibleRemoval: true, diffAfterRemoval: true,
         unavailableGitObject: 'DELIVERY_GIT_UNAVAILABLE', physicalProcesses: 'not_started_in_cache_measurement', realGit: 'controlled_in_memory' },
      interpretation: 'No latency SLA. SQLite/WAL may change with legitimate events/checkpoints; stable read phase verified by data_version and event sequence. Git disk is only fixture ownership, object bytes are controlled in-memory blobs.' }));
  } finally {
    await app?.close(); await recoveryPipeline?.close(); restarted?.close(); restartedAudit?.close(); await f.close();
  }
}, 30_000);
