import { realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery } from '#contracts';
import { CaptureError, managedRoot, metadataBytes, noBorrowedObjects, plainDirectory, verifyRetained } from './capture.js';
import type { GitReader } from './git.js';
import { retainedRepositoryOwner, retainedRepositoryPath, requireAttemptRootResolver, type AttemptRootResolver } from './project-storage.js';

/** Validate retained identity and objects without loading patches or the mutable implementation. */
export function createRetainedVerifier(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  return async (delivery: Delivery): Promise<void> => {
    if (!Value.Check(Delivery, delivery) || delivery.captureState !== 'captured') throw new CaptureError('DELIVERY_NOT_CAPTURED');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    try {
      const data = await managedRoot(await requireAttemptRootResolver(resolveAttemptRoot)(delivery.attemptId), canonicalize);
      const repository = retainedRepositoryPath(data, delivery.attemptId, delivery.repositoryRelative);
      await plainDirectory(dirname(repository), canonicalize); await plainDirectory(repository, canonicalize); await noBorrowedObjects(repository);
      if ((await metadataBytes(resolve(repository, 'factory-owner'), 64)).toString('utf8') !== retainedRepositoryOwner(delivery.attemptId, delivery.repositoryRelative)) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
      await verifyRetained(async args => {
        const response = await git(repository, [`--git-dir=${repository}`, '-c', 'core.bare=true', ...args]);
        if (response.exitCode !== 0) throw new CaptureError('DELIVERY_GIT_UNAVAILABLE');
        return response.stdout;
      }, delivery);
    } catch (error) { if (error instanceof CaptureError) throw error; throw new CaptureError('DELIVERY_IO_FAILED'); }
  };
}
