import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { captureFixture, delivery } from '../../../../../tests/fixtures/capture.js';
import { createCheckMaterializer } from './materialize.js';
import type { GitReader } from './git.js';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true }); });
it('materializes only the retained commit in an exclusively reserved checkout, independent of implementation', async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true }); const root = await mkdtemp(join(process.cwd(), '.cache/materialize-')); directories.push(root);
  const f = await captureFixture(root); const content = await f.capture(f.input); const d = delivery(f.input, content);
  await writeFile(join(f.implementation, 'tracked.txt'), 'MUTATED_AFTER_CAPTURE');
  const calls: { cwd: string; args: readonly string[] }[] = [];
  const git: GitReader = async (cwd, args, options) => {
    calls.push({ cwd, args });
    if (args.includes('clone')) { await mkdir(join(args.at(-1)!, '.git'), { recursive: true }); return { exitCode: 0, stdout: '' }; }
    if (args.includes('checkout')) {
      expect(args).toContain(d.commitSha);
      for (const [path, oid] of f.trees.get(d.contentIdentity!)!) await writeFile(join(cwd, path), f.blobs.get(oid)!);
      return { exitCode: 0, stdout: '' };
    }
    if (args.includes('HEAD^{tree}')) return { exitCode: 0, stdout: d.contentIdentity! + '\n' };
    if (args.includes('FETCH_HEAD')) return { exitCode: 0, stdout: d.commitSha! + '\n' };
    if (args.includes('status')) return { exitCode: 0, stdout: '' };
    return f.run(cwd, args, options);
  };
  const materialize = createCheckMaterializer(root, git, async p => p); const id = randomUUID(); const path = await materialize(d, id);
  expect((await readFile(join(path, 'tracked.txt'), 'utf8'))).toBe('changed tracked bytes\n');
  expect(calls.every(c => c.cwd !== f.implementation)).toBe(true);
  expect(calls.find(c => c.args.includes('clone'))?.args).toEqual(expect.arrayContaining(['--no-local', '--no-hardlinks', '--no-checkout', resolve(root, 'git', `${d.attemptId}.git`)]));
  expect(calls.find(c => c.args.includes('fetch'))?.args).toContain(d.gitRef);
  await expect(materialize(d, id)).rejects.toMatchObject({ code: 'CHECK_MATERIALIZATION_FAILED' });
  f.refs.set(d.gitRef!, 'f'.repeat(40));
  await expect(materialize(d, randomUUID())).rejects.toMatchObject({ code: 'DELIVERY_INTEGRITY_FAILED' });
});
