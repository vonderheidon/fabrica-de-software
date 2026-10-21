import { expect, it } from 'vitest';
import { mkdir, mkdtemp, rmdir, symlink, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { nativeDeletionInspectionPlatform } from './deletion.js';

it('recognizes absence below an uncreated managed container without inventing ancestors', async () => {
  const cache = resolve('.cache');
  await mkdir(cache, { recursive: true });
  const base = await mkdtemp(join(cache, 'absence-proof-'));
  try {
    const observation = await nativeDeletionInspectionPlatform().observe(join(base, 'not-created', 'target'));
    expect(observation).toMatchObject({ kind: 'absent', identity: null, resolvedPath: null });
    expect(observation.ancestors.at(-1)?.path).toBe(base);
  } finally { await rmdir(base); }
});

it('does not confuse an ancestor link with an absent managed container', async () => {
  const cache = resolve('.cache');
  await mkdir(cache, { recursive: true });
  const base = await mkdtemp(join(cache, 'absence-proof-'));
  const link = join(base, 'link');
  try {
    await symlink(base, link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(nativeDeletionInspectionPlatform().observe(join(link, 'missing'))).rejects.toThrow('DELETION_ANCESTOR_UNSAFE');
  } finally { await unlink(link); await rmdir(base); }
});
