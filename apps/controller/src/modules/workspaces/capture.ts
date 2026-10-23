import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { GitObjectId, OperationId, Delivery, type CaptureWarning } from '#contracts';
import type { GitInput, GitReader } from './git.js';
import type { AttemptRootResolver } from './project-storage.js';

export class CaptureError extends Error { constructor(readonly code: string) { super(code); } }
export interface CaptureInput { attemptId: string; passageId: string; deliveryId: string; baseSha: string; declaredFiles: string[] }
export interface CapturedContent {
  gitRef: string; contentIdentity: string; commitSha: string; hasDelta: boolean; warnings: CaptureWarning[];
}
export const captureLimits = Object.freeze({ files: 100_000, fileBytes: 16_777_216, totalBytes: 134_217_728 });
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function gitPath(path: string): boolean {
  return path.length > 0 && path.length <= 4096 && !path.includes('\0') && !path.includes('\\') && !path.includes(':') &&
    !path.startsWith('/') && path.split('/').every(p => p !== '' && p !== '.' && p !== '..' && p.toLowerCase() !== '.git');
}
const secret = (path: string) => /(?:^|\/)(?:\.env(?:\..*)?|\.git-credentials|\.?netrc|_netrc|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|credentials(?:\.json)?|secrets?(?:\..*)?|[^/]+\.(?:pem|key|p12|pfx))$/i.test(path) && !/(?:^|\/)\.env\.(?:example|sample|template)$/i.test(path);
export function nul(value: string): string[] {
  if (value && !value.endsWith('\0')) throw new CaptureError('GIT_NAMES_INVALID');
  return value ? value.slice(0, -1).split('\0') : [];
}
export function objectId(value: string): string {
  const oid = value.trim(); if (!Value.Check(GitObjectId, oid)) throw new CaptureError('GIT_OBJECT_INVALID'); return oid;
}
export async function managedRoot(dataDirectory: string, canonicalize: (p: string) => Promise<string>) {
  const data = await canonicalize(dataDirectory);
  if (!isAbsolute(data)) throw new CaptureError('MANAGED_ROOT_INVALID');
  return data;
}
export async function plainDirectory(path: string, canonicalize: (p: string) => Promise<string>) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await canonicalize(path) !== path) throw new CaptureError('MANAGED_PATH_INVALID');
}
export async function ensureDirectory(path: string) {
  try { await mkdir(path); } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
}
export async function noBorrowedObjects(metadata: string) {
  for (const item of ['objects/info/alternates', 'objects/info/http-alternates', 'commondir', 'shallow']) {
    try { await lstat(resolve(metadata, item)); } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    throw new CaptureError('GIT_DEPENDENCY_UNSUPPORTED');
  }
}
export async function metadataBytes(path: string, limit: number): Promise<Buffer> {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(limit)) throw new CaptureError('GIT_METADATA_INVALID');
  const handle = await open(path, 'r');
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw new CaptureError('CAPTURE_CONCURRENT_CHANGE');
    const value = Buffer.alloc(Number(before.size) + 1); let read = 0;
    while (read < value.length) { const result = await handle.read(value, read, value.length - read, read); if (!result.bytesRead) break; read += result.bytesRead; }
    const after = await lstat(path, { bigint: true });
    if (read > limit || before.size !== BigInt(read) || before.ino !== after.ino || before.dev !== after.dev ||
      before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || after.isSymbolicLink()) throw new CaptureError('CAPTURE_CONCURRENT_CHANGE');
    return value.subarray(0, read);
  } finally { await handle.close(); }
}
interface FileVersion { path: string; mode: string; hash: string; size: number }
interface Observation { files: FileVersion[]; digest: string; warnings: CaptureWarning[] }

/** Raw bytes enter only the Git object database; the manifest is transient hashes and modes. */
export function createCapturer(dataDirectory?: string, git?: GitReader, canonicalize: (p: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  return async (input: CaptureInput, expectedDelivery?: Delivery): Promise<CapturedContent> => {
    if (!Value.Check(OperationId, input.attemptId) || !Value.Check(OperationId, input.passageId) || !Value.Check(OperationId, input.deliveryId) ||
      !Value.Check(GitObjectId, input.baseSha) || input.declaredFiles.length > 1000 || input.declaredFiles.some(p => !gitPath(p))) throw new CaptureError('CAPTURE_INPUT_INVALID');
    if (!dataDirectory || !git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    let temporaryIndex: string | undefined;
    const run = async (cwd: string, args: string[], options?: GitInput) => {
      const r = await git(cwd, args, options); if (r.exitCode !== 0) throw new CaptureError('CAPTURE_GIT_FAILED'); return r.stdout;
    };
    try {
      const data = await managedRoot(resolveAttemptRoot ? await resolveAttemptRoot(input.attemptId) : dataDirectory, canonicalize);
      const work = resolve(data, 'work'); const attempt = resolve(work, input.attemptId); const implementation = resolve(attempt, 'implementation');
      for (const path of [work, attempt, implementation, resolve(implementation, '.git')]) await plainDirectory(path, canonicalize);
      const metadata = resolve(implementation, '.git'); await noBorrowedObjects(metadata);
      const sourceArgs = [`--git-dir=${metadata}`, `--work-tree=${implementation}`, '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile='];
      const source = (args: string[], options?: GitInput) => run(implementation, [...sourceArgs, ...args], options);
      const base = objectId(await source(['rev-parse', '--verify', '--end-of-options', `${input.baseSha}^{commit}`]));
      if (base !== input.baseSha) throw new CaptureError('BASE_IDENTITY_MISMATCH');
      const baseEntries = new Map<string, string>();
      for (const entry of nul(await source(['ls-tree', '-r', '-z', base]))) {
        const match = /^([0-7]{6}) (blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(entry);
        if (!match || !gitPath(match[4]!)) throw new CaptureError('BASE_TREE_INVALID');
        if (!['100644', '100755'].includes(match[1]!)) throw new CaptureError('SPECIAL_FILE_UNSUPPORTED');
        if (secret(match[4]!)) throw new CaptureError('TRACKED_SECRET_UNSUPPORTED');
        baseEntries.set(match[4]!, match[1]!);
      }
      const fileMode = (await source(['config', '--get', '--type=bool', 'core.filemode'])).trim() === 'true';
      async function bytes(path: string): Promise<Buffer | null> {
        const parts = path.split('/'); let current = implementation;
        for (const part of parts.slice(0, -1)) {
          current = resolve(current, part);
          try { await plainDirectory(current, canonicalize); } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
            throw error;
          }
        }
        const filename = resolve(implementation, ...parts);
        if (!filename.startsWith(implementation + sep)) throw new CaptureError('CAPTURE_PATH_INVALID');
        let stat;
        try { stat = await lstat(filename, { bigint: true }); } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
          throw error;
        }
        if (stat.isDirectory() && !stat.isSymbolicLink()) return null;
        if (!stat.isFile() || stat.isSymbolicLink()) throw new CaptureError('SPECIAL_FILE_UNSUPPORTED');
        if (stat.size > BigInt(captureLimits.fileBytes)) throw new CaptureError('CAPTURE_FILE_TOO_LARGE');
        const handle = await open(filename, 'r');
        try {
          const before = await handle.stat({ bigint: true });
          if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino) throw new CaptureError('CAPTURE_CONCURRENT_CHANGE');
          if (before.size > BigInt(captureLimits.fileBytes)) throw new CaptureError('CAPTURE_FILE_TOO_LARGE');
          const value = Buffer.alloc(Number(before.size) + 1); let read = 0;
          while (read < value.length) {
            const result = await handle.read(value, read, value.length - read, read); if (result.bytesRead === 0) break; read += result.bytesRead;
          }
          const after = await handle.stat({ bigint: true }); const pathAfter = await lstat(filename, { bigint: true });
          if (BigInt(read) !== before.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
            before.ino !== pathAfter.ino || after.ctimeNs !== pathAfter.ctimeNs || pathAfter.isSymbolicLink()) throw new CaptureError('CAPTURE_CONCURRENT_CHANGE');
          const buffer = value.subarray(0, read);
          if (buffer.subarray(0, 128).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) throw new CaptureError('LFS_UNSUPPORTED');
          if (parts.at(-1) === '.gitattributes' && buffer.toString('utf8').split(/\r?\n/).some(line => !line.trimStart().startsWith('#') && /(?:^|\s)filter(?:=|\s|$)/.test(line))) throw new CaptureError('FILTERED_CONTENT_UNSUPPORTED');
          return buffer;
        } finally { await handle.close(); }
      }
      async function observe(): Promise<Observation> {
        const head = objectId(await source(['rev-parse', '--verify', 'HEAD']));
        try { await lstat(resolve(metadata, 'index.lock')); throw new CaptureError('INDEX_LOCKED'); } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        const index = await metadataBytes(resolve(metadata, 'index'), 16_777_216);
        const flags = nul(await source(['ls-files', '-v', '-z']));
        if (flags.some(flag => /^[Ss] /.test(flag))) throw new CaptureError('SPARSE_CHECKOUT_UNSUPPORTED');
        // The base initializes the temporary index, but current tracking decides collection.
        // A path removed from tracking and now ignored must stay excluded even if it existed in the base.
        const tracked = new Map<string, string>();
        const stages = await source(['ls-files', '--stage', '-z']);
        for (const entry of nul(stages)) {
          const match = /^([0-7]{6}) [a-f0-9]+ ([0-3])\t([\s\S]+)$/.exec(entry);
          if (!match || match[2] !== '0') throw new CaptureError('INDEX_CONFLICT');
          if (!gitPath(match[3]!) || !['100644', '100755'].includes(match[1]!)) throw new CaptureError('SPECIAL_FILE_UNSUPPORTED');
          tracked.set(match[3]!, match[1]!);
        }
        const untracked = nul(await source(['ls-files', '--others', '--exclude-standard', '-z']));
        const paths = new Set([...tracked.keys(), ...untracked]);
        if (paths.size > captureLimits.files) throw new CaptureError('CAPTURE_TOO_MANY_FILES');
        const warnings: CaptureWarning[] = [];
        for (const path of input.declaredFiles) {
          if (tracked.has(path)) continue;
          const ignored = await git!(implementation, [...sourceArgs, 'check-ignore', '--no-index', '-z', '--stdin'], { input: `${path}\0` });
          if (![0, 1].includes(ignored.exitCode)) throw new CaptureError('IGNORE_QUERY_FAILED');
          if (nul(ignored.stdout).length || secret(path)) warnings.push({ attemptId: input.attemptId, passageId: input.passageId, deliveryId: input.deliveryId,
            path, reason: secret(path) ? 'KNOWN_SECRET_EXCLUDED' : 'DECLARED_NEW_FILE_IGNORED' });
        }
        const files: FileVersion[] = []; let total = 0;
        for (const path of [...paths].sort()) {
          if (!gitPath(path)) throw new CaptureError('CAPTURE_PATH_INVALID');
          if (secret(path)) { if (tracked.has(path)) throw new CaptureError('TRACKED_SECRET_UNSUPPORTED'); continue; }
          const value = await bytes(path); if (value === null) continue;
          total += value.length; if (total > captureLimits.totalBytes) throw new CaptureError('CAPTURE_TOO_LARGE');
          const mode = fileMode ? ((await lstat(resolve(implementation, path))).mode & 0o111 ? '100755' : '100644') : tracked.get(path) ?? baseEntries.get(path) ?? '100644';
          files.push({ path, mode, hash: sha256(value), size: value.length });
        }
        return { files, warnings, digest: sha256(JSON.stringify({ head, index: sha256(index), stages, flags, untracked, files, warnings })) };
      }
      const before = await observe();
      if (expectedDelivery) {
        if (!Value.Check(Delivery, expectedDelivery) || expectedDelivery.captureState !== 'captured' || expectedDelivery.attemptId !== input.attemptId || expectedDelivery.id !== input.deliveryId || expectedDelivery.producerPassageId !== input.passageId || expectedDelivery.baseSha !== input.baseSha) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
        const repository = resolve(data, 'git', `${input.attemptId}.git`);
        await plainDirectory(repository, canonicalize); await noBorrowedObjects(repository);
        if ((await metadataBytes(resolve(repository, 'factory-owner'), 36)).toString('utf8') !== input.attemptId) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
        const retained = (args: string[]) => run(repository, [`--git-dir=${repository}`, '-c', 'core.bare=true', ...args]);
        await verifyRetained(retained, expectedDelivery);
        const entries = nul(await retained(['ls-tree', '-r', '-z', expectedDelivery.commitSha!]));
        const expected = new Map<string, { mode: string; oid: string }>();
        for (const entry of entries) {
          const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(entry);
          if (!match || !gitPath(match[3]!)) throw new CaptureError('REVIEW_TREE_UNSUPPORTED');
          expected.set(match[3]!, { mode: match[1]!, oid: match[2]! });
        }
        if (expected.size !== before.files.length) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
        for (const file of before.files) {
          const prior = expected.get(file.path); const value = await bytes(file.path);
          if (!prior || !value || sha256(value) !== file.hash || prior.mode !== file.mode ||
            createHash(prior.oid.length === 64 ? 'sha256' : 'sha1').update(`blob ${value.length}\0`).update(value).digest('hex') !== prior.oid) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
        }
        if ((await observe()).digest !== before.digest) throw new CaptureError('CAPTURE_CONCURRENT_CHANGE');
        await verifyRetained(retained, expectedDelivery);
        return { gitRef: expectedDelivery.gitRef!, contentIdentity: expectedDelivery.contentIdentity!, commitSha: expectedDelivery.commitSha!, hasDelta: expectedDelivery.hasDelta!, warnings: expectedDelivery.warnings };
      }
      const gitRoot = resolve(data, 'git'); await ensureDirectory(gitRoot); await plainDirectory(gitRoot, canonicalize);
      const repository = resolve(gitRoot, `${input.attemptId}.git`);
      let created = false;
      try { await mkdir(repository); created = true; } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
      await plainDirectory(repository, canonicalize);
      const marker = resolve(repository, 'factory-owner');
      if (created) await writeFile(marker, input.attemptId, { flag: 'wx' });
      if ((await metadataBytes(marker, 36)).toString('utf8') !== input.attemptId) throw new CaptureError('RETAINED_REPOSITORY_INVALID');
      const hooks = resolve(repository, 'factory-empty-hooks'); await ensureDirectory(hooks); await plainDirectory(hooks, canonicalize);
      const args = [`--git-dir=${repository}`, '-c', 'core.bare=true', '-c', `core.hooksPath=${hooks}`, '-c', 'core.attributesFile=', '-c', 'core.fsync=all', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false'];
      const retained = (tail: string[], options?: GitInput) => run(repository, [...args, ...tail], options);
      await retained(['init', '--bare', '--template=', `--object-format=${base.length === 64 ? 'sha256' : 'sha1'}`, repository]);
      await noBorrowedObjects(repository);
      // Fetch into owned storage; no alternates/hardlinks and no references to the removable checkout.
      await retained(['-c', 'protocol.file.allow=always', 'fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--', implementation, base]);
      if (objectId(await retained(['rev-parse', '--verify', `${base}^{commit}`])) !== base) throw new CaptureError('BASE_IDENTITY_MISMATCH');
      temporaryIndex = resolve(repository, `factory-index-${randomUUID()}`);
      const options: GitInput = { indexFile: temporaryIndex };
      await retained(['read-tree', base], options);
      // Remove base paths then add the exact observed files. No worktree refresh, filters or implementation index access.
      const zero = '0'.repeat(base.length);
      const records = [...baseEntries.keys()].map(path => `0 ${zero}\t${path}\0`);
      for (const file of before.files) {
        const value = await bytes(file.path);
        if (!value || sha256(value) !== file.hash) throw new CaptureError('CAPTURE_CONCURRENT_CHANGE');
        const blob = objectId(await retained(['hash-object', '-w', '--stdin'], { input: value }));
        records.push(`${file.mode} ${blob}\t${file.path}\0`);
      }
      await retained(['update-index', '-z', '--index-info'], { ...options, input: records.join('') });
      const tree = objectId(await retained(['write-tree'], options));
      if ((await observe()).digest !== before.digest) throw new CaptureError('CAPTURE_CONCURRENT_CHANGE');
      const baseTree = objectId(await retained(['rev-parse', '--verify', `${base}^{tree}`]));
      const gitRef = `refs/factory/deliveries/${input.deliveryId}`;
      const prior = await git(repository, [...args, 'show-ref', '--verify', '--hash', gitRef]);
      let commitSha: string;
      if (prior.exitCode === 0) {
        commitSha = objectId(prior.stdout);
        if (objectId(await retained(['rev-parse', '--verify', `${commitSha}^{tree}`])) !== tree ||
          (await retained(['rev-list', '--parents', '-n', '1', commitSha])).trim() !== `${commitSha} ${base}`) throw new CaptureError('CAPTURE_REF_CONFLICT');
      } else {
        if (prior.exitCode !== 1 && prior.exitCode !== 128) throw new CaptureError('CAPTURE_GIT_FAILED');
        commitSha = objectId(await retained(['-c', 'user.name=Factory capture', '-c', 'user.email=capture@factory.invalid',
          'commit-tree', tree, '-p', base, '-m', `Private capture ${input.deliveryId}`]));
        await retained(['update-ref', '--no-deref', gitRef, commitSha, zero]);
      }
      await verifyRetained(retained, { baseSha: base, gitRef, commitSha, contentIdentity: tree });
      return { gitRef, contentIdentity: tree, commitSha, hasDelta: tree !== baseTree, warnings: before.warnings };
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError('CAPTURE_IO_FAILED');
    } finally {
      if (temporaryIndex) {
        for (const path of [temporaryIndex, `${temporaryIndex}.lock`]) {
          try { await unlink(path); } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new CaptureError('CAPTURE_INDEX_CLEANUP_FAILED');
          }
        }
      }
    }
  };
}
export async function verifyRetained(run: (args: string[]) => Promise<string>, delivery: Pick<Delivery, 'baseSha' | 'gitRef' | 'commitSha' | 'contentIdentity'>) {
  if (!delivery.gitRef || !delivery.commitSha || !delivery.contentIdentity ||
    objectId(await run(['rev-parse', '--verify', delivery.gitRef])) !== delivery.commitSha ||
    objectId(await run(['rev-parse', '--verify', `${delivery.commitSha}^{tree}`])) !== delivery.contentIdentity ||
    (await run(['rev-list', '--parents', '-n', '1', delivery.commitSha])).trim() !== `${delivery.commitSha} ${delivery.baseSha}` ||
    objectId(await run(['rev-parse', '--verify', `${delivery.baseSha}^{commit}`])) !== delivery.baseSha ||
    (await run(['for-each-ref', '--format=%(refname)%00%(objectname)%00%(symref)', delivery.gitRef])).replace(/\r?\n$/, '') !== `${delivery.gitRef}\0${delivery.commitSha}\0`) throw new CaptureError('DELIVERY_INTEGRITY_FAILED');
  await run(['fsck', '--full', '--strict', '--no-dangling', delivery.commitSha]);
}
