import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery as DeliverySchema, DeliveryDiffQuery as QuerySchema, type Delivery, type DeliveryDiff, type DeliveryDiffQuery, type DiffEntry } from '#contracts';
import type { GitReader } from './git.js';
import { CaptureError, gitPath, managedRoot, metadataBytes, noBorrowedObjects, nul, plainDirectory, sha256, verifyRetained } from './capture.js';
import { requireAttemptRootResolver, type AttemptRootResolver } from './project-storage.js';

interface Change { path: string; oldPath: string | null; status: string; oldMode: string; newMode: string; oldOid: string; newOid: string }
export function parseChanges(raw: string): Change[] {
  const tokens = nul(raw); const entries: Change[] = [];
  for (let i = 0; i < tokens.length;) {
    const match = /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([a-f0-9]{40}|[a-f0-9]{64}) ([ACDMRTUXB][0-9]*)$/.exec(tokens[i++]!);
    const path = tokens[i++]; if (!match || !path || !gitPath(path)) throw new CaptureError('DIFF_FORMAT_INVALID');
    const rename = /^[RC]/.test(match[5]!); const target = rename ? tokens[i++] : path;
    if (!target || !gitPath(target)) throw new CaptureError('DIFF_FORMAT_INVALID');
    entries.push({ path: target, oldPath: rename ? path : null, oldMode: match[1]!, newMode: match[2]!, oldOid: match[3]!, newOid: match[4]!, status: match[5]! });
  }
  return entries;
}
export function createDeliveryDiff(dataDirectory?: string, git?: GitReader, canonicalize: (p: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  return async (delivery: Delivery, query: DeliveryDiffQuery, previous?: Delivery): Promise<DeliveryDiff> => {
    if (!Value.Check(DeliverySchema, delivery) || !Value.Check(QuerySchema, query)) throw new CaptureError('DIFF_INPUT_INVALID');
    if (delivery.captureState !== 'captured' || !delivery.gitRef || !delivery.contentIdentity) throw new CaptureError('DELIVERY_NOT_CAPTURED');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    if (previous && (!Value.Check(DeliverySchema, previous) || previous.id === delivery.id || previous.attemptId !== delivery.attemptId ||
        previous.round !== delivery.round - 1 || previous.captureState !== 'captured')) throw new CaptureError('DIFF_INPUT_INVALID');
    try {
      const data = await managedRoot(await requireAttemptRootResolver(resolveAttemptRoot)(delivery.attemptId), canonicalize); const root = resolve(data, 'git'); const repository = resolve(root, `${delivery.attemptId}.git`);
      await plainDirectory(root, canonicalize); await plainDirectory(repository, canonicalize); await noBorrowedObjects(repository);
      if ((await metadataBytes(resolve(repository, 'factory-owner'), 36)).toString('utf8') !== delivery.attemptId) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
      const run = async (args: string[]) => {
        const reply = await git(repository, ['--literal-pathspecs', `--git-dir=${repository}`, '-c', 'core.bare=true', '-c', 'diff.renames=false', ...args]);
        if (reply.exitCode !== 0) throw new CaptureError('DELIVERY_GIT_UNAVAILABLE'); return reply.stdout;
      };
      await verifyRetained(run, delivery);
      if (previous) await verifyRetained(run, previous);
      const base = previous?.commitSha ?? delivery.baseSha;
      const changes = parseChanges(await run(['diff', '--raw', '-z', '--no-abbrev', '--no-ext-diff', '--no-textconv', '--find-renames=100%', base, delivery.gitRef, '--']));
      const identity = sha256(JSON.stringify([delivery.id, base, delivery.contentIdentity, changes]));
      let offset = 0;
      if (query.cursor) {
        let parsed: unknown;
        try { parsed = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')); } catch { throw new CaptureError('DIFF_CURSOR_INVALID'); }
        if (!Array.isArray(parsed) || parsed.length !== 2 || parsed[0] !== identity || !Number.isSafeInteger(parsed[1]) || parsed[1] < 0 || parsed[1] > changes.length) throw new CaptureError('DIFF_CURSOR_INVALID');
        offset = parsed[1] as number;
      }
      const entries: DiffEntry[] = []; let budget = 262_144;
      for (const change of changes.slice(offset, offset + Number(query.limit ?? '25'))) {
        const entry: DiffEntry = { path: change.path, oldPath: change.oldPath, status: change.status, oldMode: change.oldMode, newMode: change.newMode,
          binary: false, unsupported: null, patch: null };
        let size = 0;
        for (const oid of [change.oldOid, change.newOid]) if (!/^0+$/.test(oid)) {
          const n = Number((await run(['cat-file', '-s', oid])).trim());
          if (!Number.isSafeInteger(n) || n < 0) throw new CaptureError('DELIVERY_INTEGRITY_FAILED'); size += n;
        }
        const paths = change.oldPath ? [change.oldPath, change.path] : [change.path];
        const stats = await run(['diff', '--numstat', '-z', '--no-ext-diff', '--no-textconv', base, delivery.gitRef, '--', ...paths]);
        entry.binary = stats.startsWith('-\t-\t');
        if (entry.binary) entry.unsupported = 'BINARY_CONTENT';
        else if (size > 65536) entry.unsupported = 'PATCH_TOO_LARGE';
        else {
          let patch: string | null = null;
          try { patch = await run(['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=3', base, delivery.gitRef, '--', ...paths]); }
          catch (error) { if (error instanceof Error && error.message === 'GIT_ENCODING_UNSUPPORTED') entry.unsupported = 'NON_UTF8_CONTENT'; else throw error; }
          if (patch !== null) {
            if (patch.length > 262_144 || Buffer.byteLength(patch) > 262_144) entry.unsupported = 'PATCH_TOO_LARGE';
            else if (Buffer.byteLength(patch) > budget && entries.length) break;
            else { entry.patch = patch; budget -= Buffer.byteLength(patch); }
          }
        }
        entries.push(entry);
      }
      // Confirm retention identity again after IO; detail never falls back to the mutable checkout.
      await verifyRetained(run, delivery);
      if (previous) await verifyRetained(run, previous);
      const next = offset + entries.length; const hasMore = next < changes.length;
      return { deliveryId: delivery.id, baseSha: base, contentIdentity: delivery.contentIdentity, entries,
        hasMore, nextCursor: hasMore ? Buffer.from(JSON.stringify([identity, next])).toString('base64url') : null };
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError('DELIVERY_IO_FAILED');
    }
  };
}
