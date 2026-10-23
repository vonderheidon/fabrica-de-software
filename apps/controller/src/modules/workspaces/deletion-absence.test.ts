import { expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { nativeDeletionInspectionPlatform } from './deletion.js';

const { unsafeAncestors } = vi.hoisted(() => ({ unsafeAncestors: new Set<string>() }));
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, lstat: async (path: string, options?: { bigint?: boolean }) => {
    const stat = await original.lstat(path, options?.bigint ? { bigint: true } : { bigint: false });
    if (unsafeAncestors.has(path)) stat.isSymbolicLink = () => true;
    return stat;
  } };
});

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

it('does not confuse an ancestor reported as a link with an absent managed container (controlled lstat)', async () => {
  const cache = resolve('.cache');
  await mkdir(cache, { recursive: true });
  const base = await mkdtemp(join(cache, 'absence-proof-'));
  const link = join(base, 'link');
  try {
    // Real junction creation belongs to the opt-in native proof suite. Keep the
    // safety branch deterministic here without requiring OS link privileges.
    await mkdir(link);
    unsafeAncestors.add(link);
    await expect(nativeDeletionInspectionPlatform().observe(join(link, 'missing'))).rejects.toThrow('DELETION_ANCESTOR_UNSAFE');
  } finally { unsafeAncestors.delete(link); await rmdir(link); await rmdir(base); }
});
