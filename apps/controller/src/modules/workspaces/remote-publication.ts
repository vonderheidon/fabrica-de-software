import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery, EffectView } from '#contracts';
import { CaptureError, managedRoot, metadataBytes, noBorrowedObjects, plainDirectory, verifyRetained } from './capture.js';
import type { GitReader } from './git.js';
import type { LocalCommitResult } from './publication.js';

/** Additional trusted host boundary; never populated from a request or environment. */
export interface PushAuthorization { accountId: string; repositoryIds: readonly string[] }
export function createRemotePublisher(dataDirectory?: string, git?: GitReader, authorization?: PushAuthorization, canonicalize: (path: string) => Promise<string> = realpath) {
  async function context(delivery: Delivery, effect: EffectView) {
    const i = effect.expectedIdentity;
    if (!Value.Check(Delivery,delivery) || !Value.Check(EffectView,effect) || effect.kind !== 'push' || !effect.authorized || !['running','unknown'].includes(effect.state) ||
      effect.attemptId !== delivery.attemptId || effect.deliveryId !== delivery.id || effect.scopeKey !== delivery.id ||
      i.contentIdentity !== delivery.contentIdentity || i.parentSha !== delivery.baseSha || !i.commitSha || !i.commitOperationId ||
       !i.repositoryId || !i.issueNumber || i.branchRef !== `refs/heads/factory/${i.issueNumber}/${delivery.attemptId}` ||
      !i.repositoryOwner || !/^[A-Za-z0-9-]{1,100}$/.test(i.repositoryOwner) || !i.repositoryName || !/^[A-Za-z0-9_.-]{1,100}$/.test(i.repositoryName)) throw new CaptureError('PUSH_IDENTITY_INVALID');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    const root = await managedRoot(dataDirectory,canonicalize); const parent = resolve(root,'git'); const repository = resolve(parent,`${delivery.attemptId}.git`);
    await plainDirectory(parent,canonicalize); await plainDirectory(repository,canonicalize); await noBorrowedObjects(repository);
    if ((await metadataBytes(resolve(repository,'factory-owner'),36)).toString('utf8') !== delivery.attemptId) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
    const local = async (args: string[]) => { const r = await git(repository,[`--git-dir=${repository}`,...args],{ isolatedConfig: true }); if (r.exitCode) throw new CaptureError('PUBLICATION_GIT_FAILED'); return r.stdout; };
    await verifyRetained(local,delivery);
    const message = `feat: deliver issue #${i.issueNumber}\n\nFactory-Attempt: ${delivery.attemptId}\nFactory-Delivery: ${delivery.id}\nFactory-Operation: ${i.commitOperationId}\n`;
    if ((await local(['show','--no-patch','--format=%T%x00%P%x00%B',i.commitSha,'--'])).trimEnd() !== `${delivery.contentIdentity}\0${delivery.baseSha}\0${message}`.trimEnd()) throw new CaptureError('PUSH_IDENTITY_INVALID');
    if ((await local(['rev-parse','--verify',i.branchRef])).trim() !== i.commitSha) throw new CaptureError('PUSH_IDENTITY_INVALID');
    // Keep the host's normal credential helper, but never honor URL rewriting or caller-selected transport commands.
    const config = await git(repository,[`--git-dir=${repository}`,'config','--get-regexp','^(url\\..*\\.(insteadof|pushinsteadof)|core\\.sshcommand|remote\\..*\\.(push|mirror|receivepack)|push\\.pushoption)$']);
    if (config.exitCode !== 1 || config.stdout !== '') throw new CaptureError('PUSH_CONFIGURATION_UNSUPPORTED');
    const remote = `https://github.com/${i.repositoryOwner}/${i.repositoryName}.git`;
    const run = (args: string[]) => git(repository,[`--git-dir=${repository}`,'-c','core.hooksPath='+ (process.platform === 'win32' ? 'NUL' : '/dev/null'),
      '-c','protocol.allow=never','-c','protocol.https.allow=always','-c','push.followTags=false',...args]);
    return { i,remote,run };
  }
  async function inspect(c: Awaited<ReturnType<typeof context>>): Promise<LocalCommitResult> {
    const r = await c.run(['ls-remote','--refs',c.remote,c.i.branchRef!]);
    if (r.exitCode) return { state: 'unknown',receipt: null,reason: 'REMOTE_REF_UNAVAILABLE' };
    const lines = r.stdout.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { state: 'unknown',receipt: null,reason: 'REMOTE_REF_NOT_OBSERVED' };
    if (lines.length !== 1 || lines[0] !== `${c.i.commitSha}\t${c.i.branchRef}`) return { state: 'unknown',receipt: null,reason: 'REMOTE_REF_CONFLICT' };
    return { state: 'confirmed',receipt: { id: c.i.commitSha!,commitSha: c.i.commitSha!,branchRef: c.i.branchRef!,repositoryId: c.i.repositoryId! },reason: null };
  }
  return {
    async reconcilePush(delivery: Delivery,effect: EffectView): Promise<LocalCommitResult> {
      try { return await inspect(await context(delivery,effect)); }
      catch (e) { return { state: 'unknown',receipt: null,reason: e instanceof CaptureError ? e.code : 'PUSH_UNAVAILABLE' }; }
    },
    async pushApproved(delivery: Delivery,effect: EffectView,accountId: string,authorize: () => Promise<void>): Promise<LocalCommitResult> {
      let sent = false;
      try {
        if (!effect.expectedIdentity.repositoryId || !authorization || authorization.accountId !== accountId || !authorization.repositoryIds.includes(effect.expectedIdentity.repositoryId)) return { state: 'failed_known',receipt: null,reason: 'PUSH_NOT_AUTHORIZED' };
        const c = await context(delivery,effect); const prior = await inspect(c);
        if (prior.state === 'confirmed') return prior;
        if (prior.reason !== 'REMOTE_REF_NOT_OBSERVED' || effect.state !== 'running') return { ...prior,state: 'failed_known' };
        await authorize(); sent = true;
        // Exactly one non-forced refspec. No tags, merge, alternate destination or source worktree.
        await c.run(['push','--porcelain','--no-follow-tags','--recurse-submodules=no',c.remote,`${c.i.commitSha}:${c.i.branchRef}`]);
        return await inspect(c);
      } catch (e) { return { state: sent ? 'unknown' : 'failed_known',receipt: null,reason: e instanceof CaptureError ? e.code : 'PUSH_UNAVAILABLE' }; }
    },
  };
}
