import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureFixture, delivery } from '../../../../../tests/fixtures/capture.js';
import { createEnvironmentRecovery } from './recovery.js';
import type { GitReader } from './git.js';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true }); });
async function fixture() {
  // Every deletion in this test is confined to an exclusively created fixture inside .cache.
  const cache = resolve('.cache'); await mkdir(cache, { recursive: true });
  const root = mkdtempSync(resolve(cache, 'recovery-test-')); directories.push(root);
  const f = await captureFixture(root); const content = await f.capture(f.input); const retained = delivery(f.input, content);
  await unlink(resolve(f.implementation, '.env'));
  const run: GitReader = async (cwd, args, options) => {
    if (args.includes('ls-tree') && args.at(-1) === retained.commitSha) {
      const tree = f.trees.get(retained.contentIdentity!)!;
      return { exitCode: 0, stdout: [...tree].map(([name, hash]) => `100644 blob ${hash}\t${name}\0`).join('') };
    }
    if (args.includes('ls-files')) return { exitCode: 0, stdout: [...new Set([...f.base.keys(), ...f.untracked])].map(x => x + '\0').join('') };
    return f.run(cwd, args, options);
  };
  const open = vi.fn(async () => {});
  const recovery = createEnvironmentRecovery(root, run, open, async p => p, async () => root);
  return { ...f, root, retained, run, open, recovery };
}
describe('bounded environment recovery with real fixture files and controlled Git', () => {
  it('deletes exactly the confirmed implementation and preserves retained metadata, evidence and neighboring environments', async () => {
    const f = await fixture(); const evidence = resolve(f.root, 'artifacts', 'keep.log');
    await mkdir(resolve(f.root, 'artifacts')); await writeFile(evidence, 'historical evidence');
    const other = resolve(f.root, 'work', randomUUID()); await mkdir(other); await writeFile(resolve(other, 'keep.txt'), 'manual neighbor');
    const gitBefore = await readFile(resolve(f.root, 'git', `${f.input.attemptId}.git`, 'factory-owner'));
    const plan = await f.recovery.inspectEnvironment(f.input.attemptId, [f.retained]);
    expect(plan).toMatchObject({ exists: true, contentSafe: true, reason: null });
    const gate = vi.fn(); await f.recovery.removeEnvironment(f.input.attemptId, [f.retained], plan.stamp, gate);
    expect(existsSync(f.implementation)).toBe(false); expect(gate).toHaveBeenCalled();
    expect(await readFile(evidence, 'utf8')).toBe('historical evidence'); expect(await readFile(resolve(other, 'keep.txt'), 'utf8')).toBe('manual neighbor');
    expect(await readFile(resolve(f.root, 'git', `${f.input.attemptId}.git`, 'factory-owner'))).toEqual(gitBefore);
    expect(f.refs.get(f.retained.gitRef!)).toBe(f.retained.commitSha);
    expect((await f.recovery.inspectEnvironment(f.input.attemptId, [f.retained])).exists).toBe(false);
  });
  it('invalidates a plan when ignored files change and preserves uncaptured product bytes', async () => {
    const f = await fixture(); const plan = await f.recovery.inspectEnvironment(f.input.attemptId, [f.retained]);
    await writeFile(resolve(f.implementation, 'cache', 'declared.txt'), 'new ignored bytes');
    await expect(f.recovery.removeEnvironment(f.input.attemptId, [f.retained], plan.stamp, () => {})).rejects.toMatchObject({ code: 'REMOVAL_PLAN_CHANGED' });
    const current = await f.recovery.inspectEnvironment(f.input.attemptId, [f.retained]);
    await writeFile(resolve(f.implementation, 'tracked.txt'), 'new product bytes at risk');
    expect((await f.recovery.inspectEnvironment(f.input.attemptId, [f.retained])).contentSafe).toBe(false);
    await expect(f.recovery.removeEnvironment(f.input.attemptId, [f.retained], current.stamp, () => {})).rejects.toMatchObject({ code: 'RETAINED_CONTENT_AT_RISK' });
    expect(await readFile(resolve(f.implementation, 'tracked.txt'), 'utf8')).toBe('new product bytes at risk');
  });
  it('refuses missing/corrupt refs, unsupported paths, or a gate revoked during deletion', async () => {
    const f = await fixture(); const plan = await f.recovery.inspectEnvironment(f.input.attemptId, [f.retained]);
    const ref = f.refs.get(f.retained.gitRef!)!; f.refs.delete(f.retained.gitRef!);
    expect((await f.recovery.inspectEnvironment(f.input.attemptId, [f.retained])).contentSafe).toBe(false);
    f.refs.set(f.retained.gitRef!, ref);
    await expect(f.recovery.removeEnvironment(f.input.attemptId, [f.retained], plan.stamp, () => { throw new Error('revoked'); })).rejects.toThrow('revoked');
    expect(existsSync(f.implementation)).toBe(true);
    await expect(f.recovery.openEnvironment('../operator')).rejects.toMatchObject({ code: 'RESOURCE_PATH_INVALID' });
    expect(f.open).not.toHaveBeenCalled();
  });
  it('opens only the fixed registered path, rechecks existence and reports unsupported native context', async () => {
    const f = await fixture(); await f.recovery.openEnvironment(f.input.attemptId);
    expect(f.open).toHaveBeenCalledExactlyOnceWith(f.implementation);
    const unsupported = createEnvironmentRecovery(f.root, f.run, undefined, async p => p, async () => f.root);
    expect(await unsupported.folderCapability(f.input.attemptId)).toEqual({ available: false, reason: 'NATIVE_OPEN_UNAVAILABLE' });
    await expect(unsupported.openEnvironment(f.input.attemptId)).rejects.toMatchObject({ code: 'NATIVE_OPEN_UNAVAILABLE' });
    expect((await unsupported.folderCapability(randomUUID())).available).toBe(false);
  });
  it('rejects controlled canonical redirection without touching a neighboring manual directory', async () => {
    const f = await fixture(); const outside = resolve(f.root, 'manual'); await mkdir(outside); await writeFile(resolve(outside, 'keep.txt'), 'keep');
    const redirected = resolve(f.implementation, 'redirect'); await mkdir(redirected);
    const recovery = createEnvironmentRecovery(f.root, f.run, undefined, async p => p === redirected ? outside : p, async () => f.root);
    await expect(recovery.inspectEnvironment(f.input.attemptId, [f.retained])).rejects.toMatchObject({ code: 'MANAGED_PATH_INVALID' });
    expect(await readFile(resolve(outside, 'keep.txt'), 'utf8')).toBe('keep');
  });
});
