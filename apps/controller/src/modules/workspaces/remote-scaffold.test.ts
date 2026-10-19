import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EffectView, ScaffoldPlan } from '#contracts';
import { createScaffoldRemoteGit } from './remote-scaffold.js';
import { scaffoldOwnership } from './scaffold.js';
import type { GitReader } from './git.js';
vi.mock('node:fs/promises',async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>(),realpath: vi.fn(async (p: string) => resolve(p)) }));
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory,{ recursive: true }); });
function fixture(mode = '') {
  mkdirSync(resolve('.cache'),{ recursive: true }); const root = mkdtempSync(resolve('.cache/scaffold-git-')); directories.push(root);
  const destination = join(root,'new'); mkdirSync(join(destination,'.git'),{ recursive: true });
  const plan: ScaffoldPlan = { formatVersion: 1,installationId: randomUUID(),settingsETag: 'settings',projectsRoot: root,destination,parentIdentity: 'a'.repeat(64),templateDigest: 'b'.repeat(64),
    input: { name: 'Local name',templateId: 'engineering',templateDigest: 'b'.repeat(64),destinationRelative: 'new',creationMode: 'remote_push',baseBranch: 'release/base',triageEnabled: false,remote: { ownerId: 'OWNER_test',name: 'repo',visibility: 'private' } },
    files: [{ path: 'README.md',bytes: 1,sha256: 'c'.repeat(64) }],engineering: { tracker: 'github',domain: 'single-context',instructionFile: 'AGENTS.md',triageEnabled: false,installsSkills: false,createsLabels: false },
    account: { state: 'complete',id: 'ACCOUNT_test',login: 'test-user' },ownerId: 'OWNER_test',ownerLogin: 'test-org',effects: ['create_repository','associate_origin','baseline_push'] };
  writeFileSync(join(destination,'.git','factory-scaffold-owner'),scaffoldOwnership(plan),'utf8');
  let origin: string | undefined; let published = false; let branchSha = 'a'.repeat(40); const calls: string[][] = [];
  const git: GitReader = vi.fn<GitReader>(async (cwd,args) => {
    expect(cwd).toBe(destination); calls.push([...args]);
    if (args.includes('rev-parse')) return { exitCode: 0,stdout: branchSha+'\n' };
    if (args.includes('symbolic-ref')) return { exitCode: 0,stdout: 'refs/heads/release/base\n' };
    if (args.includes('rev-list')) return { exitCode: 0,stdout: 'a'.repeat(40)+'\n' };
    if (args.includes('config')) {
      if (args.includes('--get-regexp')) return { exitCode: mode === 'unsafe-config' ? 0 : 1,stdout: mode === 'unsafe-config' ? 'url.override.insteadof marker' : '' };
      return { exitCode: origin ? 0 : 1,stdout: origin ? origin+'\n' : '' };
    }
    if (args.includes('remote')) { origin = args.at(-1)!; if (mode === 'origin-lost') throw new Error('Lost'); return { exitCode: 0,stdout: '' }; }
    if (args.includes('ls-remote')) return { exitCode: 0,stdout: published ? `${'a'.repeat(40)}\trefs/heads/release/base\n` : '' };
    if (args.includes('push')) { published = true; if (mode === 'push-lost') throw new Error('Lost'); return { exitCode: 0,stdout: '' }; }
    throw new Error('UNEXPECTED_GIT_COMMAND');
  });
  const guard = { createDirectory: vi.fn(async () => {}),assertHeld: vi.fn(() => {}),close: vi.fn(async () => {}) };
  const grant = { accountId: 'ACCOUNT_test',targets: [{ ownerId: 'OWNER_test',name: 'repo',visibility: 'private' as const,allowPush: true }] };
  const api = createScaffoldRemoteGit(git,grant,async () => guard);
  const creationId = randomUUID();
  const effect = (kind: 'associate_origin' | 'baseline_push'): EffectView => ({ operationId: randomUUID(),creationId,attemptId: null,deliveryId: null,kind,scopeKey: creationId,state: 'running',
    expectedIdentity: { repositoryId: 'R_created',repositoryOwner: 'test-org',repositoryName: 'repo',ownerId: 'OWNER_test',visibility: 'private',commitSha: 'a'.repeat(40),branchRef: 'refs/heads/release/base',planHash: scaffoldOwnership(plan) },
    receipt: null,confirmedIdentity: null,reason: null,authorized: true,revision: 2,sentAtMs: Date.now(),confirmedAtMs: null });
  return { api,plan,effect,calls,guard,git,grant,setOrigin: (url = 'https://github.com/test-org/repo.git') => { origin = url; },changeBranch: () => { branchSha = 'b'.repeat(40); } };
}
describe('scaffold Git origin and baseline push with controlled Git/canonicalization/guard',() => {
  it('uses the confirmed plan for origin and push while checking account and revocation', async () => {
    const f = fixture();
    const api = createScaffoldRemoteGit(f.git, { kind: 'confirmed_plan' }, async () => f.guard);
    const authorize = vi.fn(async () => {});
    expect((await api.executeScaffoldGit(f.plan, f.effect('associate_origin'), 'OTHER', authorize)).state).toBe('failed_known');
    expect((await api.executeScaffoldGit(f.plan, { ...f.effect('associate_origin'), authorized: false }, 'ACCOUNT_test', authorize)).state).toBe('failed_known');
    expect(f.calls).toEqual([]);
    expect((await api.executeScaffoldGit(f.plan, f.effect('associate_origin'), 'ACCOUNT_test', async () => { throw new Error('Revoked'); })).state).toBe('failed_known');
    expect(f.calls.some(args => args.includes('remote'))).toBe(false);
    expect((await api.executeScaffoldGit(f.plan, f.effect('associate_origin'), 'ACCOUNT_test', authorize)).state).toBe('confirmed');
    expect((await api.executeScaffoldGit(f.plan, f.effect('baseline_push'), 'ACCOUNT_test', authorize)).state).toBe('confirmed');
    expect(authorize).toHaveBeenCalledTimes(2);
  });
  it('associates only the confirmed repository and publishes exactly baseline SHA to the same base branch',async () => {
    const f = fixture(); const authorize = vi.fn(async () => {});
    expect((await f.api.executeScaffoldGit(f.plan,f.effect('associate_origin'),'ACCOUNT_test',authorize)).state).toBe('confirmed');
    const push = f.effect('baseline_push'); expect((await f.api.executeScaffoldGit(f.plan,push,'ACCOUNT_test',authorize)).receipt).toMatchObject({ commitSha: 'a'.repeat(40),branchRef: 'refs/heads/release/base',repositoryId: 'R_created',operationId: push.operationId });
    const sent = f.calls.find(args => args.includes('push'))!;
    expect(sent.slice(sent.indexOf('push'))).toEqual(['push','--porcelain','--no-follow-tags','--recurse-submodules=no','https://github.com/test-org/repo.git',`${'a'.repeat(40)}:refs/heads/release/base`]);
    expect(f.calls.flat().some(a => a.startsWith('+') || a === '--force' || a === '-f')).toBe(false); expect(authorize).toHaveBeenCalledTimes(2); expect(f.guard.close).toHaveBeenCalledTimes(2);
  });
  it.each(['origin-lost','push-lost'])('reconciles %s by readback without another mutation',async mode => {
    const f = fixture(mode); const kind = mode === 'origin-lost' ? 'associate_origin' : 'baseline_push'; if (kind === 'baseline_push') f.setOrigin();
    const e = f.effect(kind); expect((await f.api.executeScaffoldGit(f.plan,e,'ACCOUNT_test',async () => {})).state).toBe('unknown');
    const before = f.calls.filter(a => a.includes('remote') || a.includes('push')).length;
    expect((await f.api.reconcileScaffoldGit(f.plan,{ ...e,state: 'unknown' })).state).toBe('confirmed');
    expect(f.calls.filter(a => a.includes('remote') || a.includes('push'))).toHaveLength(before);
  });
  it('refuses preexisting origin, changed baseline and unsupported transport configuration',async () => {
    const f = fixture(); f.setOrigin(); expect((await f.api.executeScaffoldGit(f.plan,f.effect('associate_origin'),'ACCOUNT_test',async () => {})).state).not.toBe('confirmed');
    expect(f.calls.some(a => a.includes('remote'))).toBe(false); f.changeBranch();
    expect((await f.api.executeScaffoldGit(f.plan,f.effect('baseline_push'),'ACCOUNT_test',async () => {})).reason).toBe('SCAFFOLD_BASELINE_INVALID');
    const g = fixture('unsafe-config'); g.setOrigin(); expect((await g.api.executeScaffoldGit(g.plan,g.effect('baseline_push'),'ACCOUNT_test',async () => {})).reason).toBe('PUSH_CONFIGURATION_UNSUPPORTED'); expect(g.calls.some(a => a.includes('push'))).toBe(false);
  });
  it('refuses wrong host account, missing ownership and authority revoked immediately before sending',async () => {
    const f = fixture(); expect((await f.api.executeScaffoldGit(f.plan,f.effect('associate_origin'),'OTHER',async () => {})).reason).toBe('CREATION_TARGET_NOT_AUTHORIZED'); expect(f.calls).toEqual([]);
    const denied = await f.api.executeScaffoldGit(f.plan,f.effect('associate_origin'),'ACCOUNT_test',async () => { throw new Error('Revoked'); });
    expect(denied.state).toBe('failed_known'); expect(f.calls.some(a => a.includes('remote'))).toBe(false);
    writeFileSync(join(f.plan.destination,'.git','factory-scaffold-owner'),'x'.repeat(64),'utf8');
    expect((await f.api.reconcileScaffoldGit(f.plan,{ ...f.effect('baseline_push'),state: 'unknown' })).reason).toBe('SCAFFOLD_OWNERSHIP_INVALID');
  });
  it('never publishes in remote_no_push, even with an altered effect request',async () => {
    const f = fixture(); const plan = { ...f.plan,input: { ...f.plan.input,creationMode: 'remote_no_push' as const } };
    expect((await f.api.executeScaffoldGit(plan,f.effect('baseline_push'),'ACCOUNT_test',async () => {})).reason).toBe('CREATION_EFFECT_INVALID'); expect(f.calls).toEqual([]);
  });
});
