import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { EffectView } from '#contracts';
import { captureFixture, delivery } from '../../../../../tests/fixtures/capture.js';
import { createLocalPublisher } from './publication.js';
import type { GitReader } from './git.js';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path,{ recursive: true }); });
async function fixture() {
  await mkdir(join(process.cwd(),'.cache'),{ recursive: true });
  const root = await mkdtemp(join(process.cwd(),'.cache','publication-')); directories.push(root);
  const f = await captureFixture(root); const d = delivery(f.input,await f.capture(f.input));
  const effect: EffectView = { operationId: randomUUID(),attemptId: d.attemptId,creationId: null,deliveryId: d.id,kind: 'local_commit',scopeKey: d.id,
    expectedIdentity: { repositoryId: 'R_test',issueId: 'I_test',issueNumber: 17,contentIdentity: d.contentIdentity!,parentSha: d.baseSha,branchRef: `refs/heads/factory/17/${d.attemptId}`,commitTime: 1792200000 },
    state: 'running',confirmedIdentity: null,receipt: null,reason: null,authorized: true,revision: 2,sentAtMs: 1792200000000,confirmedAtMs: null };
  const commits = new Map<string,{ tree: string; parent: string; message: string }>();
  const calls: { cwd: string; args: readonly string[]; commitTime: number | undefined }[] = [];
  let loseResponse = false; let forge = false; let noDelta = false;
  const git: GitReader = async (cwd,args,input) => {
    calls.push({ cwd,args,commitTime: input?.commitTime });
    const response = (stdout = '',exitCode = 0) => ({ stdout,exitCode });
    if (args.includes('clone')) { await mkdir(join(args.at(-1)!,'.git'),{ recursive: true }); return response(); }
    if (args.includes('fetch')) return response();
    if (args.includes('checkout')) {
      for (const [path,oid] of f.trees.get(d.contentIdentity!)!) await writeFile(join(cwd,path),f.blobs.get(oid)!);
      return response();
    }
    if (args.includes('FETCH_HEAD')) return response(d.commitSha!+'\n');
    if (args.includes('HEAD^{tree}')) return response(d.contentIdentity!+'\n');
    if (args.includes('status')) return response();
    if (noDelta && args.includes(`${d.baseSha}^{tree}`)) return response(d.contentIdentity!+'\n');
    if (args.includes('for-each-ref') && args.at(-1) === effect.expectedIdentity.branchRef) {
      const sha = f.refs.get(effect.expectedIdentity.branchRef!);
      return response(sha ? `${effect.expectedIdentity.branchRef}\0${sha}\0\n` : '');
    }
    if (args.includes('commit-tree')) {
      const tree = args[args.indexOf('commit-tree')+1]!; const parent = args[args.indexOf('-p')+1]!; const message = String(input?.input);
      const sha = createHash('sha1').update(tree+parent+message+input?.commitTime).digest('hex');
      commits.set(sha,{ tree,parent,message }); return response(sha+'\n');
    }
    if (args.includes('update-ref')) {
      const [ref,sha,old] = args.slice(args.indexOf('--no-deref')+1);
      expect(old).toBe('0'.repeat(40)); if (f.refs.has(ref!)) return response('',1);
      f.refs.set(ref!,sha!);
      if (loseResponse) throw new Error('CONTROLLED_RESPONSE_LOSS');
      return response();
    }
    if (args.includes('show')) {
      const commit = commits.get(args.at(-2)!)!;
      return response(`${commit.tree}\0${forge ? 'b'.repeat(40) : commit.parent}\0${commit.message}\n`);
    }
    return f.run(cwd,args,input);
  };
  const publisher = createLocalPublisher(root,git,async p => p, async () => root);
  return { ...f,d,effect,publisher,calls,commits,lose: () => { loseResponse = true; },forge: () => { forge = true; },noDelta: () => { noDelta = true; d.hasDelta = false; } };
}

it('publishes the approved tree in a private checkout after implementation removal, without recollecting bytes', async () => {
  const f = await fixture();
  await writeFile(join(f.implementation,'tracked.txt'),'MUTATED_LATER');
  await rm(f.implementation,{ recursive: true });
  let authorizations = 0;
  const result = await f.publisher.createLocalCommit(f.d,f.effect,async () => { authorizations++; });
  expect(result).toMatchObject({ state: 'confirmed',receipt: { contentIdentity: f.d.contentIdentity,parentSha: f.d.baseSha,operationId: f.effect.operationId } });
  const checkout = join(f.root,'work',f.d.attemptId,'publication',f.effect.operationId,'checkout');
  expect(await readFile(join(checkout,'tracked.txt'),'utf8')).toBe('changed tracked bytes\n');
  await expect(readFile(join(checkout,'cache','declared.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(f.calls.every(c => c.cwd !== f.implementation)).toBe(true);
  expect(f.calls.filter(c => c.args.includes('commit-tree'))).toHaveLength(1);
  expect(f.calls.find(c => c.args.includes('commit-tree'))?.commitTime).toBe(f.effect.expectedIdentity.commitTime);
  expect([...f.commits.values()][0]?.message).toContain(`Factory-Operation: ${f.effect.operationId}`);
  expect([...f.commits.values()][0]?.message).toMatch(/^feat: deliver issue #17\n/);
  expect(authorizations).toBe(1);
  expect(f.calls.some(c => c.args.some(a => ['push','add','commit'].includes(a)))).toBe(false);
});

it('reconciles a lost ref response by tree, parent and operation without creating another commit', async () => {
  const f = await fixture(); f.lose();
  expect((await f.publisher.createLocalCommit(f.d,f.effect,async () => {})).state).toBe('unknown');
  const count = f.calls.filter(c => c.args.includes('commit-tree')).length;
  expect((await f.publisher.reconcileLocalCommit(f.d,{ ...f.effect,state: 'unknown' })).state).toBe('confirmed');
  expect((await f.publisher.createLocalCommit(f.d,f.effect,async () => {})).state).toBe('confirmed');
  expect(f.calls.filter(c => c.args.includes('commit-tree'))).toHaveLength(count);
  f.forge(); expect((await f.publisher.reconcileLocalCommit(f.d,f.effect))).toMatchObject({ state: 'unknown',reason: 'COMMIT_IDENTITY_CONFLICT' });
});

it('skips an approved no-delta commit only after comparing the base tree', async () => {
  const f = await fixture(); f.noDelta();
  expect(await f.publisher.createLocalCommit(f.d,f.effect,async () => {})).toEqual({ state: 'not_applicable',receipt: null,reason: 'APPROVED_NO_DELTA' });
  expect(f.calls.some(c => c.args.includes('commit-tree') || c.args.includes('clone'))).toBe(false);
  f.d.hasDelta = true;
  expect((await f.publisher.createLocalCommit(f.d,f.effect,async () => {})).reason).toBe('DELIVERY_INTEGRITY_FAILED');
});

it('does not replay an unknown local mutation whose branch is not observed', async () => {
  const f = await fixture();
  expect((await f.publisher.createLocalCommit(f.d,{ ...f.effect,state: 'unknown' },async () => {})).state).toBe('unknown');
  expect(f.calls.some(c => c.args.includes('commit-tree') || c.args.includes('clone'))).toBe(false);
});

it.each(['ref','base','identity','authorization'])('refuses publication with an invalid %s', async target => {
  const f = await fixture();
  if (target === 'ref') f.refs.set(f.d.gitRef!,'f'.repeat(40));
  if (target === 'base') f.d.baseSha = 'b'.repeat(40);
  if (target === 'identity') f.effect.expectedIdentity.contentIdentity = 'c'.repeat(40);
  const result = await f.publisher.createLocalCommit(f.d,f.effect,async () => { if (target === 'authorization') throw new Error('REVOKED'); });
  expect(result.state).toBe('failed_known'); expect(f.commits.size).toBe(0);
});
