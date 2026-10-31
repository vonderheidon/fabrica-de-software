import { lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { captureFixture, delivery } from '../../../../../tests/fixtures/capture.js';
import { createAttemptMaterializer } from './materialize.js';

const paths: string[] = [];
afterEach(async () => { for (const path of paths.splice(0)) await rm(path, { recursive: true }); });
it('shares one checkout and imports the captured review ref once without changing its index', async () => {
  const f = await captureFixture(); paths.push(f.root);
  const version = delivery(f.input, await f.capture(f.input));
  const materialize = createAttemptMaterializer(f.root, f.run, async path => path, async () => f.root, async () => f.implementation);
  const before = f.calls.length;
  const indexBefore = await readFile(join(f.implementation, '.git/index'));
  expect(await materialize(version, randomUUID())).toBe(f.implementation);
  expect(await materialize(version, randomUUID())).toBe(f.implementation);
  expect(f.calls.slice(before).some(c => c.args.some(a => ['clone','update-index','update-ref','write-tree','commit-tree','checkout','reset'].includes(a)))).toBe(false);
  expect(f.calls.slice(before).filter(c => c.args.includes('fetch'))).toHaveLength(1);
  expect(f.refs.get(`refs/factory/review-deliveries/${version.id}`)).toBe(version.commitSha);
  expect(await readFile(join(f.implementation, '.git/index'))).toEqual(indexBefore);
  f.refs.set(`refs/factory/review-deliveries/${version.id}`, 'f'.repeat(40));
  await expect(materialize(version, randomUUID())).rejects.toThrow('DELIVERY_INTEGRITY_FAILED');
  await expect(lstat(join(f.root, 'work', f.input.attemptId, 'reviews'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('refuses tracked, binary and new-file changes after capture without changing the retained version', async () => {
  const f = await captureFixture(); paths.push(f.root);
  const version = delivery(f.input, await f.capture(f.input));
  const materialize = createAttemptMaterializer(f.root, f.run, async path => path, async () => f.root, async () => f.implementation);
  await writeFile(join(f.implementation, 'binary.bin'), Buffer.from([0, 255, 9]));
  await expect(materialize(version, randomUUID())).rejects.toThrow('DELIVERY_INTEGRITY_FAILED');
  await writeFile(join(f.implementation, 'binary.bin'), Buffer.from([0, 255, 1, 2]));
  await writeFile(join(f.implementation, 'tracked.txt'), 'unauthorized change');
  await expect(materialize(version, randomUUID())).rejects.toThrow('DELIVERY_INTEGRITY_FAILED');
  await writeFile(join(f.implementation, 'tracked.txt'), 'changed tracked bytes\n');
  f.untracked.push('unexpected.txt'); await writeFile(join(f.implementation, 'unexpected.txt'), 'new');
  await expect(materialize(version, randomUUID())).rejects.toThrow('DELIVERY_INTEGRITY_FAILED');
  expect(f.refs.get(version.gitRef!)).toBe(version.commitSha);
});
