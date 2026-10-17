import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { captureFixture, delivery } from '../../../../../tests/fixtures/capture.js';
import { createCheckMaterializer } from './materialize.js';
import { createReviewValidator } from './review.js';
import type { GitReader } from './git.js';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true }); });
async function fixture() {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  const root = await mkdtemp(join(process.cwd(), '.cache/review-')); directories.push(root);
  const f = await captureFixture(root); const content = await f.capture(f.input); const d = delivery(f.input, content);
  const tree = f.trees.get(d.contentIdentity!)!;
  let status = ''; let head = d.commitSha!; let afterHash: (() => Promise<void>) | undefined;
  const calls: { cwd: string; args: readonly string[] }[] = [];
  const git: GitReader = async (cwd, args, input) => {
    calls.push({ cwd, args });
    if (args.includes('clone')) { await mkdir(join(args.at(-1)!, '.git'), { recursive: true }); return { exitCode: 0, stdout: '' }; }
    if (args.includes('checkout')) {
      for (const [path, oid] of tree) await writeFile(join(cwd, path), f.blobs.get(oid)!);
      return { exitCode: 0, stdout: '' };
    }
    if (args.includes('HEAD^{tree}')) return { exitCode: 0, stdout: d.contentIdentity! };
    if (args.includes('FETCH_HEAD')) return { exitCode: 0, stdout: d.commitSha! };
    if (args.includes('HEAD')) return { exitCode: 0, stdout: head };
    if (args.includes('status')) return { exitCode: 0, stdout: status };
    if (args.includes('ls-tree')) return { exitCode: 0, stdout: [...tree].map(([path, oid]) => `100644 blob ${oid}\t${path}\0`).join('') };
    if (args.includes('hash-object')) {
      expect(args).not.toContain('-w');
      if (afterHash) { const action = afterHash; afterHash = undefined; await action(); }
      return { exitCode: 0, stdout: createHash('sha1').update(input!.input!).digest('hex') };
    }
    return f.run(cwd, args, input);
  };
  const id = randomUUID();
  const checkout = await createCheckMaterializer(root, git, async p => p, 'reviews')(d, id);
  const validate = () => createReviewValidator(root, git, async p => p)(d, id);
  return { ...f, d, id, checkout, calls, validate, git, setStatus: (s: string) => { status = s; }, setHead: (s: string) => { head = s; }, afterHash: (action: () => Promise<void>) => { afterHash = action; } };
}
it('materializes a private review checkout from retained content, preserves implementation and allows ignored caches', async () => {
  const f = await fixture(); const old = await readFile(join(f.implementation, 'tracked.txt'));
  expect(f.checkout).toContain(join('reviews', f.id, 'checkout'));
  await mkdir(join(f.checkout, 'cache')); await writeFile(join(f.checkout, 'cache', 'generated'), Buffer.alloc(1_048_576));
  expect(await f.validate()).toBe(true); expect(await readFile(join(f.implementation, 'tracked.txt'))).toEqual(old);
  expect(f.calls.every(c => c.cwd !== f.implementation)).toBe(true);
  await expect(createCheckMaterializer(f.root, f.git, async p => p, 'reviews')(f.d, f.id)).rejects.toMatchObject({ code: 'CHECK_MATERIALIZATION_FAILED' });
});
it('detects changed tracked bytes even if Git status hides the file through index flags', async () => {
  const f = await fixture(); f.setStatus(''); await writeFile(join(f.checkout, 'tracked.txt'), 'REVIEWER_EDIT');
  expect(await f.validate()).toBe(false);
});
it('detects removed tracked files as invalid independence', async () => {
  const f = await fixture(); await unlink(join(f.checkout, 'tracked.txt')); expect(await f.validate()).toBe(false);
});
it.each(['1 M. N... 100644 100644 100644 hash hash tracked.txt\0', '? new product.txt\0'])('refuses staged/product additions reported by status', async status => {
  const f = await fixture(); f.setStatus(status); expect(await f.validate()).toBe(false);
});
it('detects a reviewer commit/tree replacement and refuses a corrupt retained version', async () => {
  const f = await fixture(); f.setHead('f'.repeat(40)); expect(await f.validate()).toBe(false);
  f.setHead(f.d.commitSha!); f.refs.set(f.d.gitRef!, 'f'.repeat(40));
  await expect(f.validate()).rejects.toMatchObject({ code: 'DELIVERY_INTEGRITY_FAILED' });
});
it('detects a file changed after its bytes were read while another file is being validated', async () => {
  const f = await fixture();
  f.afterHash(async () => { await writeFile(join(f.checkout, 'tracked.txt'), 'CONCURRENT_REVIEW_EDIT'); });
  expect(await f.validate()).toBe(false);
});
it('fails closed without authorized Git context', async () => {
  const f = await fixture();
  await expect(createReviewValidator(f.root)(f.d, f.id)).rejects.toMatchObject({ code: 'CONTEXT_UNAVAILABLE' });
});
