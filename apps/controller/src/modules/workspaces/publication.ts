import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery, EffectView, type EffectReceipt } from '#contracts';
import { CaptureError, managedRoot, metadataBytes, noBorrowedObjects, plainDirectory, verifyRetained } from './capture.js';
import { createCheckMaterializer } from './materialize.js';
import type { GitReader } from './git.js';
import type { AttemptRootResolver } from './project-storage.js';

export interface LocalCommitResult {
  state: 'confirmed' | 'not_applicable' | 'failed_known' | 'unknown';
  receipt: EffectReceipt | null;
  reason: string | null;
}

/** Publication uses retained objects only. The removable implementation is never inspected. */
export function createLocalPublisher(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  const isolated: GitReader | undefined = git ? (cwd, args, input) => git(cwd, args, { ...input, isolatedConfig: true }) : undefined;
  const materialize = createCheckMaterializer(dataDirectory, isolated, canonicalize, 'publication', resolveAttemptRoot);
  async function context(delivery: Delivery, effect: EffectView) {
    const identity = effect.expectedIdentity;
    if (!Value.Check(Delivery, delivery) || !Value.Check(EffectView, effect) || effect.kind !== 'local_commit' ||
      !effect.authorized || !['running','unknown'].includes(effect.state) || effect.attemptId !== delivery.attemptId || effect.deliveryId !== delivery.id || effect.scopeKey !== delivery.id ||
      delivery.captureState !== 'captured' || identity.contentIdentity !== delivery.contentIdentity || identity.parentSha !== delivery.baseSha ||
      !identity.issueNumber || !identity.commitTime || identity.branchRef !== `refs/heads/factory/${identity.issueNumber}/${delivery.attemptId}`) throw new CaptureError('COMMIT_IDENTITY_INVALID');
    if (!dataDirectory || !isolated) throw new CaptureError('CONTEXT_UNAVAILABLE');
    const data = await managedRoot(resolveAttemptRoot ? await resolveAttemptRoot(delivery.attemptId) : dataDirectory, canonicalize);
    const root = resolve(data, 'git'); const repository = resolve(root, `${delivery.attemptId}.git`);
    await plainDirectory(root, canonicalize); await plainDirectory(repository, canonicalize); await noBorrowedObjects(repository);
    if ((await metadataBytes(resolve(repository, 'factory-owner'), 36)).toString('utf8') !== delivery.attemptId) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
    const raw = (args: string[], input?: string) => isolated(repository, [`--git-dir=${repository}`, '-c', 'core.bare=true', '-c', 'core.fsync=committed', ...args], { ...(input === undefined ? {} : { input }), ...(args.includes('commit-tree') ? { commitTime: identity.commitTime! } : {}) });
    const run = async (args: string[], input?: string) => {
      const result = await raw(args, input);
      if (result.exitCode !== 0) throw new CaptureError('PUBLICATION_GIT_FAILED');
      return result.stdout;
    };
    await verifyRetained(run, delivery);
    const baseTree = (await run(['rev-parse', '--verify', `${delivery.baseSha}^{tree}`])).trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baseTree) || (baseTree !== delivery.contentIdentity) !== delivery.hasDelta) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
    const message = `feat: deliver issue #${identity.issueNumber}\n\nFactory-Attempt: ${delivery.attemptId}\nFactory-Delivery: ${delivery.id}\nFactory-Operation: ${effect.operationId}\n`;
    return { identity, run, raw, message, noDelta: baseTree === delivery.contentIdentity };
  }
  async function inspect(delivery: Delivery, effect: EffectView): Promise<LocalCommitResult> {
    const { identity, run, message, noDelta } = await context(delivery, effect);
    if (noDelta) return { state: 'not_applicable', receipt: null, reason: 'APPROVED_NO_DELTA' };
    const ref = (await run(['for-each-ref', '--format=%(refname)%00%(objectname)%00%(symref)', identity.branchRef!])).replace(/\r?\n$/, '');
    if (ref === '') return { state: 'unknown', receipt: null, reason: 'COMMIT_NOT_OBSERVED' };
    const parts = ref.split('\0'); const sha = parts[1];
    if (parts.length !== 3 || parts[0] !== identity.branchRef || parts[2] !== '' || !sha || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new CaptureError('COMMIT_IDENTITY_CONFLICT');
    const actual = await run(['show', '--no-patch', '--format=%T%x00%P%x00%B', sha, '--']);
    if (actual.trimEnd() !== `${delivery.contentIdentity}\0${delivery.baseSha}\0${message}`.trimEnd()) throw new CaptureError('COMMIT_IDENTITY_CONFLICT');
    await run(['fsck', '--full', '--strict', '--no-dangling', sha]);
    return { state: 'confirmed', receipt: { id: sha, contentIdentity: delivery.contentIdentity!, parentSha: delivery.baseSha, branchRef: identity.branchRef!, operationId: effect.operationId }, reason: null };
  }
  return {
    materializePublication: materialize,
    async reconcileLocalCommit(delivery: Delivery, effect: EffectView): Promise<LocalCommitResult> {
      try { return await inspect(delivery, effect); }
      catch (error) { return { state: 'unknown', receipt: null, reason: error instanceof CaptureError ? error.code : 'PUBLICATION_GIT_UNAVAILABLE' }; }
    },
    async createLocalCommit(delivery: Delivery, effect: EffectView, authorize: () => Promise<void>): Promise<LocalCommitResult> {
      let mutationStarted = false;
      try {
        const c = await context(delivery, effect);
        const observed = await inspect(delivery, effect);
        if (observed.state !== 'unknown') return observed;
        if (effect.state !== 'running') return observed;
        // One exclusively reserved checkout identifies partial materialization. Never adopt/reset a partial checkout.
        await materialize(delivery, effect.operationId);
        await verifyRetained(c.run, delivery);
        await authorize();
        mutationStarted = true;
        const sha = (await c.run(['-c', 'user.name=Factory', '-c', 'user.email=factory@localhost',
          'commit-tree', delivery.contentIdentity!, '-p', delivery.baseSha], c.message)).trim();
        // Dates are supplied through the Git port, rather than trusting user configuration.
        // The operation marker and create-only branch are also checked during reconciliation.
        if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new CaptureError('COMMIT_IDENTITY_INVALID');
        await c.run(['update-ref', '--no-deref', c.identity.branchRef!, sha, '0'.repeat(sha.length)]);
        return await inspect(delivery, effect);
      } catch (error) {
        return { state: mutationStarted ? 'unknown' : 'failed_known', receipt: null, reason: error instanceof CaptureError ? error.code : 'PUBLICATION_GIT_UNAVAILABLE' };
      }
    },
  };
}
