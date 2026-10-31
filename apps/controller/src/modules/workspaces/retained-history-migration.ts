import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, writeFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { issueHistoryRepositoryReference } from '#contracts';
import { CaptureError, ensureDirectory, metadataBytes, noBorrowedObjects, plainDirectory } from './capture.js';
import type { GitReader } from './git.js';
import { retainedRepositoryOwner, retainedRepositoryPath, requireAttemptRootResolver, type AttemptRootResolver } from './project-storage.js';

export interface RetainedHistoryMigrationCandidate {
  attemptId: string;
  projectId: string;
  repositoryId: string;
  issueId: string;
  issueNumber: number;
  hasLegacyDeliveries: boolean;
}

export interface RetainedHistoryMigrationJournal {
  attemptId: string;
  projectId: string;
  repositoryId: string;
  issueId: string;
  issueNumber: number;
  sourceRelative: string;
  destinationRelative: string;
  sourceIdentityJson: string;
  refsSha256: string;
  refCount: number;
  destinationIdentityJson: string | null;
  state: 'copying' | 'blocked' | 'verified';
  reason: string | null;
}

export interface RetainedHistoryMigrationStore {
  listRetainedHistoryMigrationCandidates(currentAttemptId: string): RetainedHistoryMigrationCandidate[];
  getRetainedHistoryMigration(attemptId: string): RetainedHistoryMigrationJournal | null;
  beginRetainedHistoryMigration(input: Omit<RetainedHistoryMigrationJournal, 'sourceRelative' | 'destinationRelative' | 'destinationIdentityJson' | 'state' | 'reason'>): void;
  recordRetainedHistoryMigrationDestination(attemptId: string, identity: string): void;
  blockRetainedHistoryMigration(attemptId: string, reason: string): void;
  completeRetainedHistoryMigration(attemptId: string, refsSha256: string, refCount: number, destinationIdentity: string): void;
}

interface Ref { name: string; objectId: string; symbolicTarget: string | null }
const repoId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const refName = /^refs\/[^\s:~^?*\[\\\x00-\x1f\x7f]+$/;

function identityJson(stat: { dev: bigint | number; ino: bigint | number }): string {
  return JSON.stringify({ device: String(stat.dev), inode: String(stat.ino) });
}

function parseRefs(stdout: string): Ref[] {
  const value = stdout.trimEnd();
  if (!value) return [];
  const refs = value.split(/\r?\n/).map(record => {
    const line = record.endsWith(' ') ? record.slice(0, -1) : record;
    const match = /^(\S+) ([a-f0-9]{40}|[a-f0-9]{64})(?: (.+))?$/.exec(line);
    if (!match || !refName.test(match[1]!) || !repoId.test(match[2]!)) throw new CaptureError('RETAINED_HISTORY_REFS_INVALID');
    return { name: match[1]!, objectId: match[2]!, symbolicTarget: match[3] || null };
  });
  if (refs.length > 100_000 || new Set(refs.map(ref => ref.name)).size !== refs.length) throw new CaptureError('RETAINED_HISTORY_REFS_INVALID');
  return refs;
}

function manifest(refs: readonly Ref[]): string {
  return createHash('sha256').update(JSON.stringify(refs)).digest('hex');
}

function missing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }

export function createRetainedHistoryMigrator(dataDirectory: string | undefined, git: GitReader | undefined,
  store: RetainedHistoryMigrationStore | undefined, resolveAttemptRoot: AttemptRootResolver | undefined,
  canonicalize: (path: string) => Promise<string> = realpath) {
  return async (currentAttemptId: string): Promise<void> => {
    if (!dataDirectory || !git || !store) throw new CaptureError('CONTEXT_UNAVAILABLE');
    const candidates = store.listRetainedHistoryMigrationCandidates(currentAttemptId);
    if (candidates.length > 100_000) throw new CaptureError('RETAINED_HISTORY_CANDIDATES_INVALID');
    if (candidates.length === 0) return;
    const rootResolver = requireAttemptRootResolver(resolveAttemptRoot);
    const currentRoot = await canonicalize(await rootResolver(currentAttemptId));

    for (const candidate of candidates) {
      if (!Number.isSafeInteger(candidate.issueNumber) || candidate.issueNumber < 1) throw new CaptureError('RETAINED_HISTORY_CANDIDATES_INVALID');
      const previous = store.getRetainedHistoryMigration(candidate.attemptId);
      if (previous?.state === 'verified') continue;
      if (previous?.state === 'blocked') throw new CaptureError('RETAINED_HISTORY_MIGRATION_BLOCKED');
      const sourceRelative = `git/${candidate.attemptId}.git`;
      const sourceRoot = await canonicalize(await rootResolver(candidate.attemptId));
      if (sourceRoot !== currentRoot) throw new CaptureError('RETAINED_HISTORY_ROOT_CHANGED');
      const source = retainedRepositoryPath(sourceRoot, candidate.attemptId, sourceRelative);
      let sourceExists = true;
      try { await plainDirectory(source, canonicalize); } catch (error) {
        if (missing(error)) sourceExists = false;
        else throw error;
      }
      if (!sourceExists) {
        if (candidate.hasLegacyDeliveries) throw new CaptureError('RETAINED_HISTORY_SOURCE_MISSING');
        continue;
      }
      const owner = retainedRepositoryOwner(candidate.attemptId, sourceRelative);
      if ((await metadataBytes(resolve(source, 'factory-owner'), 64)).toString('utf8') !== owner) throw new CaptureError('RETAINED_HISTORY_SOURCE_INVALID');
      await noBorrowedObjects(source);
      const sourceStat = await lstat(source, { bigint: true });
      const sourceIdentityJson = identityJson(sourceStat);
      const sourceGit = async (args: readonly string[]) => {
        const result = await git(source, [`--git-dir=${source}`, '-c', 'core.bare=true', ...args]);
        if (result.exitCode !== 0) throw new CaptureError('RETAINED_HISTORY_GIT_FAILED');
        return result.stdout;
      };
      const sourceFormat = (await sourceGit(['rev-parse', '--show-object-format'])).trim();
      if (!['sha1', 'sha256'].includes(sourceFormat)) throw new CaptureError('RETAINED_HISTORY_FORMAT_INVALID');
      const sourceRefs = parseRefs(await sourceGit(['for-each-ref', '--format=%(refname) %(objectname) %(symref)']));
      const sourceDigest = manifest(sourceRefs);
      if (sourceRefs.length === 0 && candidate.hasLegacyDeliveries) throw new CaptureError('RETAINED_HISTORY_EMPTY_SOURCE');
      if (sourceRefs.length === 0) continue;
      try {
        store.beginRetainedHistoryMigration({ attemptId: candidate.attemptId, projectId: candidate.projectId,
          repositoryId: candidate.repositoryId, issueId: candidate.issueId, issueNumber: candidate.issueNumber,
          sourceIdentityJson, refsSha256: sourceDigest, refCount: sourceRefs.length });
      } catch (error) {
        if (!previous) throw error;
        throw new CaptureError('RETAINED_HISTORY_SOURCE_CHANGED');
      }

      const destinationRelative = issueHistoryRepositoryReference(candidate.issueNumber);
      const destination = retainedRepositoryPath(currentRoot, currentAttemptId, destinationRelative);
      const expectedOwner = retainedRepositoryOwner(currentAttemptId, destinationRelative);
      const issuesDirectory = resolve(currentRoot, 'issues');
      await ensureDirectory(issuesDirectory);
      await plainDirectory(issuesDirectory, canonicalize);
      await ensureDirectory(dirname(destination));
      await plainDirectory(dirname(destination), canonicalize);

      try { await mkdir(destination); } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw new CaptureError('RETAINED_HISTORY_DESTINATION_INVALID');
      }
      await plainDirectory(dirname(destination), canonicalize);
      await plainDirectory(destination, canonicalize);
      const marker = resolve(destination, 'factory-owner');
      try {
        if ((await metadataBytes(marker, 64)).toString('utf8') !== expectedOwner) throw new CaptureError('RETAINED_HISTORY_DESTINATION_INVALID');
      } catch (error) {
        if (!missing(error)) throw error;
        if ((await readdir(destination)).length !== 0) throw new CaptureError('RETAINED_HISTORY_DESTINATION_INVALID');
        await writeFile(marker, expectedOwner, { flag: 'wx' });
      }
      const init = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', '-c', 'gc.auto=0',
        '-c', 'maintenance.auto=false', 'init', '--bare', '--template=', `--object-format=${sourceFormat}`, destination]);
      if (init.exitCode !== 0) throw new CaptureError('RETAINED_HISTORY_GIT_FAILED');
      await noBorrowedObjects(destination);
      const destinationStat = await lstat(destination, { bigint: true });
      const destinationIdentityJson = identityJson(destinationStat);
      store.recordRetainedHistoryMigrationDestination(candidate.attemptId, destinationIdentityJson);
      const destinationGit = async (args: readonly string[]) => {
        const result = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', '-c', 'gc.auto=0',
          '-c', 'maintenance.auto=false', ...args]);
        if (result.exitCode !== 0) throw new CaptureError('RETAINED_HISTORY_GIT_FAILED');
        return result.stdout;
      };
      const destinationFormat = (await destinationGit(['rev-parse', '--show-object-format'])).trim();
      if (destinationFormat !== sourceFormat) throw new CaptureError('RETAINED_HISTORY_FORMAT_INVALID');

      for (const ref of sourceRefs) {
        if (ref.symbolicTarget) {
          const existing = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', 'symbolic-ref', '--quiet', '--no-recurse', ref.name]);
          if (existing.exitCode === 0) {
            if (existing.stdout.trim() !== ref.symbolicTarget) throw new CaptureError('RETAINED_HISTORY_REF_CONFLICT');
          } else {
            const direct = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', 'show-ref', '--verify', '--hash', ref.name]);
            if (direct.exitCode === 0) throw new CaptureError('RETAINED_HISTORY_REF_CONFLICT');
            if (![1,128].includes(direct.exitCode)) throw new CaptureError('RETAINED_HISTORY_GIT_FAILED');
            const updated = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', 'symbolic-ref', '--no-recurse', ref.name, ref.symbolicTarget]);
            if (updated.exitCode !== 0) throw new CaptureError('RETAINED_HISTORY_GIT_FAILED');
          }
          continue;
        }
        const existing = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', 'show-ref', '--verify', '--hash', ref.name]);
        if (existing.exitCode === 0) {
          if (existing.stdout.trim() !== ref.objectId) throw new CaptureError('RETAINED_HISTORY_REF_CONFLICT');
          continue;
        }
        if (![1, 128].includes(existing.exitCode)) throw new CaptureError('RETAINED_HISTORY_GIT_FAILED');
        const fetched = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', '-c', 'protocol.file.allow=always',
          'fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--', source, `${ref.name}:${ref.name}`]);
        if (fetched.exitCode !== 0) throw new CaptureError('RETAINED_HISTORY_GIT_FAILED');
      }

      const afterSourceRefs = parseRefs(await sourceGit(['for-each-ref', '--format=%(refname) %(objectname) %(symref)']));
      const sourceStatAfter = await lstat(source, { bigint: true });
      if (manifest(afterSourceRefs) !== sourceDigest || identityJson(sourceStatAfter) !== sourceIdentityJson) throw new CaptureError('RETAINED_HISTORY_SOURCE_CHANGED');
      const targetRefs = new Map(parseRefs(await destinationGit(['for-each-ref', '--format=%(refname) %(objectname) %(symref)']))
        .map(ref => [ref.name, ref]));
      for (const ref of sourceRefs) {
        const target = targetRefs.get(ref.name);
        if (!target || target.objectId !== ref.objectId || target.symbolicTarget !== ref.symbolicTarget) {
          throw new CaptureError('RETAINED_HISTORY_VERIFICATION_FAILED');
        }
        const object = await git(destination, [`--git-dir=${destination}`, '-c', 'core.bare=true', 'cat-file', '-e', `${ref.objectId}^{object}`]);
        if (object.exitCode !== 0) throw new CaptureError('RETAINED_HISTORY_VERIFICATION_FAILED');
      }
      store.completeRetainedHistoryMigration(candidate.attemptId, sourceDigest, sourceRefs.length, destinationIdentityJson);
    }
  };
}
