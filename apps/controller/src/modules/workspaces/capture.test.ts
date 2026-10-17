import { randomUUID } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureFixture as createFixture, delivery } from '../../../../../tests/fixtures/capture.js';
import { createDeliveryDiff, parseChanges } from './diff.js';
const paths: string[] = [];
afterEach(async () => { for (const path of paths.splice(0)) await rm(path, { recursive: true }); });
async function captureFixture() { const f = await createFixture(); paths.push(f.root); return f; }

describe('capture with controlled Git and real filesystem', () => {
  it('preserves executable modes from the implementation index when core.filemode is false', async () => {
    const f = await captureFixture(); f.setExecutable('tracked.txt');
    const result = await f.capture(f.input); expect(f.treeModes.get(result.contentIdentity)?.get('tracked.txt')).toBe('100755');
  });
  it('warns about declared known secrets without collecting their bytes', async () => {
    const f = await captureFixture(); const result = await f.capture({ ...f.input, declaredFiles: ['.env'] });
    expect(result.warnings).toMatchObject([{ path: '.env', reason: 'KNOWN_SECRET_EXCLUDED' }]);
    expect([...f.blobs.values()].every(bytes => !bytes.toString().includes('EXCLUDED_SECRET_BYTES'))).toBe(true);
  });
  it('excludes a file removed from tracking and now ignored even when it existed in the base', async () => {
    const f = await captureFixture(); f.removeTrackingAndIgnore('tracked.txt');
    const captured = await f.capture({ ...f.input, declaredFiles: ['tracked.txt'] });
    expect(f.trees.get(captured.contentIdentity)?.has('tracked.txt')).toBe(false);
    expect(captured.warnings).toMatchObject([{ path: 'tracked.txt', reason: 'DECLARED_NEW_FILE_IGNORED' }]);
    expect([...f.blobs.values()].some(bytes => bytes.toString().includes('changed tracked bytes'))).toBe(false);
    expect(await readFile(join(f.implementation, 'tracked.txt'), 'utf8')).toBe('changed tracked bytes\n');
  });
  it('diagnoses an implementation index lock before writing Git objects', async () => {
    const f = await captureFixture(); await writeFile(join(f.implementation, '.git/index.lock'), 'owned by external Git');
    await expect(f.capture(f.input)).rejects.toThrow('INDEX_LOCKED'); expect(f.refs.size).toBe(0);
    expect(f.calls.some(c => c.args.includes('hash-object'))).toBe(false);
  });
  it('marks unsupported text encoding explicitly instead of returning a corrupted or truncated patch', async () => {
    const f = await captureFixture(); const captured = await f.capture(f.input);
    const diff = createDeliveryDiff(f.root, async (cwd, args, input) => {
      if (args.includes('--unified=3')) throw new Error('GIT_ENCODING_UNSUPPORTED'); return f.run(cwd, args, input);
    }, async path => path);
    const result = await diff(delivery(f.input, captured), {});
    expect(result.entries.filter(e => !e.binary).every(e => e.unsupported === 'NON_UTF8_CONTENT' && e.patch === null)).toBe(true);
  });
  it('uses a separate base-initialized index, preserves implementation bytes and excludes ignored/known-secret bytes', async () => {
    const f = await captureFixture(); const index = await readFile(join(f.implementation, '.git/index'));
    const content = await f.capture(f.input); const captured = f.trees.get(content.contentIdentity)!;
    expect([...captured.keys()].sort()).toEqual(['binary.bin', 'new unicode ç.txt', 'renamed ç.txt', 'tracked.txt']);
    expect(await readFile(join(f.implementation, '.git/index'))).toEqual(index);
    expect(content.warnings).toEqual([{ attemptId: f.input.attemptId, passageId: f.input.passageId, deliveryId: f.input.deliveryId, path: 'cache/declared.txt', reason: 'DECLARED_NEW_FILE_IGNORED' }]);
    const stored = Buffer.concat([...f.blobs.values()]).toString();
    expect(stored).not.toContain('EXCLUDED_IGNORED_BYTES'); expect(stored).not.toContain('EXCLUDED_SECRET_BYTES');
    for (const call of f.calls.filter(c => c.args.includes('read-tree') || c.args.includes('update-index') || c.args.includes('write-tree'))) {
      expect(call.indexFile).toContain(`${f.input.attemptId}.git`); expect(call.indexFile).not.toBe(join(f.implementation, '.git/index'));
    }
    expect(f.calls.some(c => c.args.includes('update-ref') && c.args.at(-1) === '0'.repeat(40))).toBe(true);
    expect((await readdir(join(f.root, 'git', `${f.input.attemptId}.git`))).some(n => n.startsWith('factory-index-'))).toBe(false);
  });
  it.each(['file', 'index'] as const)('detects concurrent %s changes before creating an approvable ref', async kind => {
    const f = await captureFixture();
    if (kind === 'file') f.setConcurrent(() => writeFile(join(f.implementation, 'tracked.txt'), 'external writer'));
    else f.setExternalIndex();
    await expect(f.capture(f.input)).rejects.toThrow('CAPTURE_CONCURRENT_CHANGE'); expect(f.refs.size).toBe(0);
    expect(await readFile(join(f.implementation, 'tracked.txt'), 'utf8')).toContain(kind === 'file' ? 'external writer' : 'changed tracked');
  });
  it.each(['submodule', 'conflict', 'lfs', 'filter'] as const)('diagnoses %s before retaining/reviewing a version', async kind => {
    const f = await captureFixture();
    if (kind === 'submodule') f.setSubmodule();
    if (kind === 'conflict') f.setConflict();
    if (kind === 'lfs') await writeFile(join(f.implementation, 'tracked.txt'), 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n');
    if (kind === 'filter') { f.untracked.push('.gitattributes'); await writeFile(join(f.implementation, '.gitattributes'), '*.dat filter=lfs\n'); }
    await expect(f.capture(f.input)).rejects.toThrow(); expect(f.refs.size).toBe(0);
  });
  it('recovers an existing identical retained ref and refuses overwriting that version with different bytes', async () => {
    const f = await captureFixture(); const original = await f.capture(f.input);
    expect(await f.capture(f.input)).toEqual(original);
    await writeFile(join(f.implementation, 'tracked.txt'), 'another version');
    await expect(f.capture(f.input)).rejects.toThrow('CAPTURE_REF_CONFLICT'); expect(f.refs.get(original.gitRef)).toBe(original.commitSha);
  });
  it('loads paged text/binary diff from retained identity after implementation removal and rejects foreign cursors/ref changes', async () => {
    const f = await captureFixture(); const content = await f.capture(f.input); const view = delivery(f.input, content);
    await rm(f.implementation, { recursive: true });
    const first = await f.diff(view, { limit: '1' }); expect(first.hasMore).toBe(true); expect(first.entries[0]).toMatchObject({ binary: true, patch: null, unsupported: 'BINARY_CONTENT' });
    const all = [...first.entries]; let cursor = first.nextCursor;
    while (cursor) { const next = await f.diff(view, { limit: '1', cursor }); all.push(...next.entries); cursor = next.nextCursor; }
    expect(all.some(e => e.path === 'new unicode ç.txt' && e.patch?.includes('😀'))).toBe(true);
    await expect(f.diff({ ...view, id: randomUUID() }, { cursor: first.nextCursor! })).rejects.toThrow('DIFF_CURSOR_INVALID');
    f.refs.set(view.gitRef!, 'd'.repeat(40)); await expect(f.diff(view, {})).rejects.toThrow('DELIVERY_INTEGRITY_FAILED');
  });
  it('parses NUL names with spaces, Unicode, newline, rename and mode changes without line splitting', () => {
    const a = 'a'.repeat(40); const b = 'b'.repeat(40);
    const entries = parseChanges(`:100644 100755 ${a} ${b} M\0space ç\nname\0:100644 100644 ${a} ${a} R100\0old\nç\0new space\nç\0`);
    expect(entries[0]).toMatchObject({ path: 'space ç\nname', newMode: '100755' }); expect(entries[1]).toMatchObject({ oldPath: 'old\nç', path: 'new space\nç', status: 'R100' });
  });
});
