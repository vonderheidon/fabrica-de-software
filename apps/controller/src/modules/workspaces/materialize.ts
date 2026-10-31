import { realpath, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery, OperationId } from '#contracts';
import type { GitReader } from './git.js';
import { CaptureError, createCapturer, ensureDirectory, managedRoot, metadataBytes, noBorrowedObjects, plainDirectory, verifyRetained } from './capture.js';
import { retainedRepositoryOwner, retainedRepositoryPath, requireAttemptAreaResolver, requireAttemptRootResolver, requireAttemptWorkspacePathResolver, type AttemptAreaResolver, type AttemptRootResolver, type AttemptWorkspacePathResolver } from './project-storage.js';

/** Review borrows the one owned checkout only after the pipeline stops its prior role. */
export function createAttemptMaterializer(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver, resolveAttemptWorkspace?: AttemptWorkspacePathResolver) {
  const validate = createCapturer(dataDirectory, git, canonicalize, resolveAttemptRoot, resolveAttemptWorkspace);
  return async (delivery: Delivery, operationId: string): Promise<string> => {
    if (!Value.Check(Delivery, delivery) || !Value.Check(OperationId, operationId)) throw new CaptureError('DELIVERY_NOT_CAPTURED');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    await validate({ attemptId: delivery.attemptId, passageId: delivery.producerPassageId, deliveryId: delivery.id,
      repositoryRelative: delivery.repositoryRelative, baseSha: delivery.baseSha, declaredFiles: [] }, delivery);
    const data = await managedRoot(await requireAttemptRootResolver(resolveAttemptRoot)(delivery.attemptId), canonicalize);
    const checkout = await requireAttemptWorkspacePathResolver(resolveAttemptWorkspace)(delivery.attemptId);
    const repository = retainedRepositoryPath(data, delivery.attemptId, delivery.repositoryRelative);
    const hooks = resolve(repository, 'factory-empty-hooks');
    await plainDirectory(hooks, canonicalize);
    const args = [`--git-dir=${resolve(checkout, '.git')}`, `--work-tree=${checkout}`, '-c', `core.hooksPath=${hooks}`,
      '-c', 'core.fsmonitor=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false'];
    const ref = `refs/factory/review-deliveries/${delivery.id}`;
    const existing = await git(checkout, [...args, 'show-ref', '--verify', '--hash', ref]);
    if (existing.exitCode === 0 && existing.stdout.trim() !== delivery.commitSha) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
    if (existing.exitCode !== 0) {
      if (![1, 128].includes(existing.exitCode)) throw new CaptureError('DELIVERY_GIT_UNAVAILABLE');
      // The retained commit is otherwise absent from the shared checkout used by the Reviewer.
      const fetched = await git(checkout, [...args, '-c', 'protocol.file.allow=always', 'fetch', '--no-tags',
        '--no-write-fetch-head', '--no-recurse-submodules', '--', repository, `${delivery.gitRef}:${ref}`], { isolatedConfig: true });
      if (fetched.exitCode !== 0) throw new CaptureError('DELIVERY_GIT_UNAVAILABLE');
    }
    const imported = await git(checkout, [...args, 'rev-parse', '--verify', ref]);
    if (imported.exitCode !== 0 || imported.stdout.trim() !== delivery.commitSha) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
    await validate({ attemptId: delivery.attemptId, passageId: delivery.producerPassageId, deliveryId: delivery.id,
      repositoryRelative: delivery.repositoryRelative, baseSha: delivery.baseSha, declaredFiles: [] }, delivery);
    return checkout;
  };
}

/** One private operational Git checkout per publication operation. No bytes are read from implementation. */
export function createPublicationMaterializer(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver, resolveAttemptArea?: AttemptAreaResolver) {
  return async (delivery: Delivery, operationId: string): Promise<string> => {
    if (!Value.Check(Delivery, delivery) || !Value.Check(OperationId, operationId) || delivery.captureState !== 'captured') throw new CaptureError('DELIVERY_NOT_CAPTURED');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    try {
      const data = await managedRoot(await requireAttemptRootResolver(resolveAttemptRoot)(delivery.attemptId), canonicalize);
      const repository = retainedRepositoryPath(data, delivery.attemptId, delivery.repositoryRelative); const repositories = dirname(repository);
      for (const path of [repositories, repository]) await plainDirectory(path, canonicalize);
      await noBorrowedObjects(repository);
      if ((await metadataBytes(resolve(repository, 'factory-owner'), 64)).toString('utf8') !== retainedRepositoryOwner(delivery.attemptId, delivery.repositoryRelative)) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
      const run = async (args: string[]) => {
        const reply = await git(repository, [`--git-dir=${repository}`, '-c', 'core.bare=true', ...args], { isolatedConfig: true });
        if (reply.exitCode !== 0) throw new CaptureError('DELIVERY_GIT_UNAVAILABLE');
        return reply.stdout;
      };
      await verifyRetained(run, delivery);
      const parent = await requireAttemptAreaResolver(resolveAttemptArea)(delivery.attemptId, 'publication');
      const parentRelative = relative(data, parent);
      if (!parentRelative || parentRelative === '..' || parentRelative.startsWith(`..${sep}`)) throw new CaptureError('PUBLICATION_GIT_FAILED');
      let current = data;
      for (const part of parentRelative.split(sep)) {
        if (!part || part === '.' || part === '..') throw new CaptureError('PUBLICATION_GIT_FAILED');
        current = resolve(current, part);
        await ensureDirectory(current);
        await plainDirectory(current, canonicalize);
      }
      if (current !== parent) throw new CaptureError('PUBLICATION_GIT_FAILED');
      // Reserve exclusively; partial/preexisting publication checkouts are never adopted or reset.
      const resource = resolve(parent, operationId); await mkdir(resource); await plainDirectory(resource, canonicalize);
      const hooks = resolve(resource, 'hooks'); await mkdir(hooks);
      const checkout = resolve(resource, 'checkout');
      const cloned = await git(resource, ['-c', `core.hooksPath=${hooks}`, '-c', 'init.templateDir=', 'clone', '--no-local', '--no-hardlinks', '--no-checkout', '--no-recurse-submodules', '--', repository, checkout], { isolatedConfig: true });
      if (cloned.exitCode !== 0) throw new CaptureError('PUBLICATION_GIT_FAILED');
      await plainDirectory(checkout, canonicalize); await plainDirectory(resolve(checkout, '.git'), canonicalize);
      await noBorrowedObjects(resolve(checkout, '.git'));
      const args = ['-c', `core.hooksPath=${hooks}`, '-c', 'core.attributesFile=', '-c', 'core.autocrlf=false', '-c', 'core.symlinks=false'];
      // clone normally fetches branch heads, not the private refs/factory namespace.
      // Fetch the exact retained ref explicitly, without updating any source ref.
      const fetched = await git(checkout, [...args, '-c', 'protocol.file.allow=always', 'fetch', '--no-tags', '--no-recurse-submodules', '--', repository, delivery.gitRef!]);
      if (fetched.exitCode !== 0) throw new CaptureError('PUBLICATION_GIT_FAILED');
      const fetchedIdentity = await git(checkout, [...args, 'rev-parse', '--verify', 'FETCH_HEAD']);
      if (fetchedIdentity.exitCode !== 0 || fetchedIdentity.stdout.trim() !== delivery.commitSha) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
      const result = await git(checkout, [...args, 'checkout', '--detach', delivery.commitSha!, '--']);
      if (result.exitCode !== 0) throw new CaptureError('PUBLICATION_GIT_FAILED');
      const identity = await git(checkout, [...args, 'rev-parse', '--verify', 'HEAD^{tree}']);
      const status = await git(checkout, [...args, 'status', '--porcelain=v2', '-z', '--untracked-files=all']);
      if (identity.exitCode !== 0 || identity.stdout.trim() !== delivery.contentIdentity || status.exitCode !== 0 || status.stdout !== '') throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
      await verifyRetained(run, delivery);
      return checkout;
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError('PUBLICATION_GIT_FAILED');
    }
  };
}
