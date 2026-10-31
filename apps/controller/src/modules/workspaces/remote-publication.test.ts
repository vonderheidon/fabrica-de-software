import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { EffectView } from '#contracts';
import { captureFixture, delivery } from '../../../../../tests/fixtures/capture.js';
import { createRemotePublisher } from './remote-publication.js';
import type { GitReader } from './git.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root,{ recursive: true }); });
async function fixture(inherited = false) {
  await mkdir(join(process.cwd(),'.cache'),{ recursive: true }); const root = await mkdtemp(join(process.cwd(),'.cache','push ç-')); roots.push(root);
  const f = await captureFixture(root); const d = delivery(f.input,await f.capture(f.input)); const sha = 'c'.repeat(40); const commitOperationId = randomUUID();
  const branchRef = `refs/heads/factory/17/${d.attemptId}`; f.refs.set(branchRef,sha);
  const effect: EffectView = { operationId: randomUUID(),attemptId: d.attemptId,creationId: null,deliveryId: d.id,kind: 'push',scopeKey: d.id,state: 'running',authorized: true,
    expectedIdentity: { repositoryId: 'R',issueId: 'I',issueNumber: 17,repositoryOwner: 'org',repositoryName: 'repo',contentIdentity: d.contentIdentity!,parentSha: d.baseSha,commitSha: sha,commitOperationId,branchRef,baseBranch: 'main' },
    receipt: null,confirmedIdentity: null,reason: null,revision: 2,sentAtMs: 1,confirmedAtMs: null };
  if (inherited) Object.assign(effect.expectedIdentity,{parentSha:'e'.repeat(40),targetOperationId:randomUUID(),taskType:'feat',taskDescription:'Inherited issue'});
  let remote: string | null = null; let lost = false; let config = false; let wrongParent = false;
  const git = vi.fn<GitReader>(async (cwd,args,input) => {
    if (args.includes('show')) return { exitCode: 0,stdout: `${d.contentIdentity}\0${wrongParent ? 'f'.repeat(40) : effect.expectedIdentity.parentSha}\0${inherited ? 'feat: Inherited issue (#17)' : 'feat: deliver issue #17'}\n\nFactory-Attempt: ${d.attemptId}\nFactory-Delivery: ${d.id}\nFactory-Operation: ${commitOperationId}\n${inherited ? `Factory-Target: ${effect.expectedIdentity.targetOperationId}\n` : ''}` };
    if (args.includes('--get-regexp')) return { exitCode: config ? 0 : 1,stdout: config ? 'url.rewrite.insteadof https://github.com/' : '' };
    if (args.includes('ls-remote')) return { exitCode: 0,stdout: remote ? `${remote}\t${branchRef}\n` : '' };
    if (args.includes('push')) { remote = sha; if (lost) throw new Error('PRIVATE_RESPONSE_LOSS'); return { exitCode: 0,stdout: '' }; }
    return f.run(cwd,args,input);
  });
  const publisher = createRemotePublisher(root,git,{ accountId: 'A',repositoryIds: ['R'] },async p => p, undefined, async () => root);
  return { ...f,d,effect,sha,git,publisher,remote: (sha: string | null) => { remote = sha; },lose: () => { lost = true; },config: () => { config = true; },wrongParent: () => { wrongParent = true; } };
}

it('pushes the exact sealed publication parent for inherited content and rejects a different observed parent', async () => {
  const f = await fixture(true);
  const authorize = vi.fn(async () => {});
  expect(f.effect.expectedIdentity.parentSha).not.toBe(f.d.baseSha);
  f.wrongParent();
  expect(await f.publisher.pushApproved(f.d,f.effect,'A',authorize)).toMatchObject({state:'failed_known',reason:'PUSH_IDENTITY_INVALID'});
  expect(authorize).not.toHaveBeenCalled();
  const correct = await fixture(true);
  expect(await correct.publisher.pushApproved(correct.d,correct.effect,'A',authorize)).toMatchObject({state:'confirmed'});
  expect(authorize).toHaveBeenCalledOnce();
});

it('publishes a confirmed attempt without a static repository grant and rechecks revocation', async () => {
  const f = await fixture();
  const publisher = createRemotePublisher(f.root,f.git,undefined,async p => p,{ kind: 'confirmed_attempt' }, async () => f.root);
  expect(await publisher.pushApproved(f.d,f.effect,'A',async () => { throw new Error('REVOKED'); })).toMatchObject({ state: 'failed_known' });
  expect(f.git.mock.calls.some(([,args]) => args.includes('push'))).toBe(false);
  const authorize = vi.fn(async () => {});
  expect(await publisher.pushApproved(f.d,f.effect,'A',authorize)).toMatchObject({ state: 'confirmed' });
  expect(authorize).toHaveBeenCalledOnce();
  expect(await publisher.pushApproved(f.d,f.effect,'A',authorize)).toMatchObject({ state: 'confirmed' });
  expect(f.git.mock.calls.filter(([,args]) => args.includes('push'))).toHaveLength(1);
});

it('pushes a single explicit approved SHA/ref to the authorized HTTPS repository then confirms readback', async () => {
  const f = await fixture(); const index = await readFile(join(f.implementation,'.git/index')); const authorize = vi.fn(async () => {});
  const r = await f.publisher.pushApproved(f.d,f.effect,'A',authorize);
  expect(r).toMatchObject({ state: 'confirmed',receipt: { id: f.sha,commitSha: f.sha,branchRef: f.effect.expectedIdentity.branchRef,repositoryId: 'R' } });
  const push = f.git.mock.calls.find(([,args]) => args.includes('push'))!;
  expect(push[1].slice(push[1].indexOf('push'))).toEqual(['push','--porcelain','--no-follow-tags','--recurse-submodules=no','https://github.com/org/repo.git',`${f.sha}:${f.effect.expectedIdentity.branchRef}`]);
  expect(f.git.mock.calls.filter(([,args]) => args.includes('ls-remote'))).toHaveLength(2); expect(authorize).toHaveBeenCalledOnce();
  expect(f.git.mock.calls.every(([cwd,args]) => cwd !== f.implementation && !args.some(x => /^(?:--force|-f|\+)/.test(x)))).toBe(true);
  expect(await readFile(join(f.implementation,'.git/index'))).toEqual(index);
});

it.each([true,false])('updates an existing remote branch only for a fast-forward: %s', async ancestor => {
  const f = await fixture(); f.remote('d'.repeat(40));
  const git: GitReader = async (cwd,args,input) => {
    if (args.includes('fetch')) return { exitCode:0,stdout:'' };
    if (args.includes('merge-base')) return { exitCode:ancestor ? 0 : 1,stdout:'' };
    return f.git(cwd,args,input);
  };
  const publisher = createRemotePublisher(f.root,git,{ accountId:'A',repositoryIds:['R'] },async path => path, undefined, async () => f.root);
  const effect = { ...f.effect,expectedIdentity:{ ...f.effect.expectedIdentity,branchKind:'existing' as const } };
  const result = await publisher.pushApproved(f.d,effect,'A',async () => {});
  expect(result.state).toBe(ancestor ? 'confirmed' : 'failed_known');
  expect(f.git.mock.calls.filter(([,args]) => args.includes('push'))).toHaveLength(ancestor ? 1 : 0);
  expect(f.git.mock.calls.every(([,args]) => !args.some(arg => arg.startsWith('--force') || arg.startsWith('+')))).toBe(true);
});

it('keeps a lost response unknown and reconciles exact remote ref/SHA without another push', async () => {
  const f = await fixture(); f.lose();
  expect((await f.publisher.pushApproved(f.d,f.effect,'A',async () => {})).state).toBe('unknown');
  expect((await f.publisher.reconcilePush(f.d,{ ...f.effect,state: 'unknown' })).state).toBe('confirmed');
  expect(f.git.mock.calls.filter(([,args]) => args.includes('push'))).toHaveLength(1);
  f.remote('d'.repeat(40)); expect((await f.publisher.reconcilePush(f.d,f.effect)).reason).toBe('REMOTE_REF_CONFLICT');
});

it.each(['host','account','ref','parent','rewrite','callback','unknown'] as const)('does not send push for invalid %s', async kind => {
  const f = await fixture();
  if (kind === 'ref') f.remote('f'.repeat(40));
  if (kind === 'parent') f.wrongParent();
  if (kind === 'rewrite') f.config();
  const publisher = kind === 'host' ? createRemotePublisher(f.root,f.git,undefined,async p => p, undefined, async () => f.root) : f.publisher;
  const r = await publisher.pushApproved(f.d,kind === 'unknown' ? { ...f.effect,state: 'unknown' } : f.effect,kind === 'account' ? 'OTHER' : 'A',async () => { if (kind === 'callback') throw new Error('REVOKED'); });
  expect(r.state).not.toBe('confirmed'); expect(f.git.mock.calls.some(([,args]) => args.includes('push'))).toBe(false);
  expect(JSON.stringify(r)).not.toContain('PRIVATE_');
});
