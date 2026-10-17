import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createArtifacts } from './artifacts.js';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true }); });
it('writes synced external evidence, verifies bytes and refuses checksum and binding changes', async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), '.cache', 'artifact-')); directories.push(directory);
  const files = createArtifacts(directory, async p => p);
  const artifact = await files.write({ attemptId: randomUUID(), deliveryId: randomUUID(), checkId: randomUUID() }, Buffer.from('ação 😀'));
  expect((await files.read(artifact)).toString()).toBe('ação 😀');
  await expect(files.read({ ...artifact, pathRelative: '../outside' })).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED' });
  await writeFile(join(directory, 'artifacts', artifact.pathRelative), 'other bytes');
  await expect(files.read(artifact)).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED' });
});
