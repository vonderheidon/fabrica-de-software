import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Artifact, OperationId } from '#contracts';
import type { AttemptRootResolver } from '../workspaces/index.js';

export class VerificationError extends Error { constructor(readonly code: string, options?: ErrorOptions) { super(code, options); } }
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const missing = (e: unknown) => e instanceof Error && 'code' in e && e.code === 'ENOENT';
export function createArtifacts(dataDirectory: string, canonicalize: (p: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  async function directory(path: string, create: boolean): Promise<void> {
    if (create) {
      try { await mkdir(path); } catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw e; }
    }
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await canonicalize(path) !== path) throw new VerificationError('ARTIFACT_INTEGRITY_FAILED');
  }
  async function filename(a: Artifact, create: boolean): Promise<string> {
    if (!Value.Check(Artifact, a) || a.pathRelative !== `${a.attemptId}/${a.checkId}/${a.id}.log`) throw new VerificationError('ARTIFACT_INTEGRITY_FAILED');
    const rootPath = resolveAttemptRoot ? await resolveAttemptRoot(a.attemptId) : dataDirectory;
    const data = await canonicalize(rootPath);
    const rootStat = await lstat(rootPath);
    if (data !== rootPath || !rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new VerificationError('ARTIFACT_INTEGRITY_FAILED');
    const root = resolve(data, 'artifacts'); const attempt = resolve(root, a.attemptId); const parent = resolve(attempt, a.checkId);
    await directory(root, create); await directory(attempt, create); await directory(parent, create);
    return resolve(parent, `${a.id}.log`);
  }
  async function read(a: Artifact): Promise<Buffer> {
    try {
      const path = await filename(a, false); const stat = await lstat(path, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== BigInt(a.sizeBytes) || await canonicalize(path) !== path) throw new VerificationError('ARTIFACT_INTEGRITY_FAILED');
      const handle = await open(path, 'r');
      try {
        const before = await handle.stat({ bigint: true });
        if (before.ino !== stat.ino || before.dev !== stat.dev || before.size !== stat.size) throw new VerificationError('ARTIFACT_INTEGRITY_FAILED');
        const bytes = Buffer.alloc(a.sizeBytes + 1); let offset = 0;
        while (offset < bytes.length) { const result = await handle.read(bytes, offset, bytes.length - offset, offset); if (!result.bytesRead) break; offset += result.bytesRead; }
        const after = await handle.stat({ bigint: true }); const pathAfter = await lstat(path, { bigint: true });
        if (offset !== a.sizeBytes || after.ctimeNs !== before.ctimeNs || after.mtimeNs !== before.mtimeNs || after.ino !== pathAfter.ino || after.dev !== pathAfter.dev ||
          after.ctimeNs !== pathAfter.ctimeNs || pathAfter.isSymbolicLink() || hash(bytes.subarray(0, offset)) !== a.sha256) throw new VerificationError('ARTIFACT_INTEGRITY_FAILED');
        return bytes.subarray(0, offset);
      } finally { await handle.close(); }
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      if (missing(error)) throw new VerificationError('ARTIFACT_MISSING');
      throw new VerificationError('ARTIFACT_READ_FAILED');
    }
  }
  return {
    read,
    async write(binding: { attemptId: string; deliveryId: string; checkId: string }, bytes: Buffer): Promise<Artifact> {
      if (![binding.attemptId, binding.deliveryId, binding.checkId].every(id => Value.Check(OperationId, id)) || bytes.length > 1_048_576) throw new VerificationError('ARTIFACT_INPUT_INVALID');
      const id = randomUUID();
      const artifact: Artifact = { id, ...binding, kind: 'check_log', pathRelative: `${binding.attemptId}/${binding.checkId}/${id}.log`, sha256: hash(bytes), sizeBytes: bytes.length };
      try {
        const path = await filename(artifact, true); const temp = `${path}.${randomUUID()}.tmp`;
        const handle = await open(temp, 'wx', 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        // Fresh UUID destination; preserve orphaned files on any subsequent failure.
        await rename(temp, path);
        const final = await open(path, 'r+'); try { await final.sync(); } finally { await final.close(); }
        if (process.platform !== 'win32') {
          const parent = await open(resolve(path, '..'), 'r'); try { await parent.sync(); } finally { await parent.close(); }
        }
        await read(artifact);
        return artifact;
      } catch (error) {
        if (error instanceof VerificationError) throw error;
        throw new VerificationError('ARTIFACT_WRITE_FAILED', { cause: error });
      }
    },
  };
}
