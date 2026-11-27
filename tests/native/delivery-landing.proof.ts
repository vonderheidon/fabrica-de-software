import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Delivery, EffectView, GitHubQueryResult } from '#contracts';
import type { GitInput, GitReader } from '../../apps/controller/src/modules/workspaces/git.js';
import { createDeliveryTargetWorkspace, type TargetCommitResult } from '../../apps/controller/src/modules/workspaces/delivery-target.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root,{ recursive: true,force: true }); });
const complete = <T>(data: T): GitHubQueryResult<T> => ({ state:'complete',data,diagnostics:[],retryAtMs:null });
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
const exists = (path: string) => stat(path).then(() => true,() => false);

/** Real Git. The factory's isolated reads see no global file; the operator's own Git reads `operatorGlobal`. */
function readerFor(operatorGlobal: string): GitReader {
  return async (cwd,args,input?: GitInput) => {
    const commitDate = input?.commitTime === undefined ? {} : { GIT_AUTHOR_DATE:'@' + input.commitTime + ' +0000',GIT_COMMITTER_DATE:'@' + input.commitTime + ' +0000' };
    const result = spawnSync('git',[...args],{ cwd,encoding:'utf8',input:input?.input,windowsHide:true,shell:false,timeout:60_000,
      env:{ ...process.env,...commitDate,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:input?.isolatedConfig ? nullDevice : operatorGlobal,GIT_TERMINAL_PROMPT:'0' } });
    if (result.error) throw result.error;
    return { exitCode:result.status ?? 1,stdout:result.stdout ?? '' };
  };
}

async function fixture(options: { operatorConfig?: string } = {}) {
  await mkdir(join(process.cwd(),'.cache'),{ recursive:true });
  const root = await mkdtemp(join(process.cwd(),'.cache','delivery-landing-')); roots.push(root);
  const operatorGlobal = join(root,'operator.gitconfig'); await writeFile(operatorGlobal,options.operatorConfig ?? '');
  const reader = readerFor(operatorGlobal);
  const run = (cwd: string,args: string[],input?: string) => reader(cwd,args,input === undefined ? undefined : { input });
  const git = async (cwd: string,...args: string[]) => {
    const result = await run(cwd,args);
    if (result.exitCode !== 0) throw new Error('fixture git failed: ' + args.join(' '));
    return result.stdout.trim();
  };
  const bare = join(root,'origin.git'); const seed = join(root,'seed'); const folder = join(root,'Pasta do projeto');
  const data = join(root,'factory-data'); const retained = join(data,'git');
  await mkdir(retained,{ recursive:true });
  await git(root,'init','--bare',bare);
  await git(root,'init','-b','main',seed);
  await git(seed,'config','user.name','Fixture'); await git(seed,'config','user.email','fixture@example.test');
  for (const [name,body] of [['tracked.txt','base\n'],['other.txt','other\n'],['crlf.txt','one\ntwo\n'],['eol.txt','one\ntwo\n']] as const) await writeFile(join(seed,name),body);
  await git(seed,'add','--','.'); await git(seed,'commit','-m','base');
  const baseSha = await git(seed,'rev-parse','HEAD');
  await git(seed,'remote','add','origin',bare); await git(seed,'push','origin','HEAD:refs/heads/main');
  await git(bare,'symbolic-ref','HEAD','refs/heads/main');
  const attemptId = randomUUID(); const deliveryId = randomUUID(); const passageId = randomUUID(); const targetOperationId = randomUUID();
  const approvedRef = 'refs/factory/deliveries/' + deliveryId;
  const retainedRepo = join(retained,attemptId + '.git'); await git(root,'clone','--bare',bare,retainedRepo);
  await writeFile(join(retainedRepo,'factory-owner'),attemptId);
  await git(seed,'checkout','-b','approved');
  await writeFile(join(seed,'tracked.txt'),'approved change\n'); await writeFile(join(seed,'approved.txt'),'approved only\n');
  await mkdir(join(seed,'nested')); await writeFile(join(seed,'nested','new.txt'),'nested\n');
  await git(seed,'add','--','.'); await git(seed,'commit','-m','approved');
  const commitSha = await git(seed,'rev-parse','HEAD'); const contentIdentity = await git(seed,'rev-parse','HEAD^{tree}');
  await git(seed,'push','origin',commitSha + ':' + approvedRef);
  await git(retainedRepo,'fetch',bare,approvedRef + ':' + approvedRef);
  await git(root,'clone',bare,folder); await git(folder,'remote','set-url','origin','https://github.com/org/repo.git');
  await git(folder,'config','user.name','Operator'); await git(folder,'config','user.email','operator@example.test');
  const marker = join(root,'hook-fired.txt').replaceAll('\\','/');
  for (const hook of ['post-merge','post-checkout','reference-transaction','post-commit','pre-merge-commit']) {
    await writeFile(join(folder,'.git','hooks',hook),`#!/bin/sh\necho ${hook} >> '${marker}'\n`,{ mode:0o755 });
  }
  const repository = { id:'R_target',owner:{ id:'O_target',login:'org' },name:'repo',url:'https://github.com/org/repo',defaultBranch:'main',isArchived:false,isPrivate:true };
  const github = { getRepository:vi.fn(async () => complete(repository)),resolveBranch:vi.fn(async () => complete({ repositoryId:repository.id,name:'main',sha:baseSha })) };
  const resolveAttemptRoot = vi.fn(async () => data);
  const workspaces = createDeliveryTargetWorkspace(github,data,reader,undefined,resolveAttemptRoot);
  const delivery: Delivery = { id:deliveryId,attemptId,producerPassageId:passageId,round:1,baseSha,captureState:'captured',
    gitRef:approvedRef,repositoryRelative:'git/' + attemptId + '.git',contentIdentity,commitSha,hasDelta:true,diagnostic:null,capturedAtMs:1,revision:1,warnings:[] };
  const task = { attemptId,approvedRef,contentIdentity,repositoryRelative:delivery.repositoryRelative,issueNumber:17,issueTitle:'fix: Corrigir acesso ç',repositoryId:repository.id,
    repositoryUrl:repository.url,baseBranch:'main',baseSha,sourceKind:'local' as const,deliveryBranch:{ kind:'existing' as const,name:'main' } };
  const plan = await workspaces.inspectDeliveryTarget(folder,task,{ approvedRef,contentIdentity,baseSha });
  const target = { operation_id:targetOperationId,selection_operation_id:null,delivery_id:deliveryId,attempt_id:attemptId,repository_id:repository.id,
    local_path:plan.local_path,local_identity:plan.local_identity,branch_ref:plan.branch_ref,task_type:plan.task_type,task_description:plan.task_description,
    issue_number:17,base_branch:'main',base_sha:baseSha,approved_ref:approvedRef,content_identity:contentIdentity,format_version:1 as const,created_at_ms:1 };
  const effect: EffectView = { operationId:randomUUID(),attemptId,creationId:null,deliveryId,kind:'local_commit',scopeKey:deliveryId,
    state:'running',expectedIdentity:{ repositoryId:repository.id,issueId:randomUUID(),issueNumber:17,contentIdentity,parentSha:baseSha,branchRef:plan.branch_ref,branchKind:'existing',
      commitTime:1_798_000_000,targetOperationId,taskType:plan.task_type,taskDescription:plan.task_description,repositoryOwner:'org',repositoryName:'repo',baseBranch:'main' },
    confirmedIdentity:null,receipt:null,reason:null,authorized:true,revision:2,sentAtMs:1,confirmedAtMs:null };
  const authorize = vi.fn(async () => {});
  return { root,folder,data,retainedRepo,operatorGlobal,reader,run,git,workspaces,delivery,task,plan,target,effect,authorize,baseSha,approvedRef,contentIdentity,marker,
    land: (state: EffectView['state'] = 'running'): Promise<TargetCommitResult> => workspaces.createLocalCommit(delivery,{ ...effect,state },target,authorize),
    reconcile: (extra: Partial<EffectView> = {}): Promise<TargetCommitResult> => workspaces.reconcileLocalCommit(delivery,{ ...effect,state:'unknown',...extra },target) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

it('lands the approved commit in the checkout: files and index follow HEAD, the operator keeps everything else, hooks stay off and a repeat is idempotent', async () => {
  const f = await fixture();
  expect(f.plan.local_identity).toMatchObject({ branch_kind:'existing',observed_branch_ref:'refs/heads/main',operator_config:expect.any(Object) });
  // The hook is real: without the factory's override Git would run it.
  expect((await f.run(f.folder,['hook','run','--ignore-missing','post-merge'])).exitCode).toBe(0);
  expect(await readFile(f.marker,'utf8')).toContain('post-merge'); await rm(f.marker);
  await writeFile(join(f.folder,'junk.txt'),'mine\n'); await mkdir(join(f.folder,'build')); await writeFile(join(f.folder,'build','out.bin'),'ignored bytes');
  await writeFile(join(f.folder,'.git','info','exclude'),'build/\n');
  const result = await f.land();
  expect(result).toMatchObject({ state:'confirmed',reason:null,receipt:{ branchRef:'refs/heads/main',parentSha:f.baseSha,taskType:'fix' } });
  const sha = result.receipt!.id;
  expect(f.authorize).toHaveBeenCalledOnce();
  expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(sha);
  expect(await f.git(f.folder,'symbolic-ref','HEAD')).toBe('refs/heads/main');
  expect(await f.git(f.folder,'rev-parse','HEAD^')).toBe(f.baseSha);
  expect(await f.git(f.folder,'rev-parse','HEAD^{tree}')).toBe(f.contentIdentity);
  expect(await f.git(f.folder,'show','--no-patch','--format=%an <%ae>%n%B',sha)).toContain('Nova Fábrica <fabrica@localhost>');
  expect(await readFile(join(f.folder,'tracked.txt'),'utf8')).toBe('approved change\n');
  expect(await readFile(join(f.folder,'approved.txt'),'utf8')).toBe('approved only\n');
  expect(await readFile(join(f.folder,'nested','new.txt'),'utf8')).toBe('nested\n');
  expect((await f.run(f.folder,['diff','--cached','--quiet'])).exitCode).toBe(0);
  expect(await f.git(f.folder,'status','--porcelain','--untracked-files=all')).toBe('?? junk.txt');
  expect(await readFile(join(f.folder,'junk.txt'),'utf8')).toBe('mine\n');
  expect(await readFile(join(f.folder,'build','out.bin'),'utf8')).toBe('ignored bytes');
  expect(await readFile(f.marker,'utf8').catch(() => '')).toBe('');
  expect(await readdir(join(f.data,'hooks-disabled'))).toEqual([]);
  expect(await f.git(f.retainedRepo,'rev-parse','refs/heads/main')).toBe(sha);

  // A repeated run observes the branch; it never creates a second commit.
  const again = await f.land();
  expect(again).toMatchObject({ state:'confirmed',receipt:{ id:sha } });
  expect(await f.git(f.folder,'rev-list','--count','HEAD')).toBe('2');
  // A late observation of the confirmed commit survives the operator editing and committing afterwards.
  await writeFile(join(f.folder,'other.txt'),'operator edit\n'); await f.git(f.folder,'commit','-am','operator work');
  expect(await f.reconcile({ state:'confirmed',receipt:result.receipt,confirmedIdentity:result.receipt,confirmedAtMs:2 })).toMatchObject({ state:'confirmed',receipt:{ id:sha } });
  expect(await f.reconcile()).toMatchObject({ state:'confirmed',receipt:{ id:sha } });
  expect(await f.git(f.folder,'rev-list','--count','HEAD')).toBe('3');
}, 120_000);

type Case = { name: string; setup: (f: Fixture) => Promise<void>; cleanup: (f: Fixture) => Promise<void>; reason: string; paths?: string[]; branches?: [string | null,string | null]; kept?: (f: Fixture) => Promise<void> };
const reset = (f: Fixture) => f.git(f.folder,'reset','--hard','-q').then(() => {});
const busy = (name: string, directory = false): Case => ({ name:`${name} in progress`,reason:'PROJECT_FOLDER_BUSY',paths:[name],
  setup: async f => { const path = join(f.folder,'.git',...name.split('/')); if (directory) await mkdir(path); else await writeFile(path,f.baseSha + '\n'); },
  cleanup: async f => { await rm(join(f.folder,'.git',...name.split('/')),{ recursive:true,force:true }); },
  kept: async f => { expect(await exists(join(f.folder,'.git',...name.split('/')))).toBe(true); } });
const cases: Case[] = [
  { name:'tracked change',reason:'PROJECT_FOLDER_DIRTY',paths:['other.txt'],setup:f => writeFile(join(f.folder,'other.txt'),'edited\n'),cleanup:reset },
  { name:'staged change',reason:'PROJECT_FOLDER_DIRTY',paths:['other.txt'],setup:async f => { await writeFile(join(f.folder,'other.txt'),'staged\n'); await f.git(f.folder,'add','other.txt'); },cleanup:reset },
  { name:'conflicted index',reason:'PROJECT_FOLDER_DIRTY',paths:['other.txt'],cleanup:reset,setup:async f => {
    const blob = async (body: string) => (await f.run(f.folder,['hash-object','-w','--stdin'],body)).stdout.trim();
    const [a,b,c] = [await blob('a\n'),await blob('b\n'),await blob('c\n')];
    await f.run(f.folder,['update-index','--index-info'],`0 ${'0'.repeat(a.length)}\tother.txt\n100644 ${a} 1\tother.txt\n100644 ${b} 2\tother.txt\n100644 ${c} 3\tother.txt\n`);
  } },
  { name:'untracked file at a touched path',reason:'PROJECT_FOLDER_UNTRACKED_CONFLICT',paths:['approved.txt'],setup:f => writeFile(join(f.folder,'approved.txt'),'mine\n'),cleanup:f => rm(join(f.folder,'approved.txt')),
    kept: async f => { expect(await readFile(join(f.folder,'approved.txt'),'utf8')).toBe('mine\n'); } },
  { name:'ignored file at a touched path',reason:'PROJECT_FOLDER_UNTRACKED_CONFLICT',paths:['approved.txt'],
    setup:async f => { await writeFile(join(f.folder,'.git','info','exclude'),'approved.txt\n'); await writeFile(join(f.folder,'approved.txt'),'.env-like secret\n'); },
    cleanup:async f => { await writeFile(join(f.folder,'.git','info','exclude'),''); await rm(join(f.folder,'approved.txt')); },
    kept: async f => { expect(await readFile(join(f.folder,'approved.txt'),'utf8')).toBe('.env-like secret\n'); } },
  { name:'file where the delivery needs a folder',reason:'PROJECT_FOLDER_UNTRACKED_CONFLICT',paths:['nested'],setup:f => writeFile(join(f.folder,'nested'),'mine\n'),cleanup:f => rm(join(f.folder,'nested')) },
  ...['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','BISECT_LOG','HEAD.lock','index.lock','shallow.lock','refs/heads/main.lock'].map(name => busy(name)),
  ...['rebase-merge','rebase-apply','sequencer'].map(name => busy(name,true)),
  { name:'assume-unchanged on a touched path',reason:'PROJECT_FOLDER_PATH_HIDDEN',paths:['tracked.txt'],setup:f => f.git(f.folder,'update-index','--assume-unchanged','tracked.txt').then(() => {}),
    cleanup:f => f.git(f.folder,'update-index','--no-assume-unchanged','tracked.txt').then(() => {}) },
  { name:'skip-worktree on a touched path',reason:'PROJECT_FOLDER_PATH_HIDDEN',paths:['tracked.txt'],setup:f => f.git(f.folder,'update-index','--skip-worktree','tracked.txt').then(() => {}),
    cleanup:f => f.git(f.folder,'update-index','--no-skip-worktree','tracked.txt').then(() => {}) },
  { name:'detached HEAD',reason:'PROJECT_FOLDER_DETACHED_HEAD',paths:[],branches:['main',null],setup:f => f.git(f.folder,'checkout','--detach','-q').then(() => {}),cleanup:f => f.git(f.folder,'checkout','-q','main').then(() => {}) },
  { name:'another branch in checkout',reason:'PROJECT_FOLDER_BRANCH_CHANGED',paths:[],branches:['main','other'],setup:f => f.git(f.folder,'checkout','-q','-b','other').then(() => {}),
    cleanup:async f => { await f.git(f.folder,'checkout','-q','main'); await f.git(f.folder,'branch','-D','other'); } },
  { name:'another worktree on the branch',reason:'DELIVERY_BRANCH_IN_USE',setup:f => f.git(f.folder,'worktree','add','-f',join(f.root,'wt'),'main').then(() => {}),
    cleanup:async f => { await f.git(f.folder,'worktree','remove','--force',join(f.root,'wt')); } },
  { name:'operator config changed',reason:'PROJECT_FOLDER_CONFIG_CHANGED',setup:f => writeFile(f.operatorGlobal,'[core]\n\tautocrlf = true\n'),cleanup:f => writeFile(f.operatorGlobal,'') },
  { name:'hooks directory not empty',reason:'DELIVERY_HOOKS_DIRECTORY_INVALID',setup:f => writeFile(join(f.data,'hooks-disabled','post-merge'),'#!/bin/sh\n'),cleanup:f => rm(join(f.data,'hooks-disabled','post-merge')) },
  { name:'folder no longer the same repository',reason:'PROJECT_FOLDER_INVALID',setup:f => f.git(f.folder,'remote','set-url','origin','https://github.com/org/other.git').then(() => {}),
    cleanup:f => f.git(f.folder,'remote','set-url','origin','https://github.com/org/repo.git').then(() => {}) },
  { name:'base advanced',reason:'DELIVERY_BASE_CHANGED',setup:async f => { await f.git(f.folder,'commit','--allow-empty','-q','-m','operator moved the base'); },cleanup:f => f.git(f.folder,'reset','--hard','-q',f.baseSha).then(() => {}) },
];

it('blocks every preflight case before writing anything, then lands once the operator cleans up', async () => {
  const f = await fixture();
  await mkdir(join(f.data,'hooks-disabled'),{ recursive:true });
  const trackedBefore = await readFile(join(f.folder,'tracked.txt'),'utf8');
  for (const item of cases) {
    await item.setup(f);
    // The operator's own commands run their hooks; only what the factory's write fires is under test.
    await rm(f.marker,{ force:true });
    const result = await f.land();
    expect({ name:item.name,state:result.state,reason:result.reason }).toEqual({ name:item.name,state:'failed_known',reason:item.reason });
    if (item.paths) expect({ name:item.name,block:result.block }).toEqual({ name:item.name,block:{ paths:item.paths,pathCount:item.paths.length,expectedBranch:item.branches?.[0] ?? null,currentBranch:item.branches?.[1] ?? null } });
    await item.kept?.(f);
    expect(f.authorize, item.name).not.toHaveBeenCalled();
    expect(await readFile(join(f.folder,'tracked.txt'),'utf8'), item.name).toBe(trackedBefore);
    expect(await exists(join(f.folder,'nested','new.txt')), item.name).toBe(false);
    expect(await exists(f.marker), item.name).toBe(false);
    await item.cleanup(f);
    if (item.name === 'base advanced') expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(f.baseSha);
  }
  // Nothing was ever deleted: no lock the operator's tools own was touched, and the branch never moved.
  expect(await f.git(f.folder,'rev-parse','refs/heads/main')).toBe(f.baseSha);
  expect(await f.git(f.folder,'status','--porcelain','--untracked-files=all')).toBe('');
  const retried = await f.land();
  expect(retried).toMatchObject({ state:'confirmed',reason:null });
  expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(retried.receipt!.id);
  expect(await readFile(join(f.folder,'approved.txt'),'utf8')).toBe('approved only\n');
}, 600_000);

it('an index.lock owned by another tool blocks and is preserved byte for byte', async () => {
  const f = await fixture();
  const lock = join(f.folder,'.git','index.lock'); await writeFile(lock,'held by the IDE');
  const blocked = await f.land();
  expect(blocked).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_BUSY',block:{ paths:['index.lock'] } });
  expect(await readFile(lock,'utf8')).toBe('held by the IDE');
  expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(f.baseSha);
}, 120_000);

it('reads the operator CRLF configuration so CRLF files are not dirty, and writes delivered files with that EOL', async () => {
  const f = await fixture({ operatorConfig:'[core]\n\tautocrlf = true\n' });
  expect(f.plan.local_identity.operator_config).toMatchObject({ 'core.autocrlf':'true' });
  expect(Object.keys(f.plan.local_identity.operator_config!).every(key => /^core\.(autocrlf|eol|safecrlf|filemode|symlinks|ignorecase|longpaths|protectntfs)$/.test(key))).toBe(true);
  // Touching the file makes Git compare content: only the operator's autocrlf makes CRLF equal to the stored LF.
  const crlf = join(f.folder,'crlf.txt'); expect(await readFile(crlf,'utf8')).toBe('one\r\ntwo\r\n');
  await writeFile(crlf,'one\r\ntwo\r\n');
  expect(await f.reader(f.folder,['status','--porcelain'],{ isolatedConfig:true })).toMatchObject({ stdout:expect.stringContaining('crlf.txt') });
  expect(await f.git(f.folder,'status','--porcelain')).toBe('');
  const result = await f.land();
  expect(result).toMatchObject({ state:'confirmed' });
  expect(await readFile(join(f.folder,'approved.txt'),'utf8')).toBe('approved only\r\n');
  expect(await readFile(crlf,'utf8')).toBe('one\r\ntwo\r\n');
  expect(await f.git(f.folder,'status','--porcelain')).toBe('');
}, 120_000);

it('counts a file that differs only by EOL as dirty when the operator configuration does not hide it', async () => {
  const f = await fixture();
  expect(f.plan.local_identity.operator_config).not.toHaveProperty('core.autocrlf');
  await writeFile(join(f.folder,'eol.txt'),'one\r\ntwo\r\n');
  const result = await f.land();
  expect(result).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_DIRTY',block:{ paths:['eol.txt'],pathCount:1 } });
  expect(await readFile(join(f.folder,'eol.txt'),'utf8')).toBe('one\r\ntwo\r\n');
  expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(f.baseSha);
}, 120_000);

it('does not confirm a landing whose files or index diverge afterwards', async () => {
  const f = await fixture();
  const landed = await f.land();
  expect(landed.state).toBe('confirmed');
  // Same commit, but the operator edited a delivered file before the unresolved write was observed again.
  await writeFile(join(f.folder,'tracked.txt'),'edited right after the write\n');
  expect(await f.reconcile()).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_LANDING_UNVERIFIED' });
}, 120_000);

it('refuses to inspect a branch that another worktree already holds', async () => {
  const f = await fixture();
  await f.git(f.folder,'worktree','add','-f',join(f.root,'wt'),'main');
  await expect(f.workspaces.inspectDeliveryTarget(f.folder,f.task,{ approvedRef:f.approvedRef,contentIdentity:f.contentIdentity,baseSha:f.baseSha })).rejects.toMatchObject({ code:'DELIVERY_BRANCH_IN_USE' });
}, 120_000);
