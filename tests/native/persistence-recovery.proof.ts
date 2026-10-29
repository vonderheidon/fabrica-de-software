import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Delivery, DeliveryDiff } from '#contracts';
import type { Storage } from '../../apps/controller/src/modules/storage/index.js';
import type { Pipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { publicationFixture } from '../fixtures/publication.js';
import { retainedGitObjects, writeRetainedGit } from '../fixtures/retained-git.js';
import { assertNoContent, auditDatabase, inventory, sha256, sizes } from '../fixtures/persistence-measurement.js';
import { persistenceReferenceSnapshot } from './persistence-references.mjs';

interface Snapshot {
  pid: number; delivery: Delivery; review: ReturnType<Storage['getReview']>; producerResult: ReturnType<Storage['getProducerResult']>;
  resources: ReturnType<Storage['getResources']>; httpStatus: number; httpPayloadSha256: string; gitCommands: string[];
  persistenceReferences: ReturnType<typeof persistenceReferenceSnapshot>;
  databaseIntegrity: { integrityCheck: string; foreignKeyViolations: unknown[]; schemaVersion: number; retiredTables: string[] };
}
interface ControllerReady { ready: true; pid: number; readyAtMs: number; canonicalization: string; schemaVersion: number;
  integrityCheck: string; foreignKeyViolations: unknown[]; retiredTables: string[] }
interface Stop { passageId: string; pid: number; exitCode: number | null; signal: NodeJS.Signals | null; closeObservedAtMs: number; receiptRecordedAtMs: number }

function controller(directory: string, attemptId: string, deliveryId: string) {
  const child = fork(new URL('./persistence-controller.mjs', import.meta.url), [directory, attemptId, deliveryId], {
    cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [],
  });
  let sequence = 0; let stderr = ''; let closed = false;
  child.stderr?.on('data', (bytes: Buffer) => { stderr = (stderr + bytes.toString('utf8')).slice(-4000); });
  // No arbitrary child output goes into persisted evidence.
  child.stdout?.resume();
  const exit = new Promise<{ pid: number; exitCode: number | null; signal: NodeJS.Signals | null; closedAtMs: number }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => { closed = true; resolve({ pid: child.pid!, exitCode, signal, closedAtMs: Date.now() }); });
  });
  async function message<T>(id: number | null, send?: () => void): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); child.off('message', onMessage); child.off('close', onClose); child.off('error', onError); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const onClose = () => { cleanup(); reject(new Error(`CONTROLLER_EARLY_EXIT: ${stderr}`)); };
      const onMessage = (value: unknown) => {
        if (!value || typeof value !== 'object' || (id === null ? !('ready' in value) : !('id' in value) || value.id !== id)) return;
        cleanup();
        if ('error' in value) reject(new Error(String(value.error) + ('gitFailure' in value && value.gitFailure ? `: ${JSON.stringify(value.gitFailure)}` : '')));
        else resolve((id === null ? value : 'result' in value ? value.result : undefined) as T);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('CONTROLLER_REPLY_TIMEOUT')); }, 20_000);
      child.on('message', onMessage); child.once('close', onClose); child.once('error', onError); send?.();
    });
  }
  const ready = message<ControllerReady>(null);
  return { child, ready, exit,
    request<T>(action: string) { const id = ++sequence; return message<T>(id, () => child.send({ id, action })); },
    async kill() {
      if (!closed) assert(child.kill('SIGKILL'));
      return await Promise.race([exit, new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('CONTROLLER_STOP_TIMEOUT')), 5000); timer.unref();
      })]);
    },
  };
}

it('initializes clean storage and preserves the multi-round reference graph across physical controller restarts', async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  const objects = retainedGitObjects();
  const f = await publicationFixture(false, 'icr', true, { temporaryRoot: join(process.cwd(), '.cache'), baseSha: objects.baseSha, recordCleanInitialization: true });
  const controllers: ReturnType<typeof controller>[] = [];
  const markers = [objects.approvedBytes, 'RECOVERY_IGNORED_CACHE_BYTES', 'diff --git'];
  try {
    expect(f.cleanInitialization).toMatchObject({ schemaVersion: 54, integrityCheck: 'ok', foreignKeyViolations: [],
      counts: { accounts: 0, profiles: 0, projects: 0, preparations: 0, attempts: 0 }, accountId: null,
      directoryCreatedExclusive: true, openedByNormalStoragePath: true });
    const binding = f.persistence.getPassage({ passageId: f.status().passageId }).binding;
    const firstDeliveryId = binding.deliveryVersion;
    const git = await writeRetainedGit(f.directory, f.attemptId, firstDeliveryId);
    f.workspaces.captureDelivery.mockImplementation(async input => {
      const gitRef = `refs/factory/deliveries/${input.deliveryId}`;
      if (input.deliveryId !== firstDeliveryId) {
        await writeFile(join(f.directory, 'git', `${f.attemptId}.git`, ...gitRef.split('/')), `${git.commitSha}\n`, { flag: 'wx' });
      }
      return { gitRef, contentIdentity: git.contentIdentity, commitSha: git.commitSha, hasDelta: true, warnings: [] };
    });
    const firstChecks = [{ id: 'npm.cmd run build', outcome: 'recorded by the controlled producer fixture', evidence: 'Round one producer evidence for the captured version.' }];
    await f.implement(firstChecks);
    await f.approve(false);
    const secondDeliveryId = f.storage.getRounds(f.attemptId).entries.at(-1)!.deliveryId;
    expect(secondDeliveryId).not.toBe(firstDeliveryId);
    const secondChecks = [{ id: 'npm.cmd run build', outcome: 'recorded by the controlled producer fixture', evidence: 'Round two producer evidence for the corrected version.' }];
    await f.implement(secondChecks);
    await f.approve();
    const deliveryId = f.storage.getRounds(f.attemptId).entries.at(-1)!.deliveryId;
    expect(deliveryId).toBe(secondDeliveryId);
    const delivery = f.storage.getDelivery(deliveryId).delivery; const review = f.storage.getReview(deliveryId);
    const producerResult = f.storage.getProducerResult(deliveryId);
    expect(review?.state).toBe('approved');
    expect(producerResult?.result.checks).toEqual(secondChecks);
    expect(delivery).toMatchObject({ baseSha: objects.baseSha, contentIdentity: objects.contentIdentity, commitSha: objects.commitSha });
    expect(f.storage.getRounds(f.attemptId).entries.map(entry => entry.round)).toEqual([1, 2]);
    expect(f.storage.getReview(firstDeliveryId)?.state).toBe('rejected');
    const initialReferences = persistenceReferenceSnapshot(f.db, f.attemptId);
    expect(initialReferences.roundNumbers).toEqual([1, 2]);
    expect(initialReferences.counts).toMatchObject({ profiles: 2, projectRevisions: 2, preparations: 1, preparationRevisions: 1,
      attempts: 1, rounds: 2, passages: 4, deliveries: 2, passageResults: 4, criterionEvidence: 8,
      captureRuns: 2, reviews: 2, findings: 1, findingResolutions: 1, findingAssessments: 1 });
    expect(f.db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
    const expectReferencesPreserved = (snapshot: Snapshot) => {
      expect(snapshot.persistenceReferences.sha256).toBe(initialReferences.sha256);
      expect({ ...snapshot.persistenceReferences.counts, operationReceipts: initialReferences.counts.operationReceipts })
        .toEqual(initialReferences.counts);
      const operationRows = new Map(snapshot.persistenceReferences.operationReceipts.map(row => [String(row.operation_id), row] as const));
      for (const receipt of initialReferences.operationReceipts) expect(operationRows.get(String(receipt.operation_id))).toEqual(receipt);
    };
    await f.pipeline.close(); f.storage.close(); f.db.close();
    // No original storage/fixture connections remain when a controller boots.
    const start = () => { const current = controller(f.directory, f.attemptId, deliveryId); controllers.push(current); return current; };
    const first = start(); const firstReady = await first.ready;
    expect(firstReady).toMatchObject({ schemaVersion: 54, integrityCheck: 'ok', foreignKeyViolations: [], retiredTables: [] });
    const before = await first.request<Snapshot>('snapshot');
    expect(before.delivery).toEqual(delivery); expect(before.review).toEqual(review); expect(before.producerResult).toEqual(producerResult);
    expectReferencesPreserved(before);
    expect(before.databaseIntegrity).toMatchObject({ schemaVersion: 54, integrityCheck: 'ok', foreignKeyViolations: [], retiredTables: [] });
    const started = await first.request<{ passageId: string; pid: number }[]>('start-processes');
    expect(started).toHaveLength(2); expect(new Set(started.map(p => p.pid)).size).toBe(2);
    const blockedPlan = await first.request<Awaited<ReturnType<Pipeline['getRemovalPlan']>>>('plan');
    expect(blockedPlan.view.capability).toEqual({ available: false, reason: 'RESOURCE_NOT_STOPPED' });
    const beforeShutdown = sizes(await inventory(f.directory));
    const stops = await first.request<Stop[]>('stop-processes');
    expect(stops.map(p => ({ passageId: p.passageId, pid: p.pid }))).toEqual(started);
    for (const stopped of stops) {
      expect(stopped.exitCode !== null || stopped.signal !== null).toBe(true);
      expect(stopped.receiptRecordedAtMs).toBeGreaterThanOrEqual(stopped.closeObservedAtMs);
      expect(() => process.kill(stopped.pid, 0)).toThrow();
    }
    const afterPhysicalStop = await first.request<Snapshot>('snapshot');
    expect(afterPhysicalStop.resources.cleanup).toBe('complete');
    const firstExit = await first.kill();
    expect(() => process.kill(firstReady.pid, 0)).toThrow();
    // The next child receives only the directory and IDs, never fixture maps or SQL connections.
    const second = start(); const secondReady = await second.ready;
    expect(secondReady).toMatchObject({ schemaVersion: 54, integrityCheck: 'ok', foreignKeyViolations: [], retiredTables: [] });
    expect(secondReady.pid).not.toBe(firstReady.pid);
    expect(secondReady.readyAtMs).toBeGreaterThanOrEqual(firstExit.closedAtMs);
    const restarted = await second.request<Snapshot>('snapshot');
    expect(restarted.delivery).toEqual(delivery); expect(restarted.review).toEqual(review); expect(restarted.producerResult).toEqual(producerResult);
    expectReferencesPreserved(restarted);
    expect(restarted.databaseIntegrity).toMatchObject({ schemaVersion: 54, integrityCheck: 'ok', foreignKeyViolations: [], retiredTables: [] });
    const afterRestart = sizes(await inventory(f.directory));
    const removed = await second.request<{ operation: ReturnType<Storage['getOperation']>; resources: ReturnType<Storage['getResources']> }>('remove');
    expect(removed.operation?.state).toBe('succeeded');
    expect(removed.resources.entries.find(r => r.kind === 'implementation')?.removed).toBe(true);
    await expect(stat(git.implementation)).rejects.toMatchObject({ code: 'ENOENT' });
    const afterRemoval = sizes(await inventory(f.directory));
    expect(afterRemoval.operationalWorkBytes).toBe(0);
    expect((await inventory(f.directory)).some(file => file.path.startsWith('artifacts/'))).toBe(false);
    const secondExit = await second.kill();
    const third = start(); const thirdReady = await third.ready;
    expect(thirdReady).toMatchObject({ schemaVersion: 54, integrityCheck: 'ok', foreignKeyViolations: [], retiredTables: [] });
    expect(new Set([firstReady.pid, secondReady.pid, thirdReady.pid]).size).toBe(3);
    expect(thirdReady.readyAtMs).toBeGreaterThanOrEqual(secondExit.closedAtMs);
    const recovered = await third.request<Snapshot>('snapshot');
    expect(recovered.delivery).toEqual(delivery); expect(recovered.review).toEqual(review); expect(recovered.producerResult).toEqual(producerResult);
    expectReferencesPreserved(recovered);
    expect(recovered.databaseIntegrity).toMatchObject({ schemaVersion: 54, integrityCheck: 'ok', foreignKeyViolations: [], retiredTables: [] });
    const preservedReceipts = new Map(recovered.persistenceReferences.operationReceipts.map(row => [String(row.operation_id), row] as const));
    for (const receipt of initialReferences.operationReceipts) expect(preservedReceipts.get(String(receipt.operation_id))).toEqual(receipt);
    expect(recovered.resources.entries.find(r => r.kind === 'implementation')?.removed).toBe(true);
    const diff = await third.request<DeliveryDiff>('diff');
    expect(diff).toMatchObject({ baseSha: delivery.baseSha, contentIdentity: delivery.contentIdentity });
    expect(diff.entries.find(entry => entry.path === 'tracked.txt')?.patch).toContain(objects.approvedBytes.trim());
    const producerHttp = await third.request<{ statusCode: number; producerResult: { binding: { delivery_version: string }; result: { checks: unknown[] } } }>('producer-result');
    expect(producerHttp).toMatchObject({ statusCode: 200, producerResult: { binding: { delivery_version: deliveryId }, result: { checks: secondChecks } } });
    const afterDiff = await third.request<Snapshot>('snapshot');
    const afterFinalRestart = sizes(await inventory(f.directory));
    // Remove an actually necessary loose blob, not a mocked Git error or an empty result.
    await unlink(git.approvedObjectPath);
    await expect(third.request('diff')).rejects.toThrow('DELIVERY_GIT_UNAVAILABLE');
    expect(await third.request('stored-state')).toEqual({ delivery, review, producerResult });
    const thirdExit = await third.kill();
    const audit = new Database(join(f.directory, 'factory.sqlite'), { readonly: true });
    let databaseAudit;
    try {
      databaseAudit = auditDatabase(audit, markers);
    } finally { audit.close(); }
    for (const file of (await inventory(f.directory)).filter(file => !file.path.startsWith('work/') && !file.path.startsWith('git/'))) {
      assertNoContent(await readFile(join(f.directory, file.path)), markers);
      expect(/^factory\.sqlite(?:-wal|-shm)?$|^controller-lock\.sqlite(?:-journal)?$/.test(file.path)).toBe(true);
    }
    expect(f.logFailure).not.toHaveBeenCalled();
    console.log('AC29_RECOVERY_REPORT ' + JSON.stringify({ formatVersion: 1,
      level: 'compiled_controller_http_inject_real_sqlite_git_cli_filesystem_physical_processes',
      controller: 'distinct_processes_after_SIGKILL', controllerPids: [firstReady.pid, secondReady.pid, thirdReady.pid],
      controllerStarts: [firstReady, secondReady, thirdReady],
      controllerExits: [firstExit, secondExit, thirdExit], physicalProcesses: { started, stops, allExitsObserved: true },
      identity: { attemptId: f.attemptId, deliveryId, gitRef: delivery.gitRef, commit: delivery.commitSha, tree: delivery.contentIdentity, base: delivery.baseSha },
       beforeShutdown, afterRestart, afterRemoval, afterFinalRestart, databaseAudit,
      persistence: { cleanInitialization: f.cleanInitialization,
        referenceSnapshots: [before, restarted, recovered].map(snapshot => ({ sha256: snapshot.persistenceReferences.sha256,
          counts: snapshot.persistenceReferences.counts, roundNumbers: snapshot.persistenceReferences.roundNumbers,
          deliveryIds: snapshot.persistenceReferences.deliveryIds, producerPassageIds: snapshot.persistenceReferences.producerPassageIds,
          passageResultReceiptIds: snapshot.persistenceReferences.passageResultReceiptIds,
          operationReceiptIds: snapshot.persistenceReferences.operationReceiptIds })),
        integrityChecks: [firstReady, secondReady, thirdReady].map(startup => ({ schemaVersion: startup.schemaVersion,
          integrityCheck: startup.integrityCheck, foreignKeyViolations: startup.foreignKeyViolations.length, retiredTables: startup.retiredTables })) },
      recovery: { approvedRefTreeBasePreserved: true, eligibleRemoval: true, diffAfterRemovalAndRestart: true,
         producerCheckCount: producerResult?.result.checks.length ?? 0, producerChecksSha256: sha256(JSON.stringify(producerResult?.result.checks ?? [])),
         unavailableGitObject: 'DELIVERY_GIT_UNAVAILABLE' },
      gitCommands: afterDiff.gitCommands, canonicalization: [firstReady, secondReady, thirdReady].map(r => r.canonicalization),
      metadataChanges: 'Stop/cancellation receipts, controller sessions, removal receipt/resource state and SQLite checkpoints; controller-lock.sqlite is an operational auxiliary.',
       limitations: ['Approval/results and capture fixture are controlled; producer validation records are structured result data, and Git objects are valid loose objects written by the fixture.',
        'Only read-only Git CLI operations on the exclusive fixture; no canonical Git changes, keyring attestation, native Maestri/OMP/provider or publication.',
        'HTTP uses production routes via inject in child controllers, not a network listener.'] }));
  } finally {
    for (const current of controllers) {
      // Disconnect lets the owner stop any remaining probe by its handle after a failed assertion.
      if (current.child.connected) current.child.disconnect();
      if (current.child.exitCode === null && current.child.signalCode === null) {
        await Promise.race([current.exit, new Promise(resolve => setTimeout(resolve, 1000))]);
        if (current.child.exitCode === null && current.child.signalCode === null) await current.kill();
      }
    }
    await f.close();
  }
}, 90_000);
