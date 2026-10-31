import { createHash } from 'node:crypto';
import { lstat, readdir, realpath, unlink, rmdir } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { OperationId, type Delivery } from '#contracts';
import type { GitReader } from './git.js';
import { CaptureError, captureLimits, gitPath, managedRoot, metadataBytes, noBorrowedObjects, nul, plainDirectory, verifyRetained } from './capture.js';
import { retainedRepositoryOwner, retainedRepositoryPath, requireAttemptRootResolver, requireAttemptWorkspacePathResolver, type AttemptRootResolver, type AttemptWorkspacePathResolver } from './project-storage.js';

export interface EnvironmentObservation { exists: boolean; stamp: string; contentSafe: boolean; reason: string | null; fileCount: number; bytes: number }
interface Entry { path: string; directory: boolean; identity: string }
const identity = (s: Awaited<ReturnType<typeof lstat>>) => [s.dev, s.ino, s.mode, s.size, s.mtimeMs, s.ctimeMs].join(':');
const missing = (e: unknown) => e instanceof Error && 'code' in e && e.code === 'ENOENT';

/** Only implementation resource IDs reach this adapter. No caller-supplied filesystem path. */
export function createEnvironmentRecovery(dataDirectory?: string, git?: GitReader,
  openFolder?: (path: string) => Promise<void>, canonicalize: (p: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver, resolveAttemptWorkspace?: AttemptWorkspacePathResolver) {
  async function target(attemptId: string): Promise<string> {
    if (!Value.Check(OperationId, attemptId) || !dataDirectory) throw new CaptureError('RESOURCE_PATH_INVALID');
    await managedRoot(await requireAttemptRootResolver(resolveAttemptRoot)(attemptId), canonicalize);
    const path = await requireAttemptWorkspacePathResolver(resolveAttemptWorkspace)(attemptId);
    await plainDirectory(path, canonicalize);
    return path;
  }
  async function inventory(root: string) {
    const entries: Entry[] = []; let bytes = 0; let fileCount = 0;
    async function visit(path: string, depth: number): Promise<void> {
      if (depth > 64 || entries.length >= captureLimits.files) throw new CaptureError('REMOVAL_PLAN_LIMIT');
      const stat = await lstat(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new CaptureError('RESOURCE_PATH_INVALID');
      if (stat.isDirectory()) {
        await plainDirectory(path, canonicalize);
        for (const name of (await readdir(path)).sort()) await visit(resolve(path, name), depth + 1);
      } else { fileCount++; bytes += stat.size; }
      const after = await lstat(path);
      if (identity(stat) !== identity(after)) throw new CaptureError('RESOURCE_CHANGED');
      entries.push({ path, directory: stat.isDirectory(), identity: identity(stat) });
    }
    await visit(root, 0);
    const stamp = createHash('sha256').update(JSON.stringify(entries.map(e => [relative(root, e.path), e.directory, e.identity]))).digest('hex');
    return { entries, stamp, fileCount, bytes };
  }
  async function retained(root: string, attemptId: string, deliveries: Delivery[]): Promise<boolean> {
    if (!git || !deliveries.length || deliveries.some(d => d.captureState !== 'captured' || d.attemptId !== attemptId) ||
        new Set(deliveries.map(d => d.repositoryRelative)).size !== 1) return false;
    const data = await managedRoot(await requireAttemptRootResolver(resolveAttemptRoot)(attemptId), canonicalize);
    const repository = retainedRepositoryPath(data, attemptId, deliveries[0]!.repositoryRelative);
    await plainDirectory(dirname(repository), canonicalize); await plainDirectory(repository, canonicalize); await noBorrowedObjects(repository);
    if ((await metadataBytes(resolve(repository, 'factory-owner'), 64)).toString('utf8') !== retainedRepositoryOwner(attemptId, deliveries[0]!.repositoryRelative)) throw new CaptureError('RETAINED_CONTENT_AT_RISK');
    const metadata = resolve(root, '.git'); await plainDirectory(metadata, canonicalize); await noBorrowedObjects(metadata);
    const run = async (args: string[], input?: Buffer) => {
      const r = await git(repository, [`--git-dir=${repository}`, '-c', 'core.bare=true', ...args], input ? { input } : undefined);
      if (r.exitCode !== 0) throw new CaptureError('RETAINED_CONTENT_AT_RISK'); return r.stdout;
    };
    for (const delivery of deliveries) await verifyRetained(run, delivery);
    const latest = deliveries.at(-1)!;
    const tree = nul(await run(['ls-tree', '-r', '-z', latest.commitSha!]));
    if (tree.length > captureLimits.files) return false;
    const expected = new Set<string>(); let total = 0;
    for (const item of tree) {
      const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(item);
      if (!match || !gitPath(match[3]!)) return false;
      const name = match[3]!; expected.add(name);
      const path = resolve(root, ...name.split('/')); const stat = await lstat(path);
      const bytes = await metadataBytes(path, captureLimits.fileBytes); total += bytes.length;
      if (total > captureLimits.totalBytes || (await run(['hash-object', '--stdin'], bytes)).trim() !== match[2]) return false;
      if (process.platform !== 'win32' && ((stat.mode & 0o111) !== 0) !== (match[1] === '100755')) return false;
    }
    const result = await git(root, [`--git-dir=${metadata}`, `--work-tree=${root}`, '-c', 'core.fsmonitor=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']);
    if (result.exitCode !== 0) return false;
    for (const name of new Set(nul(result.stdout))) {
      if (!gitPath(name)) return false;
      try { const stat = await lstat(resolve(root, ...name.split('/'))); if (!stat.isFile() || !expected.has(name)) return false; }
      catch (error) { if (!missing(error) || expected.has(name)) throw error; }
    }
    for (const delivery of deliveries) await verifyRetained(run, delivery);
    return true;
  }
  async function inspectEnvironment(attemptId: string, deliveries: Delivery[]): Promise<EnvironmentObservation> {
    let root: string;
    try { root = await target(attemptId); }
    catch (error) { if (missing(error)) return { exists: false, stamp: 'absent', contentSafe: false, reason: 'RESOURCE_MISSING', fileCount: 0, bytes: 0 }; throw error; }
    const before = await inventory(root);
    let contentSafe = false;
    try { contentSafe = await retained(root, attemptId, deliveries); }
    catch (error) { if (!(error instanceof CaptureError) && !missing(error)) throw new CaptureError('RETAINED_CONTENT_AT_RISK'); }
    const after = await inventory(root);
    if (before.stamp !== after.stamp) throw new CaptureError('RESOURCE_CHANGED');
    return { exists: true, stamp: after.stamp, contentSafe, reason: contentSafe ? null : 'RETAINED_CONTENT_AT_RISK', fileCount: after.fileCount, bytes: after.bytes };
  }
  return {
    inspectEnvironment,
    async folderCapability(attemptId: string) {
      try { await target(attemptId); }
      catch (error) { if (missing(error)) return { available: false, reason: 'RESOURCE_MISSING' }; throw error; }
      return { available: Boolean(openFolder), reason: openFolder ? null : 'NATIVE_OPEN_UNAVAILABLE' };
    },
    async openEnvironment(attemptId: string) {
      if (!openFolder) throw new CaptureError('NATIVE_OPEN_UNAVAILABLE');
      const root = await target(attemptId); await openFolder(root);
    },
    async removeEnvironment(attemptId: string, deliveries: Delivery[], expectedStamp: string, gate: () => void) {
      gate(); const observed = await inspectEnvironment(attemptId, deliveries); gate();
      if (!observed.contentSafe) throw new CaptureError('RETAINED_CONTENT_AT_RISK');
      if (observed.stamp !== expectedStamp) throw new CaptureError('REMOVAL_PLAN_CHANGED');
      const root = await target(attemptId); const plan = await inventory(root);
      if (plan.stamp !== expectedStamp) throw new CaptureError('REMOVAL_PLAN_CHANGED');
      gate();
      // Postorder, without following links or using force/recursive removal. The fixed root
      // excludes retained Git repositories, check/review environments and evidence files.
      for (const entry of plan.entries) {
        gate(); await target(attemptId);
        const parts = relative(root, entry.path).split(sep).filter(Boolean); let parent = root;
        for (const part of parts.slice(0, -1)) { parent = resolve(parent, part); await plainDirectory(parent, canonicalize); }
        const stat = await lstat(entry.path);
        if (stat.isSymbolicLink() || stat.isDirectory() !== entry.directory || stat.ino.toString() !== entry.identity.split(':')[1] || stat.dev.toString() !== entry.identity.split(':')[0]) throw new CaptureError('RESOURCE_CHANGED');
        if (!entry.directory && identity(stat) !== entry.identity) throw new CaptureError('RESOURCE_CHANGED');
        gate();
        if (entry.directory) await rmdir(entry.path); else await unlink(entry.path);
      }
    },
  };
}
