import { realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery, OperationId } from '#contracts';
import type { GitReader } from './git.js';
import { CaptureError, createCapturer, ensureDirectory, managedRoot, metadataBytes, noBorrowedObjects, plainDirectory, verifyRetained } from './capture.js';
import type { AttemptRootResolver } from './project-storage.js';

/** Checks and review borrow the one owned checkout only after the pipeline stops its prior role. */
export function createAttemptMaterializer(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  const validate = createCapturer(dataDirectory, git, canonicalize, resolveAttemptRoot);
  return async (delivery: Delivery, operationId: string): Promise<string> => {
    if (!Value.Check(Delivery, delivery) || !Value.Check(OperationId, operationId)) throw new CaptureError('DELIVERY_NOT_CAPTURED');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    await validate({ attemptId: delivery.attemptId, passageId: delivery.producerPassageId, deliveryId: delivery.id, baseSha: delivery.baseSha, declaredFiles: [] }, delivery);
    const data = await managedRoot(resolveAttemptRoot ? await resolveAttemptRoot(delivery.attemptId) : dataDirectory, canonicalize);
    return resolve(data, 'work', delivery.attemptId, 'implementation');
  };
}

/** One private operational Git checkout per check. No bytes are read from implementation. */
export function createCheckMaterializer(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  purpose: 'checks' | 'reviews' | 'publication' = 'checks', resolveAttemptRoot?: AttemptRootResolver) {
  return async (delivery: Delivery, checkId: string): Promise<string> => {
    if (!Value.Check(Delivery, delivery) || !Value.Check(OperationId, checkId) || delivery.captureState !== 'captured') throw new CaptureError('DELIVERY_NOT_CAPTURED');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    try {
      const data = await managedRoot(resolveAttemptRoot ? await resolveAttemptRoot(delivery.attemptId) : dataDirectory, canonicalize);
      const repositories = resolve(data, 'git'); const repository = resolve(repositories, `${delivery.attemptId}.git`);
      for (const path of [repositories, repository]) await plainDirectory(path, canonicalize);
      await noBorrowedObjects(repository);
      if ((await metadataBytes(resolve(repository, 'factory-owner'), 36)).toString('utf8') !== delivery.attemptId) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
      const run = async (args: string[]) => {
        const reply = await git(repository, [`--git-dir=${repository}`, '-c', 'core.bare=true', ...args], { isolatedConfig: true });
        if (reply.exitCode !== 0) throw new CaptureError('DELIVERY_GIT_UNAVAILABLE');
        return reply.stdout;
      };
      await verifyRetained(run, delivery);
      let parent = data;
      for (const part of ['work', delivery.attemptId, purpose]) {
        parent = resolve(parent, part); await ensureDirectory(parent); await plainDirectory(parent, canonicalize);
      }
      // Reserve exclusively; partial/preexisting checkouts are never adopted or reset.
      const resource = resolve(parent, checkId); await mkdir(resource); await plainDirectory(resource, canonicalize);
      const hooks = resolve(resource, 'hooks'); await mkdir(hooks);
      const checkout = resolve(resource, 'checkout');
      const cloned = await git(resource, ['-c', `core.hooksPath=${hooks}`, '-c', 'init.templateDir=', 'clone', '--no-local', '--no-hardlinks', '--no-checkout', '--no-recurse-submodules', '--', repository, checkout], { isolatedConfig: true });
      if (cloned.exitCode !== 0) throw new CaptureError('CHECK_MATERIALIZATION_FAILED');
      await plainDirectory(checkout, canonicalize); await plainDirectory(resolve(checkout, '.git'), canonicalize);
      await noBorrowedObjects(resolve(checkout, '.git'));
      const args = [`--git-dir=${resolve(checkout, '.git')}`, `--work-tree=${checkout}`, '-c', `core.hooksPath=${hooks}`, '-c', 'core.attributesFile=', '-c', 'core.autocrlf=false', '-c', 'core.symlinks=false'];
      // clone normally fetches branch heads, not the private refs/factory namespace.
      // Fetch the exact retained ref explicitly, without updating any source ref.
      const fetched = await git(checkout, [...args, 'fetch', '--no-tags', '--no-recurse-submodules', '--', repository, delivery.gitRef!]);
      if (fetched.exitCode !== 0) throw new CaptureError('CHECK_MATERIALIZATION_FAILED');
      const fetchedIdentity = await git(checkout, [...args, 'rev-parse', '--verify', 'FETCH_HEAD']);
      if (fetchedIdentity.exitCode !== 0 || fetchedIdentity.stdout.trim() !== delivery.commitSha) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
      const result = await git(checkout, [...args, 'checkout', '--detach', delivery.commitSha!, '--']);
      if (result.exitCode !== 0) throw new CaptureError('CHECK_MATERIALIZATION_FAILED');
      if (purpose === 'reviews') {
        const info = resolve(checkout, '.git', 'info');
        await ensureDirectory(info); await plainDirectory(info, canonicalize);
        await writeFile(resolve(info, 'exclude'), '\n/.factory-evidence/\n', { flag: 'a' });
      }
      const identity = await git(checkout, [...args, 'rev-parse', '--verify', 'HEAD^{tree}']);
      const status = await git(checkout, [...args, 'status', '--porcelain=v2', '-z', '--untracked-files=all']);
      if (identity.exitCode !== 0 || identity.stdout.trim() !== delivery.contentIdentity || status.exitCode !== 0 || status.stdout !== '') throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
      await verifyRetained(run, delivery);
      return checkout;
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError('CHECK_MATERIALIZATION_FAILED');
    }
  };
}
