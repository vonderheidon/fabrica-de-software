import { realpath, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery, OperationId } from '#contracts';
import type { GitReader } from './git.js';
import type { AttemptRootResolver } from './project-storage.js';
import { CaptureError, captureLimits, gitPath, managedRoot, metadataBytes, noBorrowedObjects, nul, plainDirectory, verifyRetained } from './capture.js';

/** Verify the reviewed bytes, including files hidden by assume-unchanged/skip-worktree.
 * Ignored generated caches are excluded; retained tracked files are always read.
 */
export function createReviewValidator(dataDirectory?: string, git?: GitReader, canonicalize: (p: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  return async (delivery: Delivery, reviewId: string): Promise<boolean> => {
    if (!Value.Check(Delivery, delivery) || !Value.Check(OperationId, reviewId) || delivery.captureState !== 'captured') throw new CaptureError('DELIVERY_NOT_CAPTURED');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    try {
      const data = await managedRoot(resolveAttemptRoot ? await resolveAttemptRoot(delivery.attemptId) : dataDirectory, canonicalize);
      let checkout = data;
      for (const part of ['work', delivery.attemptId, 'reviews', reviewId, 'checkout']) {
        checkout = resolve(checkout, part); await plainDirectory(checkout, canonicalize);
      }
      const metadata = resolve(checkout, '.git'); await plainDirectory(metadata, canonicalize); await noBorrowedObjects(metadata);
      const repository = resolve(data, 'git', `${delivery.attemptId}.git`);
      await plainDirectory(repository, canonicalize); await noBorrowedObjects(repository);
      const retained = async (args: string[]) => {
        const r = await git(repository, [`--git-dir=${repository}`, '-c', 'core.bare=true', ...args]);
        if (r.exitCode !== 0) throw new CaptureError('DELIVERY_GIT_UNAVAILABLE'); return r.stdout;
      };
      await verifyRetained(retained, delivery);
      const args = [`--git-dir=${metadata}`, `--work-tree=${checkout}`, '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile='];
      const read = async (command: string[], input?: Buffer) => {
        const r = await git(checkout, [...args, ...command], input ? { input } : undefined);
        if (r.exitCode !== 0) throw new CaptureError('REVIEW_INTEGRITY_UNAVAILABLE'); return r.stdout;
      };
      const entries = nul(await retained(['ls-tree', '-r', '-z', delivery.commitSha!]));
      if (entries.length > captureLimits.files) throw new CaptureError('CAPTURE_FILE_LIMIT');
      // The reviewer cannot disable mode verification by editing core.filemode.
      const fileMode = process.platform !== 'win32';
      let total = 0;
      const observed: { path: string; stat: Awaited<ReturnType<typeof lstat>> }[] = [];
      const stable = async () => (await read(['rev-parse', '--verify', 'HEAD'])).trim() === delivery.commitSha &&
        (await read(['status', '--porcelain=v2', '-z', '--untracked-files=all'])) === '';
      if (!await stable()) return false;
      for (const entry of entries) {
        const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(entry);
        if (!match || !gitPath(match[3]!)) throw new CaptureError('REVIEW_TREE_UNSUPPORTED');
        const parts = match[3]!.split('/'); let parent = checkout;
        for (const part of parts.slice(0, -1)) {
          parent = resolve(parent, part);
          try { await plainDirectory(parent, canonicalize); }
          catch (error) {
            if (error instanceof CaptureError || (error instanceof Error && 'code' in error && error.code === 'ENOENT')) return false;
            throw error;
          }
        }
        const path = resolve(parent, parts.at(-1)!);
        let bytes: Buffer;
        try {
          const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) return false;
          observed.push({ path, stat }); bytes = await metadataBytes(path, captureLimits.fileBytes);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
          throw error;
        }
        total += bytes.length;
        if (total > captureLimits.totalBytes) throw new CaptureError('CAPTURE_CONTENT_LIMIT');
        if ((await read(['hash-object', '--stdin'], bytes)).trim() !== match[2]) return false;
        if (fileMode && (((await lstat(path)).mode & 0o111) !== 0) !== (match[1] === '100755')) return false;
      }
      for (const item of observed) {
        let after;
        try { after = await lstat(item.path); } catch { return false; }
        if (!after.isFile() || after.isSymbolicLink() || ['ino', 'dev', 'size', 'mtimeMs', 'ctimeMs', 'mode'].some(k => after[k as keyof typeof after] !== item.stat[k as keyof typeof item.stat])) return false;
      }
      await verifyRetained(retained, delivery);
      return await stable();
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError('REVIEW_INTEGRITY_UNAVAILABLE');
    }
  };
}
