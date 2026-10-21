import { afterEach, describe, expect, it } from 'vitest';
import { lstat, mkdir, mkdtemp, open, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { observeWindowsReference, removeWindowsReference } from '../../apps/controller/src/modules/workspaces/windows-reference.js';
import { createDeletionInspector, windowsReferenceDeletionPlatform } from '../../apps/controller/src/modules/workspaces/deletion.js';

const fixtures: string[] = [];
const cache = resolve('.cache');
afterEach(async () => {
  for (const base of fixtures.splice(0)) {
    const absolute = resolve(base);
    if (!absolute.startsWith(`${cache}${sep}reference-proof-`)) throw new Error('FIXTURE_CLEANUP_OUTSIDE_BOUNDARY');
    // Only disposable roots created by this suite; rm never follows leaf links.
    await rm(absolute, { recursive: true });
  }
});
async function fixture() {
  await mkdir(cache, { recursive: true });
  const base = await mkdtemp(join(cache, 'reference-proof-'));
  fixtures.push(base);
  const target = join(base, 'authorized');
  const outside = join(base, 'shared');
  await mkdir(target);
  await mkdir(outside);
  await writeFile(join(outside, 'preserve.txt'), 'shared and sibling data');
  return { base, target, outside };
}
async function expectRenameBlocked(source: string, destination: string) {
  let failure: unknown;
  try { await rename(source, destination); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect(failure && typeof failure === 'object' && 'code' in failure ? failure.code : null)
    .toMatch(/^(EPERM|EACCES|EBUSY)$/u);
}

describe.skipIf(process.platform !== 'win32')('Windows handle reference platform (mandatory host qualification)', () => {
  it('protects ancestors of an absent target without claiming to reserve its empty name', async () => {
    const f = await fixture();
    const missing = join(f.base, 'missing');
    const observation = await observeWindowsReference(missing, async () => {
      await expectRenameBlocked(f.base, `${f.base}-moved`);
      // Directory share locks protect the ancestor identity, not absent child names.
      await mkdir(missing);
      await writeFile(join(missing, 'replacement.txt'), 'preserve');
    });
    expect(observation.kind).toBe('absent');
    expect((await observeWindowsReference(missing)).kind).toBe('directory');
    expect(await readFile(join(missing, 'replacement.txt'), 'utf8')).toBe('preserve');
  }, 30_000);
  it('observes protected files already open for writing without acquiring deletion authority', async () => {
    const f = await fixture();
    const file = join(f.outside, 'preserve.txt');
    const writer = await open(file, 'r+');
    try {
      expect((await observeWindowsReference(file)).kind).toBe('file');
    } finally { await writer.close(); }
  });
  it('proves absence below an uncreated container and detects a replacement ancestor', async () => {
    const f = await fixture();
    const container = join(f.base, 'uncreated');
    const missing = join(container, 'leaf');
    const expected = await observeWindowsReference(missing);
    expect(expected.kind).toBe('absent');
    expect(expected.ancestors.at(-1)?.path).toBe(f.base);
    await mkdir(container);
    await writeFile(join(container, 'preserve.txt'), 'replacement');
    await expect(removeWindowsReference(expected)).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' });
    expect(await readFile(join(container, 'preserve.txt'), 'utf8')).toBe('replacement');
  });
  it('removes git, ignored, personal, unpublished and post-authorization additions without a persisted inventory', async () => {
    const f = await fixture();
    await mkdir(join(f.target, '.git', 'objects'), { recursive: true });
    await mkdir(join(f.target, 'node_modules'));
    for (const name of ['.git/objects/unpublished', '.gitignore', 'node_modules/cache', 'personal.txt', 'uncommitted.ts']) {
      await writeFile(join(f.target, name), 'fixture contents');
    }
    const expected = await observeWindowsReference(f.target);
    expect(JSON.stringify(expected)).not.toContain('uncommitted');
    await writeFile(join(f.target, 'added-after-acceptance.txt'), 'also authorized');
    await removeWindowsReference(expected);
    expect((await observeWindowsReference(f.target)).kind).toBe('absent');
    expect(await readFile(join(f.outside, 'preserve.txt'), 'utf8')).toBe('shared and sibling data');
  }, 30_000);

  it('holds the object, its ancestor and each descendant against replacement immediately beside effects', async () => {
    const f = await fixture();
    const child = join(f.target, 'personal.txt');
    await writeFile(child, 'owned');
    // Positive controls: these operations work before the native boundary is
    // held, so an unrelated rename restriction cannot satisfy the race proof.
    await rename(child, join(f.target, 'baseline'));
    await rename(join(f.target, 'baseline'), child);
    await rename(f.target, join(f.base, 'baseline'));
    await rename(join(f.base, 'baseline'), f.target);
    const expected = await observeWindowsReference(f.target);
    const seen: string[] = [];
    await removeWindowsReference(expected, async effect => {
      seen.push(effect);
      await expectRenameBlocked(f.target, join(f.base, 'moved'));
      await expectRenameBlocked(f.base, `${f.base}-moved`);
      if (effect === child) await expectRenameBlocked(child, join(f.target, 'substitute'));
      expect(await readFile(join(f.outside, 'preserve.txt'), 'utf8')).toBe('shared and sibling data');
    });
    expect(seen).toEqual([child, f.target]);
    expect((await observeWindowsReference(f.target)).kind).toBe('absent');
  }, 30_000);

  it('preserves a substitute and the moved original, then recognizes absence without searching for the original', async () => {
    const f = await fixture();
    await writeFile(join(f.target, 'private.txt'), 'original');
    const expected = await observeWindowsReference(f.target);
    const moved = join(f.base, 'moved');
    await rename(f.target, moved);
    await mkdir(f.target);
    await writeFile(join(f.target, 'private.txt'), 'substitute');
    await expect(removeWindowsReference(expected)).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' });
    expect(await readFile(join(f.target, 'private.txt'), 'utf8')).toBe('substitute');
    const withdrawn = join(f.base, 'withdrawn');
    await rename(f.target, withdrawn);
    await removeWindowsReference(expected);
    expect(await readFile(join(moved, 'private.txt'), 'utf8')).toBe('original');
    expect(await readFile(join(withdrawn, 'private.txt'), 'utf8')).toBe('substitute');
  }, 30_000);

  it('blocks additions adjacent to final directory disposition, then removes them on retry under the same root identity', async () => {
    const f = await fixture();
    const expected = await observeWindowsReference(f.target);
    await expect(removeWindowsReference(expected, async () => {
      await writeFile(join(f.target, 'late.txt'), 'late addition');
    })).rejects.toMatchObject({ code: 'ENOTEMPTY' });
    expect(await readFile(join(f.target, 'late.txt'), 'utf8')).toBe('late addition');
    await removeWindowsReference(expected);
    expect((await observeWindowsReference(f.target)).kind).toBe('absent');
  }, 30_000);

  it('blocks a file held for writing, preserves its contents and allows retry after release', async () => {
    const f = await fixture();
    const child = join(f.target, 'locked.txt');
    await writeFile(child, 'preserve while locked');
    const expected = await observeWindowsReference(f.target);
    const writer = await open(child, 'r+');
    try {
      await expect(removeWindowsReference(expected)).rejects.toMatchObject({ code: 'EBUSY' });
      expect(await readFile(child, 'utf8')).toBe('preserve while locked');
    } finally { await writer.close(); }
    await removeWindowsReference(expected);
    expect((await observeWindowsReference(f.target)).kind).toBe('absent');
  }, 30_000);

  it('blocks a descendant swap or opens the replacement as a link without following it', async () => {
    const f = await fixture();
    const trigger = join(f.target, 'a-trigger.txt');
    const descendant = join(f.target, 'z-descendant');
    const moved = join(f.base, 'moved-descendant');
    await writeFile(trigger, 'trigger');
    await mkdir(descendant);
    await writeFile(join(descendant, 'unpublished.txt'), 'moved data');
    await rename(descendant, moved);
    await rename(moved, descendant);
    const expected = await observeWindowsReference(f.target);
    let replaced = false;
    let blocked = false;
    await removeWindowsReference(expected, async effect => {
      if (effect !== trigger) return;
      try { await rename(descendant, moved); }
      catch (error) {
        expect(error).toMatchObject({ code: expect.stringMatching(/^(EPERM|EACCES|EBUSY)$/u) });
        expect(await readFile(join(descendant, 'unpublished.txt'), 'utf8')).toBe('moved data');
        blocked = true;
        return;
      }
      await symlink(f.outside, descendant, 'dir');
      replaced = true;
    });
    expect(replaced || blocked).toBe(true);
    expect((await observeWindowsReference(f.target)).kind).toBe('absent');
    if (replaced) expect(await readFile(join(moved, 'unpublished.txt'), 'utf8')).toBe('moved data');
    else await expect(lstat(moved)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(f.outside, 'preserve.txt'), 'utf8')).toBe('shared and sibling data');
  }, 30_000);

  it.each(['junction', 'dir', 'file'] as const)('removes descendant %s as a link and preserves its destination and sibling', async type => {
    const f = await fixture();
    const destination = type === 'file' ? join(f.outside, 'preserve.txt') : f.outside;
    const link = join(f.target, 'link');
    // EPERM here is a FAILED qualification, never a successful link proof.
    await symlink(destination, link, type);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    const expected = await observeWindowsReference(f.target);
    await removeWindowsReference(expected);
    expect((await observeWindowsReference(f.target)).kind).toBe('absent');
    expect(await readFile(join(f.outside, 'preserve.txt'), 'utf8')).toBe('shared and sibling data');
  }, 30_000);

  it.each(['junction', 'dir', 'file'] as const)('removes a root %s as a link without traversing its destination', async type => {
    const f = await fixture();
    const path = join(f.base, 'root-link');
    await symlink(type === 'file' ? join(f.outside, 'preserve.txt') : f.outside, path, type);
    await removeWindowsReference(await observeWindowsReference(path));
    await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(f.outside, 'preserve.txt'), 'utf8')).toBe('shared and sibling data');
  }, 30_000);

  it.each(['junction', 'dir'] as const)('blocks absence under an unsafe %s ancestor before any removal', async type => {
    const f = await fixture();
    const linked = join(f.base, 'ancestor-link');
    await symlink(f.outside, linked, type);
    await expect(observeWindowsReference(join(linked, 'absent'))).rejects.toMatchObject({ code: 'UNSAFE' });
    expect(await readFile(join(f.outside, 'preserve.txt'), 'utf8')).toBe('shared and sibling data');
  }, 30_000);

  it('rechecks a removed target and blocks a newly appearing object', async () => {
    const f = await fixture();
    const expected = await observeWindowsReference(f.target);
    await removeWindowsReference(expected);
    await mkdir(f.target);
    await writeFile(join(f.target, 'replacement.txt'), 'preserve');
    await expect(removeWindowsReference(expected)).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' });
    expect(await readFile(join(f.target, 'replacement.txt'), 'utf8')).toBe('preserve');
  }, 30_000);

  it('drives the workspaces removal operation against the real candidate, then proves absence', async () => {
    const f = await fixture();
    await writeFile(join(f.target, 'personal.txt'), 'authorized');
    const inspector = createDeletionInspector(windowsReferenceDeletionPlatform());
    const projectId = '00000000-0000-4000-8000-000000000001';
    const input = { projectId, projectName: 'Fixture', projectRevision: 1, sourceKind: 'local' as const,
      inventoryVersion: 'a'.repeat(64), blockers: [], protectedPaths: [], originalProtectedPaths: [], containers: [],
      targets: [{ key: 'original', kind: 'original_directory' as const, path: f.target,
        ownerKind: 'project' as const, ownerId: projectId }] };
    const authorization = await inspector.inspectProjectDeletion(input);
    expect(authorization.preview.can_confirm).toBe(true);
    const result = await inspector.removeProjectDeletion(input, authorization);
    expect(result.preview.can_confirm).toBe(true);
    expect(result.preview.targets[0]?.state).toBe('removed');
    expect(await readFile(join(f.outside, 'preserve.txt'), 'utf8')).toBe('shared and sibling data');
  }, 30_000);

  it('exposes the qualified Windows reference platform without a test capability override', () => {
    expect(createDeletionInspector(windowsReferenceDeletionPlatform()).projectDeletionCapability().available).toBe(true);
  });
});
