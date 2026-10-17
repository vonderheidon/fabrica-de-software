import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { CheckDefinition, Delivery, OperationSummary } from '#contracts';
import { publicationFixture } from '../fixtures/publication.js';
import { captureFixture } from '../fixtures/capture.js';
import { assertNoContent, auditDatabase, inventory, sha256, sizes } from '../fixtures/persistence-measurement.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { createVerification } from '../../apps/controller/src/modules/verification/index.js';
import { createEnvironmentRecovery } from '../../apps/controller/src/modules/workspaces/recovery.js';
import { createRetainedVerifier } from '../../apps/controller/src/modules/workspaces/retention.js';
import type { GitReader } from '../../apps/controller/src/modules/workspaces/git.js';

const markers = ['changed tracked bytes\n', 'IMPLEMENTATION_INDEX_UNCHANGED', 'EXCLUDED_IGNORED_BYTES_987', 'EXCLUDED_SECRET_BYTES_123', 'CACHE_CONTENT_AC29_76543210', 'diff --git'];
const checks: CheckDefinition[] = [
  { id: 'existing-check', command: 'fixture existing check', cwdRelative: '.' },
  { id: 'additional-check', command: 'fixture additional check', cwdRelative: '.', timeoutMs: 1234 },
];

function observeContentIO(directory: string) {
  const readers = [vi.spyOn(fs, 'readFileSync'), vi.spyOn(fs, 'openSync'), vi.spyOn(fs, 'readdirSync'), vi.spyOn(fs, 'statSync'), vi.spyOn(fs, 'lstatSync'),
    vi.spyOn(fsPromises, 'readFile'), vi.spyOn(fsPromises, 'open'), vi.spyOn(fsPromises, 'readdir'), vi.spyOn(fsPromises, 'stat'), vi.spyOn(fsPromises, 'lstat')];
  syncBuiltinESMExports();
  return {
    assertNoContentIO() {
      const root = directory.replaceAll('\\', '/').toLowerCase();
      const forbidden = readers.some(reader => reader.mock.calls.some(args => {
        const path = String(args[0]).replaceAll('\\', '/').toLowerCase();
        return ['work', 'git', 'artifacts'].some(part => path === `${root}/${part}` || path.startsWith(`${root}/${part}/`));
      }));
      expect(forbidden, 'summary reads must not access work/Git/evidence files').toBe(false);
    },
    clear() { for (const reader of readers) reader.mockClear(); },
    assertInstrumented() { expect(readers[5]).toHaveBeenCalled(); },
    restore() { for (const reader of readers) reader.mockRestore(); syncBuiltinESMExports(); },
  };
}

it('measures final HTTP projections at 0/16/64 MiB and retains approved identity/evidence after close/reopen and eligible removal (controlled Git)', async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  const f = await publicationFixture(false, 'icr', true, { temporaryRoot: join(process.cwd(), '.cache'), checks });
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
    const materializeCheck = vi.fn(async (_delivery: Delivery, id: string) => {
      const checkout = join(f.directory, 'work', f.attemptId, 'checks', id, 'checkout');
      await mkdir(checkout, { recursive: true }); return checkout;
    });
    const runner = vi.fn(async () => ({ state: 'passed' as const, exitCode: 0, diagnostic: null, endedAtMs: Date.now(), durationMs: 1, output: Buffer.from('Pertinent check evidence\n') }));
    const verification = createVerification({ storage: f.storage, workspaces: { materializeCheck }, dataDirectory: f.directory, logFailure: f.logFailure }, { runner, canonicalize: async p => p });
    f.verification.verifyDelivery.mockImplementation(id => verification.verifyDelivery(id, new AbortController().signal));
    await f.implement(); await f.approve();
    const deliveryId = f.status().deliveryId!;
    const approved = f.storage.getReview(deliveryId)!;
    expect(approved.state).toBe('approved');
    expect(f.storage.getCheckHistory(deliveryId, {}).entries.map(c => c.checkDefinitionId).sort()).toEqual(checks.map(c => c.id).sort());
    expect(runner.mock.calls).toHaveLength(2);
    expect(materializeCheck.mock.calls).toHaveLength(2);
    const artifact = f.storage.getCheckHistory(deliveryId, {}).entries[0]!.artifacts[0]!;
    // Revoke coordination and explicitly confirm the two simulated terminals. No physical process is claimed.
    f.persistence.recordCancellation(f.attemptId, randomUUID());
    for (const passageId of [producer, approved.passageId]) f.persistence.recordStop({ passageId }, { passageId, state: 'confirmed' });
    await f.pipeline.close();
    app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined, undefined, undefined, f.pipeline);
    await app.ready();
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'x-factory-client': 'web' }, payload: {} });
    expect(bootstrap.statusCode).toBe(200);
    const headers = { host: '127.0.0.1:4310', cookie: bootstrap.cookies.map(c => `${c.name}=${c.value}`).join('; ') };
    const endpoints = {
      catalog: '/api/v1/projects', listings: '/api/v1/attempts', history: `/api/v1/events?attemptId=${f.attemptId}`,
      polling: `/api/v1/attempts/${f.attemptId}`, delivery: `/api/v1/deliveries/${deliveryId}`,
      checks: `/api/v1/deliveries/${deliveryId}/checks`, rounds: `/api/v1/attempts/${f.attemptId}/rounds`, dashboard: '/api/v1/operation',
      pagedHistory: `/api/v1/attempts/${f.attemptId}?section=checks&limit=1`,
    };
    const baseline = new Map<string, string>();
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
      const contentIO = observeContentIO(f.directory);
      try {
      // Positive control ensures the instrumentation actually sees named builtin imports.
      await readFile(join(captured.implementation, '.git', 'index')); contentIO.assertInstrumented(); contentIO.clear();
      for (const [name, url] of Object.entries(endpoints)) {
        const elapsed: number[] = []; const payloadBytes: number[] = [];
        // One warm-up per surface, then twenty sequential samples including HTTP serialization.
        for (let sample = -1; sample < 20; sample++) {
          const start = performance.now(); const response = await app.inject({ url, headers }); const duration = performance.now() - start;
          expect(response.statusCode, name).toBe(200);
          let body = response.body;
          if (name === 'dashboard') {
            const dto = response.json<OperationSummary>();
            // Read-time diagnostics have an observation timestamp. Preserve every other field.
            dto.impediments = dto.impediments.map(d => ({ ...d, observedAtMs: 0 })); body = JSON.stringify(dto);
          }
          if (!baseline.has(name)) baseline.set(name, body);
          expect(body, name).toBe(baseline.get(name)); assertNoContent(Buffer.from(body), markers);
          if (sample >= 0) { elapsed.push(duration); payloadBytes.push(Buffer.byteLength(response.body)); }
        }
        elapsed.sort((a, b) => a - b);
        measured.push({ surface: name, samples: elapsed.length, payloadMinBytes: Math.min(...payloadBytes), payloadMaxBytes: Math.max(...payloadBytes),
         medianMs: (elapsed[9]! + elapsed[10]!) / 2, p95Ms: elapsed[18], maxMs: elapsed[19], stablePayloadSha256: sha256(baseline.get(name)!) });
      }
      contentIO.assertNoContentIO();
      } finally { contentIO.restore(); }
      const files = await inventory(f.directory);
      expect(files.filter(file => file.path.startsWith('git/')).every(file => file.path === `git/${f.attemptId}.git/factory-owner`)).toBe(true);
      for (const file of files.filter(p => !p.path.startsWith('work/') && !p.path.startsWith('git/'))) {
        assertNoContent(await readFile(join(f.directory, file.path)), markers);
        expect(file.path === 'factory.sqlite' || file.path === 'factory.sqlite-wal' || file.path === 'factory.sqlite-shm' || file.path.startsWith('artifacts/')).toBe(true);
      }
      stages.push({ generatedCacheBytes: cacheBytes, sizes: sizes(files), measurements: measured, audit: auditDatabase(f.db, markers) });
    }
    // Compare official logical data and individual evidence files, not a zero-growth SQLite SLA.
    expect(stages.map(s => s.audit)).toEqual([stages[0]!.audit, stages[0]!.audit, stages[0]!.audit]);
    for (const stage of stages) {
      expect(stage.sizes.operationalWorkBytes - stages[0]!.sizes.operationalWorkBytes).toBe(stage.generatedCacheBytes);
      expect(stage.sizes.otherAuxiliaryBytes).toBe(0);
    }
    expect(f.db.pragma('data_version', { simple: true })).toBe(versionBefore);
    expect(f.db.prepare('SELECT max(seq) AS seq FROM events').get()).toEqual(eventsBefore);
    expect(captured.calls.length).toBe(callsBefore);
    const approvedDelivery = f.storage.getDelivery(deliveryId).delivery;
    const evidenceBefore = (await inventory(f.directory)).filter(file => file.path.startsWith('artifacts/'));
    expect(stages.map(s => s.sizes.evidenceBytes)).toEqual(Array(3).fill(stages[0]!.sizes.evidenceBytes));
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
    expect(restarted.getArtifact(artifact.id)).toEqual(artifact);
    const afterRestartSizes = sizes(await inventory(f.directory));
    await unlink(join(captured.implementation, '.env'));
    const run: GitReader = async (cwd, args, options) => {
      if (args.includes('ls-tree') && args.at(-1) === approvedDelivery.commitSha) {
        return { exitCode: 0, stdout: [...captured.trees.get(approvedDelivery.contentIdentity!)!].map(([name, hash]) => `100644 blob ${hash}\t${name}\0`).join('') };
      }
      if (args.includes('ls-files')) return { exitCode: 0, stdout: [...new Set([...captured.base.keys(), ...captured.untracked])].map(p => p + '\0').join('') };
      return captured.run(cwd, args, options);
    };
    const recovery = createEnvironmentRecovery(f.directory, run, undefined, async p => p);
    const workspaces = { ...f.workspaces, ...recovery };
    recoveryPipeline = createPipeline({ ...f.dependencies, storage: restarted, workspaces });
    const resource = restarted.getResources(f.attemptId).entries.find(r => r.kind === 'implementation')!;
    const plan = await recoveryPipeline.getRemovalPlan(f.attemptId, resource.id);
    expect(plan.view.capability.available).toBe(true);
    const operation = await recoveryPipeline.removeResource(f.attemptId, resource.id, { confirmed: true, planHash: plan.view.planHash }, { operationId: randomUUID(), expectedRevision: plan.etag });
    await recoveryPipeline.drain(); expect(restarted.getOperation(operation.operationId)?.state).toBe('succeeded');
    expect(restarted.getResources(f.attemptId).entries.find(r => r.id === resource.id)?.removed).toBe(true);
    expect((await inventory(f.directory)).filter(file => file.path.startsWith('artifacts/'))).toEqual(evidenceBefore);
    const afterRemovalSizes = sizes(await inventory(f.directory));
    const eventsAfterRemoval = restartedAudit.prepare('SELECT max(seq) AS seq FROM events').get();
    const verify = createRetainedVerifier(f.directory, captured.run, async p => p);
    await verify(approvedDelivery);
    const diff = await captured.diff(approvedDelivery, {});
    expect(diff.entries.some(entry => entry.patch?.includes('changed tracked bytes'))).toBe(true);
    const reloadedVerification = createVerification({ storage: restarted, workspaces: { materializeCheck }, dataDirectory: f.directory, logFailure: f.logFailure }, { canonicalize: async p => p });
    const evidencePath = join(f.directory, 'artifacts', artifact.pathRelative);
    expect((await reloadedVerification.getArtifact(artifact.id)).bytes.length).toBe(artifact.sizeBytes);
    await writeFile(evidencePath, Buffer.alloc(artifact.sizeBytes, 65));
    await expect(reloadedVerification.getArtifact(artifact.id)).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED' });
    await unlink(evidencePath);
    await expect(reloadedVerification.getArtifact(artifact.id)).rejects.toMatchObject({ code: 'ARTIFACT_MISSING' });
    const unavailable: GitReader = async (cwd, args, options) => args.includes('fsck') ? { exitCode: 1, stdout: '' } : captured.run(cwd, args, options);
    await expect(createRetainedVerifier(f.directory, unavailable, async p => p)(approvedDelivery)).rejects.toMatchObject({ code: 'DELIVERY_GIT_UNAVAILABLE' });
    expect(restarted.getDelivery(deliveryId).delivery).toEqual(approvedDelivery);
    auditDatabase(restartedAudit, markers);
    console.log('AC29_REPORT ' + JSON.stringify({ formatVersion: 1, level: 'real_sqlite_filesystem_http_inject_controlled_git_executor_runner_canonicalization',
      node: process.version, schemaVersion: restarted.getDiagnostics().schemaVersion, stages, controlledObjectBytes,
      identity: { attemptId: f.attemptId, deliveryId, gitRef: approvedDelivery.gitRef, tree: approvedDelivery.contentIdentity, base: approvedDelivery.baseSha },
      afterRestartSizes, afterRemovalSizes, metadataChanges: { eventsBefore, eventsAfterRemoval, cause: 'Explicit removal operation, durable receipt and resource state, plus controller close/reopen; outside the read-only cache comparison.' },
      recovery: { controller: 'in_process_close_reopen', approvedRefTreeBasePreserved: true, eligibleRemoval: true, diffAfterRemoval: true,
        artifactMissing: 'ARTIFACT_MISSING', artifactCorrupt: 'ARTIFACT_INTEGRITY_FAILED', unavailableGitObject: 'DELIVERY_GIT_UNAVAILABLE', physicalProcesses: 'not_started_in_cache_measurement', realGit: 'controlled_in_memory' },
      interpretation: 'No latency SLA. SQLite/WAL may change with legitimate events/checkpoints; stable read phase verified by data_version and event sequence. Git disk is only fixture ownership, object bytes are controlled in-memory blobs.' }));
  } finally {
    await app?.close(); await recoveryPipeline?.close(); restarted?.close(); restartedAudit?.close(); await f.close();
  }
}, 30_000);
