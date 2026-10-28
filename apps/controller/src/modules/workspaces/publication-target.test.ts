import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createPublicationTargetWorkspace, type TargetIdentity } from './publication-target.js';
import type { GitReader } from './git.js';
import { complete } from '../../../../../tests/fixtures/attempt.js';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path,{ recursive: true,force: true }); });
async function fixture() {
  const temporaryRoot = join(process.cwd(),'.cache'); await mkdir(temporaryRoot,{ recursive: true });
  const directory = await mkdtemp(join(temporaryRoot,'factory-target-')); directories.push(directory);
  const path = join(directory,'target');
  const repository = { id: 'R_target',owner: { id: 'O_target',login: 'test-org' },name: 'repo',url: 'https://github.com/test-org/repo',defaultBranch: 'main',isArchived: false,isPrivate: true };
  const git = vi.fn<GitReader>(async (cwd,args) => {
    if (args.includes('clone')) { await mkdir(join(cwd,'.git')); return { exitCode: 0,stdout: '' }; }
    if (args[0] === 'rev-parse') return { exitCode: 0,stdout: `${cwd}\n` };
    return { exitCode: 0,stdout: `${repository.url}.git\0` };
  });
  const github = { getRepository: vi.fn(async () => complete(repository)) };
  const workspace = createPublicationTargetWorkspace(github,git);
  const inspect = () => workspace.inspectPublicationTarget(path,repository.id,repository.url,'clone');
  return { directory,path,git,github,workspace,inspect };
}
it('reserves exclusively, persists the identity before clone and reconciles by reads', async () => {
  const f = await fixture(); const expected = await f.inspect();
  let reserved: TargetIdentity | null = null;
  f.git.mockImplementationOnce(async () => { expect(reserved?.directoryIdentity).toBeTruthy(); return { exitCode: 0,stdout: '' }; });
  const confirmed = await f.workspace.clonePublicationTarget(expected,identity => { reserved = identity; },() => {});
  expect(confirmed.directoryIdentity).toBeTruthy();
  await f.workspace.observePublicationTarget(confirmed);
  expect(f.git.mock.calls.filter(([,args]) => args.includes('clone'))).toHaveLength(1);
});
it('rejects an occupied destination and preserves user files', async () => {
  const f = await fixture(); const expected = await f.inspect();
  await mkdir(f.path); await writeFile(join(f.path,'personal.txt'),'preserve');
  await expect(f.workspace.clonePublicationTarget(expected,vi.fn(),() => {})).rejects.toMatchObject({ code: 'TARGET_OCCUPIED' });
  expect(await readFile(join(f.path,'personal.txt'),'utf8')).toBe('preserve'); expect(f.git).not.toHaveBeenCalled();
});
it('rejects parent replacement before writing', async () => {
  const f = await fixture(); const expected = await f.inspect();
  const moved = f.directory + '-moved'; directories.push(moved);
  await rename(f.directory,moved); await mkdir(f.directory);
  await expect(f.workspace.clonePublicationTarget(expected,vi.fn(),() => {})).rejects.toMatchObject({ code: 'TARGET_PARENT_CHANGED' });
  expect(f.git).not.toHaveBeenCalled();
});
it('refuses a replacement directory during reconciliation', async () => {
  const f = await fixture(); const expected = await f.inspect();
  const confirmed = await f.workspace.clonePublicationTarget(expected,() => {},() => {});
  await rename(f.path,f.path+'-original'); await mkdir(f.path);
  await expect(f.workspace.observePublicationTarget(confirmed)).rejects.toMatchObject({ code: 'TARGET_PATH_REPLACED' });
});
it('checks repository identity and preserves local work in an existing clone', async () => {
  const f = await fixture(); await mkdir(f.path); await writeFile(join(f.path,'work.txt'),'uncommitted');
  await f.workspace.inspectPublicationTarget(f.path,'R_target','https://github.com/test-org/repo','existing_clone');
  expect(await readFile(join(f.path,'work.txt'),'utf8')).toBe('uncommitted');
  await expect(f.workspace.inspectPublicationTarget(f.path,'R_other','https://github.com/test-org/repo','existing_clone')).rejects.toMatchObject({ code: 'TARGET_REPOSITORY_MISMATCH' });
  expect(f.git.mock.calls.every(([,args]) => !args.includes('clone'))).toBe(true);
});
