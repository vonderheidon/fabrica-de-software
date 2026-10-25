import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Delivery, DeliveryDiff } from '#contracts';
import type { Storage } from '../../apps/controller/src/modules/storage/index.js';
import type { Pipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { createVerification } from '../../apps/controller/src/modules/verification/index.js';
import { publicationFixture } from '../fixtures/publication.js';
import { retainedGitObjects, writeRetainedGit } from '../fixtures/retained-git.js';
import { assertNoContent, auditDatabase, inventory, sha256, sizes } from '../fixtures/persistence-measurement.js';

interface Snapshot {
  pid: number; delivery: Delivery; review: ReturnType<Storage['getReview']>; artifact: ReturnType<Storage['getArtifact']>;
  resources: ReturnType<Storage['getResources']>; httpStatus: number; httpPayloadSha256: string; gitCommands: string[];
}
interface Stop { passageId: string; pid: number; exitCode: number | null; signal: NodeJS.Signals | null; closeObservedAtMs: number; receiptRecordedAtMs: number }

function controller(directory: string, attemptId: string, deliveryId: string, artifactId: string) {
  const child = fork(new URL('./persistence-controller.mjs', import.meta.url), [directory, attemptId, deliveryId, artifactId], {
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
  const ready = message<{ ready: true; pid: number; readyAtMs: number; canonicalization: string }>(null);
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

it('recovers approved ref/tree/base from real Git after physical stops, controller crashes and eligible environment removal', async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  const objects = retainedGitObjects();
  const f = await publicationFixture(false, 'icr', true, { temporaryRoot: join(process.cwd(), '.cache'), baseSha: objects.baseSha,
    checks: [{ id: 'recovery-evidence', command: 'controlled evidence producer', cwd_relative: '.' }] });
  const controllers: ReturnType<typeof controller>[] = [];
  const markers = [objects.approvedBytes, 'RECOVERY_IGNORED_CACHE_BYTES', 'diff --git'];
  try {
    const binding = f.persistence.getPassage({ passageId: f.status().passageId }).binding;
    const git = await writeRetainedGit(f.directory, f.attemptId, binding.deliveryVersion);
    f.workspaces.captureDelivery.mockResolvedValue({ gitRef: git.gitRef, contentIdentity: git.contentIdentity, commitSha: git.commitSha, hasDelta: true, warnings: [] });
    const verification = createVerification({ storage: f.storage, workspaces: { materializeCheck: async () => git.implementation }, dataDirectory: f.directory, logFailure: f.logFailure }, {
      canonicalize: async path => path,
      runner: async () => ({ state: 'passed', exitCode: 0, diagnostic: null, endedAtMs: Date.now(), durationMs: 1, output: Buffer.from('Pertinent recovery evidence\n') }),
    });
    f.verification.verifyDelivery.mockImplementation(id => verification.verifyDelivery(id, new AbortController().signal));
    f.verification.getArtifact.mockImplementation(id => verification.getArtifact(id));
    await f.implement(); await f.approve();
    const deliveryId = f.status().deliveryId!;
    const delivery = f.storage.getDelivery(deliveryId).delivery; const review = f.storage.getReview(deliveryId);
    expect(review?.state).toBe('approved');
    expect(delivery).toMatchObject({ baseSha: objects.baseSha, contentIdentity: objects.contentIdentity, commitSha: objects.commitSha });
    const artifact = f.storage.getCheckHistory(deliveryId, {}).entries[0]!.artifacts[0]!;
    await f.pipeline.close(); f.storage.close(); f.db.close();
    // No original storage/fixture connections remain when a controller boots.
    const start = () => { const current = controller(f.directory, f.attemptId, deliveryId, artifact.id); controllers.push(current); return current; };
    const first = start(); const firstReady = await first.ready;
    const before = await first.request<Snapshot>('snapshot');
    expect(before.delivery).toEqual(delivery); expect(before.review).toEqual(review);
    const started = await first.request<{ passageId: string; pid: number }[]>('start-processes');
    expect(started).toHaveLength(2); expect(new Set(started.map(p => p.pid)).size).toBe(2);
    const blockedPlan = await first.request<Awaited<ReturnType<Pipeline['getRemovalPlan']>>>('plan');
    expect(blockedPlan.view.capability).toEqual({ available: false, reason: 'RESOURCE_NOT_STOPPED' });
    const beforeShutdown = sizes(await inventory(f.directory));
    const evidenceBefore = (await inventory(f.directory)).filter(file => file.path.startsWith('artifacts/'));
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
    expect(secondReady.pid).not.toBe(firstReady.pid);
    expect(secondReady.readyAtMs).toBeGreaterThanOrEqual(firstExit.closedAtMs);
    const restarted = await second.request<Snapshot>('snapshot');
    expect(restarted.delivery).toEqual(delivery); expect(restarted.review).toEqual(review); expect(restarted.artifact).toEqual(artifact);
    const afterRestart = sizes(await inventory(f.directory));
    const removed = await second.request<{ operation: ReturnType<Storage['getOperation']>; resources: ReturnType<Storage['getResources']> }>('remove');
    expect(removed.operation?.state).toBe('succeeded');
    expect(removed.resources.entries.find(r => r.kind === 'implementation')?.removed).toBe(true);
    await expect(stat(git.implementation)).rejects.toMatchObject({ code: 'ENOENT' });
    const afterRemoval = sizes(await inventory(f.directory));
    expect(afterRemoval.operationalWorkBytes).toBe(0);
    expect((await inventory(f.directory)).filter(file => file.path.startsWith('artifacts/'))).toEqual(evidenceBefore);
    const secondExit = await second.kill();
    const third = start(); const thirdReady = await third.ready;
    expect(new Set([firstReady.pid, secondReady.pid, thirdReady.pid]).size).toBe(3);
    expect(thirdReady.readyAtMs).toBeGreaterThanOrEqual(secondExit.closedAtMs);
    const recovered = await third.request<Snapshot>('snapshot');
    expect(recovered.delivery).toEqual(delivery); expect(recovered.review).toEqual(review); expect(recovered.artifact).toEqual(artifact);
    expect(recovered.resources.entries.find(r => r.kind === 'implementation')?.removed).toBe(true);
    const diff = await third.request<DeliveryDiff>('diff');
    expect(diff).toMatchObject({ baseSha: delivery.baseSha, contentIdentity: delivery.contentIdentity });
    expect(diff.entries.find(entry => entry.path === 'tracked.txt')?.patch).toContain(objects.approvedBytes.trim());
    expect(await third.request('artifact')).toEqual({ sha256: artifact.sha256, sizeBytes: artifact.sizeBytes });
    const afterDiff = await third.request<Snapshot>('snapshot');
    const afterFinalRestart = sizes(await inventory(f.directory));
    const evidencePath = join(f.directory, 'artifacts', artifact.pathRelative);
    await writeFile(evidencePath, Buffer.alloc(artifact.sizeBytes, 65));
    await expect(third.request('artifact')).rejects.toThrow('ARTIFACT_INTEGRITY_FAILED');
    await unlink(evidencePath);
    await expect(third.request('artifact')).rejects.toThrow('ARTIFACT_MISSING');
    // Remove an actually necessary loose blob, not a mocked Git error or an empty result.
    await unlink(git.approvedObjectPath);
    await expect(third.request('diff')).rejects.toThrow('DELIVERY_GIT_UNAVAILABLE');
    expect(await third.request('stored-state')).toEqual({ delivery, review, artifact });
    const thirdExit = await third.kill();
    const audit = new Database(join(f.directory, 'factory.sqlite'), { readonly: true });
    let databaseAudit;
    try {
      databaseAudit = auditDatabase(audit, markers);
    } finally { audit.close(); }
    for (const file of (await inventory(f.directory)).filter(file => !file.path.startsWith('work/') && !file.path.startsWith('git/'))) {
      assertNoContent(await readFile(join(f.directory, file.path)), markers);
      expect(/^factory\.sqlite(?:-wal|-shm)?$|^controller-lock\.sqlite(?:-journal)?$|^artifacts\//.test(file.path)).toBe(true);
    }
    expect(f.logFailure).not.toHaveBeenCalled();
    console.log('AC29_RECOVERY_REPORT ' + JSON.stringify({ formatVersion: 1,
      level: 'compiled_controller_http_inject_real_sqlite_git_cli_filesystem_physical_processes',
      controller: 'distinct_processes_after_SIGKILL', controllerPids: [firstReady.pid, secondReady.pid, thirdReady.pid],
      controllerStarts: [firstReady, secondReady, thirdReady],
      controllerExits: [firstExit, secondExit, thirdExit], physicalProcesses: { started, stops, allExitsObserved: true },
      identity: { attemptId: f.attemptId, deliveryId, gitRef: delivery.gitRef, commit: delivery.commitSha, tree: delivery.contentIdentity, base: delivery.baseSha },
      beforeShutdown, afterRestart, afterRemoval, afterFinalRestart, evidenceBefore, databaseAudit,
      recovery: { approvedRefTreeBasePreserved: true, eligibleRemoval: true, diffAfterRemovalAndRestart: true,
        artifactSha256: artifact.sha256, recoveredDiffSha256: sha256(JSON.stringify(diff)),
        artifactMissing: 'ARTIFACT_MISSING', artifactCorrupt: 'ARTIFACT_INTEGRITY_FAILED', unavailableGitObject: 'DELIVERY_GIT_UNAVAILABLE' },
      gitCommands: afterDiff.gitCommands, canonicalization: [firstReady, secondReady, thirdReady].map(r => r.canonicalization),
      metadataChanges: 'Stop/cancellation receipts, controller sessions, removal receipt/resource state and SQLite checkpoints; controller-lock.sqlite is an operational auxiliary.',
      limitations: ['Approval/results, capture fixture and evidence producer are controlled; Git objects are valid loose objects written by the fixture.',
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
