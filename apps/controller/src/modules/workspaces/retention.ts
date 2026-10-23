import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery } from '#contracts';
import { CaptureError, managedRoot, metadataBytes, noBorrowedObjects, plainDirectory, verifyRetained } from './capture.js';
import type { GitReader } from './git.js';
import type { AttemptRootResolver } from './project-storage.js';

/** Validate retained identity and objects without loading patches or the mutable implementation. */
export function createRetainedVerifier(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  return async (delivery: Delivery): Promise<void> => {
    if (!Value.Check(Delivery, delivery) || delivery.captureState !== 'captured') throw new CaptureError('DELIVERY_NOT_CAPTURED');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    try {
      const data = await managedRoot(resolveAttemptRoot ? await resolveAttemptRoot(delivery.attemptId) : dataDirectory, canonicalize); const root = resolve(data, 'git'); const repository = resolve(root, `${delivery.attemptId}.git`);
      await plainDirectory(root, canonicalize); await plainDirectory(repository, canonicalize); await noBorrowedObjects(repository);
      if ((await metadataBytes(resolve(repository, 'factory-owner'), 36)).toString('utf8') !== delivery.attemptId) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
      await verifyRetained(async args => {
        const response = await git(repository, [`--git-dir=${repository}`, '-c', 'core.bare=true', ...args]);
        if (response.exitCode !== 0) throw new CaptureError('DELIVERY_GIT_UNAVAILABLE');
        return response.stdout;
      }, delivery);
    } catch (error) { if (error instanceof CaptureError) throw error; throw new CaptureError('DELIVERY_IO_FAILED'); }
  };
}
