import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Delivery, DeliveryBranchChoice, EffectView, GitHubQueryResult } from '#contracts';
import type { GitInput, GitReader } from '../../apps/controller/src/modules/workspaces/git.js';
import { createDeliveryTargetWorkspace, type TargetCommitResult } from '../../apps/controller/src/modules/workspaces/delivery-target.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createPublication } from '../../apps/controller/src/modules/publication/index.js';
import { publicationFixture } from '../fixtures/publication.js';
import { confirmTerminalStops, leaveReviewerStopUnconfirmed } from '../fixtures/attempt.js';

const roots: string[] = [];
const lockers: { unlock: () => Promise<void> }[] = [];
afterEach(async () => {
  for (const locker of lockers.splice(0)) await locker.unlock().catch(() => {});
  for (const root of roots.splice(0)) await rm(root,{ recursive: true,force: true });
});
const complete = <T>(data: T): GitHubQueryResult<T> => ({ state:'complete',data,diagnostics:[],retryAtMs:null });
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
const exists = (path: string) => stat(path).then(() => true,() => false);

/** Real Git. The factory's isolated reads see no global file; the operator's own Git reads `operatorGlobal`. */
function readerFor(operatorGlobal: string): GitReader {
  return async (cwd,args,input?: GitInput) => {
    const commitDate = input?.commitTime === undefined ? {} : { GIT_AUTHOR_DATE:'@' + input.commitTime + ' +0000',GIT_COMMITTER_DATE:'@' + input.commitTime + ' +0000' };
    const indexEnv = input?.indexFile ? { GIT_INDEX_FILE: input.indexFile } : {};
    const result = spawnSync('git',[...args],{ cwd,encoding:'utf8',input:input?.input,windowsHide:true,shell:false,timeout:60_000,
      env:{ ...process.env,...commitDate,...indexEnv,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:input?.isolatedConfig ? nullDevice : operatorGlobal,GIT_TERMINAL_PROMPT:'0' } });
    if (result.error) throw result.error;
    return { exitCode:result.status ?? 1,stdout:result.stdout ?? '' };
  };
}

async function lockFileForRead(path: string) {
  if (process.platform !== 'win32') throw new Error('Windows lock probe requires win32');
  const script = `$fs = [System.IO.File]::Open('${path.replace(/'/g, "''")}', 'Open', 'Read', 'Read'); [Console]::Out.WriteLine('LOCKED'); [Console]::In.ReadLine() | Out-Null; $fs.Dispose()`;
  const ps = spawn('powershell.exe',['-NoLogo','-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{
    windowsHide:true,stdio:['pipe','pipe','pipe']
  });
  await new Promise<void>((resolve,reject) => {
    const onData = (chunk: Buffer) => { if (chunk.toString('utf8').includes('LOCKED')) { ps.stdout.off('data',onData); resolve(); } };
    ps.stdout.on('data',onData);
    ps.once('error',reject);
    ps.once('exit',code => reject(new Error('Locker exited early: ' + code)));
  });
  let closed = false;
  const closedPromise = new Promise<void>(resolve => ps.once('close',() => { closed = true; resolve(); }));
  const locker = {
    async unlock() {
      if (closed) return;
      try { ps.stdin.write('unlock\n'); ps.stdin.end(); } catch { /* ignore */ }
      await Promise.race([closedPromise,new Promise(resolve => setTimeout(resolve,3000))]);
      if (!closed) { try { ps.kill(); } catch { /* ignore */ } await closedPromise; }
    }
  };
  lockers.push(locker);
  return locker;
}

type FixtureOptions = {
  operatorConfig?: string;
  baseFiles?: ReadonlyArray<readonly [string, string]>;
  approvedFiles?: ReadonlyArray<readonly [string, string]>;
  deletePaths?: readonly string[];
  rawApprovedTree?: (args: { git: (cwd: string,...args: string[]) => Promise<string>; run: (cwd: string,args: string[],input?: string) => Promise<{ exitCode: number; stdout: string }>; bare: string; baseSha: string; seed: string }) => Promise<string>;
  wrapReader?: (base: GitReader) => GitReader;
  /** Defaults to the branch em checkout (`main`). */
  deliveryBranch?: DeliveryBranchChoice;
  /** Runs on the Pasta do projeto before the target is inspected. */
  beforeInspect?: (folder: string,git: (cwd: string,...args: string[]) => Promise<string>) => Promise<void>;
};

async function fixture(options: FixtureOptions = {}) {
  await mkdir(join(process.cwd(),'.cache'),{ recursive:true });
  const root = await mkdtemp(join(process.cwd(),'.cache','delivery-landing-')); roots.push(root);
  const operatorGlobal = join(root,'operator.gitconfig'); await writeFile(operatorGlobal,options.operatorConfig ?? '');
  const baseReader = readerFor(operatorGlobal);
  const reader: GitReader = options.wrapReader ? options.wrapReader(baseReader) : baseReader;
  const run = (cwd: string,args: string[],input?: string) => baseReader(cwd,args,input === undefined ? undefined : { input });
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
  const initialFiles = options.baseFiles ?? [['tracked.txt','base\n'],['other.txt','other\n'],['crlf.txt','one\ntwo\n'],['eol.txt','one\ntwo\n']] as const;
  for (const [name,body] of initialFiles) {
    await mkdir(join(seed,...name.split('/').slice(0,-1)),{ recursive:true });
    await writeFile(join(seed,name),body);
  }
  await git(seed,'add','--','.'); await git(seed,'commit','-m','base');
  const baseSha = await git(seed,'rev-parse','HEAD');
  await git(seed,'remote','add','origin',bare); await git(seed,'push','origin','HEAD:refs/heads/main');
  await git(bare,'symbolic-ref','HEAD','refs/heads/main');
  const attemptId = randomUUID(); const deliveryId = randomUUID(); const passageId = randomUUID(); const targetOperationId = randomUUID();
  const approvedRef = 'refs/factory/deliveries/' + deliveryId;
  const retainedRepo = join(retained,attemptId + '.git'); await git(root,'clone','--bare',bare,retainedRepo);
  await writeFile(join(retainedRepo,'factory-owner'),attemptId);
  let commitSha: string;
  let contentIdentity: string;
  if (options.rawApprovedTree) {
    const tree = await options.rawApprovedTree({ git,run,bare,baseSha,seed });
    const created = await run(bare,['--git-dir=' + bare,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit-tree',tree,'-p',baseSha],'approved raw tree\n');
    if (created.exitCode !== 0) throw new Error('raw commit-tree failed');
    commitSha = created.stdout.trim();
    contentIdentity = tree;
    await git(bare,'--git-dir=' + bare,'update-ref',approvedRef,commitSha);
    await git(retainedRepo,'fetch',bare,approvedRef + ':' + approvedRef);
  } else {
    await git(seed,'checkout','-b','approved');
    for (const del of options.deletePaths ?? []) await rm(join(seed,...del.split('/')));
    const nextFiles = options.approvedFiles ?? [['tracked.txt','approved change\n'],['approved.txt','approved only\n'],['nested/new.txt','nested\n']] as const;
    for (const [name,body] of nextFiles) {
      await mkdir(join(seed,...name.split('/').slice(0,-1)),{ recursive:true });
      await writeFile(join(seed,...name.split('/')),body);
    }
    await git(seed,'add','-A','--','.'); await git(seed,'commit','-m','approved');
    commitSha = await git(seed,'rev-parse','HEAD'); contentIdentity = await git(seed,'rev-parse','HEAD^{tree}');
    await git(seed,'push','origin',commitSha + ':' + approvedRef);
    await git(retainedRepo,'fetch',bare,approvedRef + ':' + approvedRef);
  }
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
    repositoryUrl:repository.url,baseBranch:'main',baseSha,sourceKind:'local' as const,deliveryBranch:options.deliveryBranch ?? { kind:'existing' as const,name:'main' } };
  await options.beforeInspect?.(folder,git);
  const plan = await workspaces.inspectDeliveryTarget(folder,task,{ approvedRef,contentIdentity,baseSha });
  const target = { operation_id:targetOperationId,selection_operation_id:null,delivery_id:deliveryId,attempt_id:attemptId,repository_id:repository.id,
    local_path:plan.local_path,local_identity:plan.local_identity,branch_ref:plan.branch_ref,task_type:plan.task_type,task_description:plan.task_description,
    issue_number:17,base_branch:'main',base_sha:baseSha,approved_ref:approvedRef,content_identity:contentIdentity,format_version:1 as const,created_at_ms:1 };
  const effect: EffectView = { operationId:randomUUID(),attemptId,creationId:null,deliveryId,kind:'local_commit',scopeKey:deliveryId,
    state:'running',expectedIdentity:{ repositoryId:repository.id,issueId:randomUUID(),issueNumber:17,contentIdentity,parentSha:baseSha,branchRef:plan.branch_ref,branchKind:task.deliveryBranch.kind,
      commitTime:1_798_000_000,targetOperationId,taskType:plan.task_type,taskDescription:plan.task_description,repositoryOwner:'org',repositoryName:'repo',baseBranch:'main' },
    confirmedIdentity:null,receipt:null,reason:null,authorized:true,revision:2,sentAtMs:1,confirmedAtMs:null };
  const authorize = vi.fn(async () => {});
  return { root,bare,seed,folder,data,retainedRepo,operatorGlobal,reader,run,git,workspaces,delivery,task,plan,target,effect,authorize,baseSha,commitSha,approvedRef,contentIdentity,marker,
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
  expect(await f.reconcile()).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_LANDING_UNVERIFIED',block:{ paths:['tracked.txt'],pathCount:1 } });
}, 120_000);

it('refuses to inspect a branch that another worktree already holds', async () => {
  const f = await fixture();
  await f.git(f.folder,'worktree','add','-f',join(f.root,'wt'),'main');
  await expect(f.workspaces.inspectDeliveryTarget(f.folder,f.task,{ approvedRef:f.approvedRef,contentIdentity:f.contentIdentity,baseSha:f.baseSha })).rejects.toMatchObject({ code:'DELIVERY_BRANCH_IN_USE' });
}, 120_000);

it('repairs partial landing caused by a locked file using reset --mixed and restore --worktree only for pending paths while preserving operator files', async () => {
  const commands: string[][] = [];
  let transientLock: { unlock: () => Promise<void> } | null = null;
  let folderPath = '';
  const f = await fixture({
    operatorConfig:'[core]\n\tautocrlf = true\n',
    baseFiles:[['a.txt','a1\n'],['del.txt','del1\n'],['tracked.txt','base\n'],['other.txt','other\n'],['z-locked.txt','z1\n']],
    approvedFiles:[['a.txt','a2\n'],['approved.txt','approved only\n'],['nested/new.txt','nested\n'],['tracked.txt','approved change\n'],['z-locked.txt','z2\n']],
    deletePaths:['del.txt'],
    wrapReader:base => async (cwd,args,input) => {
      commands.push([...args]);
      const response = await base(cwd,args,input);
      if (transientLock && cwd === folderPath && args.includes('merge')) {
        await transientLock.unlock();
        transientLock = null;
      }
      return response;
    },
  });
  folderPath = f.folder;
  await writeFile(join(f.folder,'junk.txt'),'operator untracked\n');
  await mkdir(join(f.folder,'build'));
  await writeFile(join(f.folder,'build','out.bin'),'ignored bytes');
  await writeFile(join(f.folder,'.git','info','exclude'),'build/\n');

  // 1) Transient lock: locked during `merge`, unlocked immediately after so immediate repair succeeds on the spot.
  transientLock = await lockFileForRead(join(f.folder,'z-locked.txt'));
  const repairedImmediately = await f.land();
  expect(repairedImmediately).toMatchObject({ state:'confirmed',reason:null });
  const sha = repairedImmediately.receipt!.id;
  expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(sha);
  expect(await readFile(join(f.folder,'a.txt'),'utf8')).toBe('a2\r\n');
  expect(await readFile(join(f.folder,'approved.txt'),'utf8')).toBe('approved only\r\n');
  expect(await readFile(join(f.folder,'nested','new.txt'),'utf8')).toBe('nested\r\n');
  expect(await readFile(join(f.folder,'z-locked.txt'),'utf8')).toBe('z2\r\n');
  expect(await exists(join(f.folder,'del.txt'))).toBe(false);
  expect(await readFile(join(f.folder,'junk.txt'),'utf8')).toBe('operator untracked\n');
  expect(await readFile(join(f.folder,'build','out.bin'),'utf8')).toBe('ignored bytes');
  expect(await readFile(f.marker,'utf8').catch(() => '')).toBe('');
  const restoreCall = commands.find(args => args.includes('restore'));
  expect(restoreCall).toBeDefined();
  expect(restoreCall).toContain(`--source=${sha}`);
  expect(commands.some(args => args.includes('reset') && args.includes('--mixed') && args.includes(sha))).toBe(true);

  // 2) Held lock across landing, then unlocked before retry: partial state blocks with the pending file, then retry repairs only the pending path.
  let f2Path = '';
  const restoreInputs: string[] = [];
  const f2 = await fixture({
    baseFiles:[['a.txt','a1\n'],['other.txt','other\n'],['z-locked.txt','z1\n']],
    approvedFiles:[['a.txt','a2\n'],['approved.txt','approved only\n'],['z-locked.txt','z2\n']],
    wrapReader:base => async (cwd,args,input) => {
      if (cwd === f2Path && args.includes('restore')) restoreInputs.push(String(input?.input ?? ''));
      return base(cwd,args,input);
    },
  });
  f2Path = f2.folder;
  await writeFile(join(f2.folder,'junk.txt'),'keep me\n');
  const heldLock = await lockFileForRead(join(f2.folder,'z-locked.txt'));
  const blocked = await f2.land();
  expect(blocked).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_REPAIR_FAILED',block:{ paths:['z-locked.txt'],pathCount:1 } });
  expect(await readFile(join(f2.folder,'z-locked.txt'),'utf8')).toBe('z1\n');
  expect(await readFile(join(f2.folder,'junk.txt'),'utf8')).toBe('keep me\n');
  expect(restoreInputs).toEqual(['z-locked.txt\0']);

  await heldLock.unlock();
  restoreInputs.length = 0;
  const retried = await f2.land();
  expect(retried).toMatchObject({ state:'confirmed',reason:null });
  expect(restoreInputs).toEqual(['z-locked.txt\0']);
  expect(await readFile(join(f2.folder,'z-locked.txt'),'utf8')).toBe('z2\n');
  expect(await readFile(join(f2.folder,'junk.txt'),'utf8')).toBe('keep me\n');
  expect(await f2.git(f2.folder,'status','--porcelain','--untracked-files=all')).toBe('?? junk.txt');

  // 3) Locked deleted file: `reset --mixed` updates HEAD/index, `unlink` fails on the locked deleted path, then unlocking completes delivery cleanly.
  const f3 = await fixture({
    baseFiles:[['del.txt','del1\n'],['other.txt','other\n']],
    approvedFiles:[['approved.txt','approved only\n']],
    deletePaths:['del.txt'],
  });
  const delLock = await lockFileForRead(join(f3.folder,'del.txt'));
  const delBlocked = await f3.land();
  expect(delBlocked).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_REPAIR_FAILED',block:{ paths:['del.txt'],pathCount:1 } });
  expect(await exists(join(f3.folder,'del.txt'))).toBe(true);
  await delLock.unlock();
  const delRetried = await f3.land();
  expect(delRetried).toMatchObject({ state:'confirmed',reason:null });
  expect(await exists(join(f3.folder,'del.txt'))).toBe(false);
  expect(await readFile(join(f3.folder,'approved.txt'),'utf8')).toBe('approved only\n');
}, 180_000);

it('refuses partial repair without touching operator work when any dirty path differs from both pre-state and target', async () => {
  // Case 1: HEAD/index at baseSha, partial delivery files on disk + operator edit on other.txt
  const calls1: string[][] = [];
  const f1 = await fixture({
    wrapReader:base => async (cwd,args,input) => { calls1.push([...args]); return base(cwd,args,input); },
  });
  await f1.run(f1.folder,['fetch','--no-tags','--no-recurse-submodules','--',f1.retainedRepo,f1.approvedRef]);
  // Create the exact commit with the effect's commitTime so reconcile/land recognizes it in f1.folder:
  const exactSha = (await f1.reader(f1.folder,['-c','user.name=Nova Fábrica','-c','user.email=fabrica@localhost','commit-tree',f1.contentIdentity,'-p',f1.baseSha],
    { isolatedConfig:true,commitTime:f1.effect.expectedIdentity.commitTime!,input:`fix: Corrigir acesso ç (#17)\n\nFactory-Attempt: ${f1.delivery.attemptId}\nFactory-Delivery: ${f1.delivery.id}\nFactory-Operation: ${f1.effect.operationId}\nFactory-Target: ${f1.target.operation_id}\n` })).stdout.trim();
  expect(exactSha).toMatch(/^[a-f0-9]{40}$/);
  await writeFile(join(f1.folder,'approved.txt'),'approved only\n');
  await writeFile(join(f1.folder,'other.txt'),'operator edit\n');
  await writeFile(join(f1.folder,'junk.txt'),'untracked edit\n');
  calls1.length = 0;
  const refused1 = await f1.land();
  expect(refused1).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_REPAIR_REFUSED',block:{ paths:['other.txt'],pathCount:1 } });
  expect(calls1.some(args => args.includes('reset') || args.includes('restore'))).toBe(false);
  expect(await f1.git(f1.folder,'rev-parse','HEAD')).toBe(f1.baseSha);
  expect(await readFile(join(f1.folder,'other.txt'),'utf8')).toBe('operator edit\n');
  expect(await readFile(join(f1.folder,'junk.txt'),'utf8')).toBe('untracked edit\n');

  // Case 2: branch/HEAD moved to sha while tracked.txt was edited by operator (differs from pre-state and target)
  const calls2: string[][] = [];
  const f2 = await fixture({
    wrapReader:base => async (cwd,args,input) => { calls2.push([...args]); return base(cwd,args,input); },
  });
  const held = await lockFileForRead(join(f2.folder,'tracked.txt'));
  const blocked2 = await f2.land();
  expect(blocked2.state).toBe('unknown');
  await held.unlock();
  await writeFile(join(f2.folder,'tracked.txt'),'operator modified tracked\n');
  await writeFile(join(f2.folder,'junk.txt'),'keep untracked\n');
  calls2.length = 0;
  const refused2 = await f2.reconcile();
  expect(refused2).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_LANDING_UNVERIFIED',block:{ paths:['tracked.txt'],pathCount:1 } });
  expect(calls2.some(args => args.includes('restore'))).toBe(false);
  expect(await readFile(join(f2.folder,'tracked.txt'),'utf8')).toBe('operator modified tracked\n');
  expect(await readFile(join(f2.folder,'junk.txt'),'utf8')).toBe('keep untracked\n');
}, 180_000);

it('reports unknown with the conflicting paths when the operator edits a pending path after reset --mixed already moved the branch', async () => {
  let folderPath = '';
  let injectEdit = false;
  const f = await fixture({
    wrapReader:base => async (cwd,args,input) => {
      const response = await base(cwd,args,input);
      if (injectEdit && cwd === folderPath && args.includes('reset') && args.includes('--mixed')) {
        injectEdit = false;
        await writeFile(join(folderPath,'tracked.txt'),'operator late edit\n');
      }
      return response;
    },
  });
  folderPath = f.folder;
  await f.run(f.folder,['fetch','--no-tags','--no-recurse-submodules','--',f.retainedRepo,f.approvedRef]);
  const exactSha = (await f.reader(f.folder,['-c','user.name=Nova Fábrica','-c','user.email=fabrica@localhost','commit-tree',f.contentIdentity,'-p',f.baseSha],
    { isolatedConfig:true,commitTime:f.effect.expectedIdentity.commitTime!,input:`fix: Corrigir acesso ç (#17)\n\nFactory-Attempt: ${f.delivery.attemptId}\nFactory-Delivery: ${f.delivery.id}\nFactory-Operation: ${f.effect.operationId}\nFactory-Target: ${f.target.operation_id}\n` })).stdout.trim();
  expect(exactSha).toMatch(/^[a-f0-9]{40}$/);
  await writeFile(join(f.folder,'approved.txt'),'approved only\n');
  injectEdit = true;
  const result = await f.land();
  expect(result).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_LANDING_UNVERIFIED',block:{ paths:['tracked.txt'],pathCount:1 } });
  expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(exactSha);
  expect(await readFile(join(f.folder,'tracked.txt'),'utf8')).toBe('operator late edit\n');
}, 180_000);

it('refuses gitlink, symlink, NTFS invalid name, filter/working-tree-encoding and sparse checkout before writing, keeping read-tree as second barrier only', async () => {
  type UnsupportedCase = { name: string; reason: string; setupOptions?: Partial<FixtureOptions>; setupFolder?: (f: Fixture) => Promise<void> };
  const unsupported: UnsupportedCase[] = [
    {
      name:'gitlink (submodule)',
      reason:'PROJECT_FOLDER_SUBMODULE_UNSUPPORTED',
      setupOptions:{
        rawApprovedTree:async ({ run,bare,baseSha }) => {
          const baseTree = (await run(bare,['--git-dir=' + bare,'ls-tree',baseSha])).stdout;
          const mktree = await run(bare,['--git-dir=' + bare,'mktree'],baseTree + `160000 commit ${baseSha}\tsubmod\n`);
          if (mktree.exitCode !== 0) throw new Error('mktree gitlink failed');
          return mktree.stdout.trim();
        },
      },
    },
    {
      name:'symlink in approved tree',
      reason:'PROJECT_FOLDER_SYMLINK_UNSUPPORTED',
      setupOptions:{
        rawApprovedTree:async ({ run,bare,baseSha }) => {
          const baseTree = (await run(bare,['--git-dir=' + bare,'ls-tree',baseSha])).stdout;
          const linkBlob = (await run(bare,['--git-dir=' + bare,'hash-object','-w','--stdin'],'tracked.txt')).stdout.trim();
          const mktree = await run(bare,['--git-dir=' + bare,'mktree'],baseTree + `120000 blob ${linkBlob}\tlink.txt\n`);
          if (mktree.exitCode !== 0) throw new Error('mktree symlink failed');
          return mktree.stdout.trim();
        },
      },
    },
    {
      name:'NTFS invalid name even with core.protectNTFS=false',
      reason:'PROJECT_FOLDER_NTFS_NAME_INVALID',
      setupOptions:{
        operatorConfig:'[core]\n\tprotectNTFS = false\n',
        rawApprovedTree:async ({ run,bare,baseSha }) => {
          const baseTree = (await run(bare,['--git-dir=' + bare,'ls-tree',baseSha])).stdout;
          const blob = (await run(bare,['--git-dir=' + bare,'hash-object','-w','--stdin'],'bad ntfs\n')).stdout.trim();
          const mktree = await run(bare,['--git-dir=' + bare,'mktree'],baseTree + `100644 blob ${blob}\tCON.txt\n`);
          if (mktree.exitCode !== 0) throw new Error('mktree ntfs failed');
          return mktree.stdout.trim();
        },
      },
    },
    {
      name:'filter (LFS) via .gitattributes in delivery',
      reason:'PROJECT_FOLDER_FILTER_UNSUPPORTED',
      setupOptions:{
        rawApprovedTree:async ({ run,bare,baseSha }) => {
          const baseTree = (await run(bare,['--git-dir=' + bare,'ls-tree',baseSha])).stdout;
          const attrBlob = (await run(bare,['--git-dir=' + bare,'hash-object','-w','--stdin'],'*.bin filter=lfs\n')).stdout.trim();
          const dataBlob = (await run(bare,['--git-dir=' + bare,'hash-object','-w','--stdin'],'version https://git-lfs.github.com/spec/v1\n')).stdout.trim();
          const mktree = await run(bare,['--git-dir=' + bare,'mktree'],baseTree + `100644 blob ${attrBlob}\t.gitattributes\n100644 blob ${dataBlob}\tdata.bin\n`);
          if (mktree.exitCode !== 0) throw new Error('mktree filter failed');
          return mktree.stdout.trim();
        },
      },
    },
    {
      name:'working-tree-encoding via .gitattributes in delivery',
      reason:'PROJECT_FOLDER_FILTER_UNSUPPORTED',
      setupOptions:{
        rawApprovedTree:async ({ run,bare,baseSha }) => {
          const baseTree = (await run(bare,['--git-dir=' + bare,'ls-tree',baseSha])).stdout;
          const attrBlob = (await run(bare,['--git-dir=' + bare,'hash-object','-w','--stdin'],'*.u16 working-tree-encoding=UTF-16\n')).stdout.trim();
          const u16Blob = (await run(bare,['--git-dir=' + bare,'hash-object','-w','--stdin'],'hello\n')).stdout.trim();
          const mktree = await run(bare,['--git-dir=' + bare,'mktree'],baseTree + `100644 blob ${attrBlob}\t.gitattributes\n100644 blob ${u16Blob}\ttext.u16\n`);
          if (mktree.exitCode !== 0) throw new Error('mktree working-tree-encoding failed');
          return mktree.stdout.trim();
        },
      },
    },
    {
      name:'filter via operator core.attributesFile',
      reason:'PROJECT_FOLDER_FILTER_UNSUPPORTED',
      setupFolder:async f => {
        const attrs = join(f.root,'global.gitattributes');
        await writeFile(attrs,'approved.txt filter=custom\n');
        await writeFile(f.operatorGlobal,`[core]\n\tattributesFile = ${attrs.replaceAll('\\','/')}\n`);
      },
    },
    {
      name:'sparse checkout repository (cone)',
      reason:'PROJECT_FOLDER_SPARSE_CHECKOUT',
      setupOptions:{ baseFiles:[['sub/keep.txt','keep\n'],['tracked.txt','base\n'],['other.txt','other\n'],['crlf.txt','one\ntwo\n'],['eol.txt','one\ntwo\n']] },
      setupFolder:async f => {
        await f.git(f.folder,'sparse-checkout','init','--cone');
        await f.git(f.folder,'sparse-checkout','set','sub');
      },
    },
    {
      name:'sparse checkout repository (non-cone)',
      reason:'PROJECT_FOLDER_SPARSE_CHECKOUT',
      setupFolder:async f => {
        await f.git(f.folder,'sparse-checkout','init','--no-cone');
        await f.git(f.folder,'sparse-checkout','set','tracked.txt');
      },
    },
  ];

  for (const item of unsupported) {
    const folderCalls: string[][] = [];
    let folderPath = '';
    const f = await fixture({
      ...item.setupOptions,
      wrapReader:base => async (cwd,args,input) => {
        if (cwd === folderPath) folderCalls.push([...args]);
        return base(cwd,args,input);
      },
    });
    folderPath = f.folder;
    await item.setupFolder?.(f);
    folderCalls.length = 0;
    await rm(f.marker,{ force:true });
    const result = await f.land();
    expect({ name:item.name,state:result.state,reason:result.reason }).toEqual({ name:item.name,state:'failed_known',reason:item.reason });
    expect(f.authorize,item.name).not.toHaveBeenCalled();
    expect(folderCalls.some(args => args.includes('fetch') || args.includes('commit-tree') || args.includes('read-tree') || args.includes('merge')),item.name).toBe(false);
    expect(await f.git(f.folder,'rev-parse','HEAD'),item.name).toBe(f.baseSha);
    expect(await exists(f.marker),item.name).toBe(false);
  }

  // Disabling sparse checkout leaves `.git/info/sparse-checkout` on disk, so only active `core.sparseCheckout=true` blocks.
  const disabledSparse = await fixture();
  await disabledSparse.git(disabledSparse.folder,'sparse-checkout','init','--no-cone');
  await disabledSparse.git(disabledSparse.folder,'sparse-checkout','set','tracked.txt');
  await disabledSparse.git(disabledSparse.folder,'sparse-checkout','disable');
  expect(await exists(join(disabledSparse.folder,'.git','info','sparse-checkout'))).toBe(true);
  expect(await disabledSparse.land()).toMatchObject({ state:'confirmed',reason:null });

  // Also check symlink on disk in a parent directory when possible on this host
  const linkProbe = await fixture();
  let createdJunction = false;
  try {
    await mkdir(join(linkProbe.root,'real-dir'));
    await symlink(join(linkProbe.root,'real-dir'),join(linkProbe.folder,'nested'),'junction');
    createdJunction = true;
  } catch { /* host disallowed symlink creation */ }
  if (createdJunction) {
    const res = await linkProbe.land();
    expect(res).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_SYMLINK_UNSUPPORTED',block:{ paths:['nested'] } });
    expect(linkProbe.authorize).not.toHaveBeenCalled();
  }

  // Second barrier check: read-tree -n -m -u still runs right before merge and blocks last-moment dirtying without running merge.
  const secondBarrierCalls: string[][] = [];
  let secondFolder = '';
  let mutated = false;
  const fBarrier = await fixture({
    wrapReader:base => async (cwd,args,input) => {
      if (cwd === secondFolder) {
        secondBarrierCalls.push([...args]);
        if (!mutated && args.includes('commit-tree')) {
          mutated = true;
          const res = await base(cwd,args,input);
          await writeFile(join(secondFolder,'tracked.txt'),'concurrent edit after preflight\n');
          return res;
        }
      }
      return base(cwd,args,input);
    },
  });
  secondFolder = fBarrier.folder;
  const barrierResult = await fBarrier.land();
  expect(barrierResult).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_REFUSED' });
  expect(secondBarrierCalls.some(args => args.includes('read-tree'))).toBe(true);
  expect(secondBarrierCalls.some(args => args.includes('merge'))).toBe(false);
  expect(await readFile(join(fBarrier.folder,'tracked.txt'),'utf8')).toBe('concurrent edit after preflight\n');
}, 240_000);

it('resolves local_commit coherently to confirmed, failed_known or unknown after controller restart with real Git and SQLite', async () => {
  const scenarios = ['confirmed_repaired','failed_known_clean','failed_known_locked','unknown_diverged'] as const;
  for (const scenario of scenarios) {
    const raw = await fixture();
    const f = await publicationFixture(true,'commit',true,{ temporaryRoot:raw.root,baseSha:raw.baseSha,projectFolder:raw.folder,deliveryBranch:{ kind:'existing' } });
    try {
      await raw.git(raw.folder,'remote','set-url','origin',f.issue.repository.url + '.git');
      const deliveryDir = join(f.directory,'projects',f.projectId,'v1','managed','issues','17');
      const retained = join(deliveryDir,'history.git');
      await mkdir(deliveryDir,{ recursive:true });
      await raw.git(raw.root,'clone','--bare',raw.bare,retained);
      await writeFile(join(retained,'factory-owner'),'issue:17');
      await raw.git(retained,'fetch',raw.bare,raw.approvedRef + ':' + raw.approvedRef);
      f.workspaces.captureDelivery.mockImplementation(async (input: { deliveryId: string }) => {
        const ref = `refs/factory/deliveries/${input.deliveryId}`;
        await raw.git(retained,'update-ref',ref,raw.commitSha);
        return { gitRef:ref,contentIdentity:raw.contentIdentity,commitSha:raw.commitSha,hasDelta:true,warnings:[] };
      });
      const targetGithub = { ...f.github, resolveBranch: vi.fn(async () => complete({ repositoryId:f.issue.repository.id,name:'main',sha:raw.baseSha })) };
      const realWorkspaces = createDeliveryTargetWorkspace(targetGithub,f.directory,raw.reader,undefined,async () => join(f.directory,'projects',f.projectId,'v1','managed'));
      const scenarioLocks: Array<{ unlock: () => Promise<void> }> = [];
      f.workspaces.inspectDeliveryTarget.mockImplementation(realWorkspaces.inspectDeliveryTarget);
      f.workspaces.inspectIntegrationTarget.mockImplementation(realWorkspaces.inspectIntegrationTarget);
      Object.assign(f.workspaces,{ verifyDeliveryTarget: realWorkspaces.verifyDeliveryTarget });
      f.workspaces.reconcileTargetCommit.mockImplementation(realWorkspaces.reconcileLocalCommit);
      f.workspaces.createTargetCommit.mockImplementation(async (d,e,t,authorize) => {
        if (scenario === 'failed_known_clean') {
          await authorize();
          return { state:'unknown',receipt:null,reason:'CRASH_BEFORE_WRITE' };
        }
        if (scenario === 'confirmed_repaired') {
          const lock = await lockFileForRead(join(raw.folder,'tracked.txt'));
          scenarioLocks.push(lock);
          await realWorkspaces.createLocalCommit(d,e,t,authorize);
          await lock.unlock();
          return { state:'unknown',receipt:null,reason:'CRASH_MID_REPAIR' };
        }
        if (scenario === 'failed_known_locked') {
          const lock = await lockFileForRead(join(raw.folder,'tracked.txt'));
          scenarioLocks.push(lock);
          await realWorkspaces.createLocalCommit(d,e,t,authorize);
          return { state:'unknown',receipt:null,reason:'CRASH_WHILE_LOCKED' };
        }
        // unknown_diverged
        await realWorkspaces.createLocalCommit(d,e,t,authorize);
        await writeFile(join(raw.folder,'tracked.txt'),'operator diverged after crash\n');
        return { state:'unknown',receipt:null,reason:'CRASH_BEFORE_CONFIRM' };
      });
      await f.implement();
      await f.approve();
      const deliveryId = f.status().deliveryId!;
      const local = f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')!;
      expect(local.state).toBe('unknown');

      await f.pipeline.close(); f.storage.close();
      const storage = openStorage({ dataDirectory:f.directory });
      try {
        storage.interruptAttempts();
        confirmTerminalStops(f,f.attemptId,storage.executionPersistence());
        const tasks: Promise<void>[] = [];
        const restartedWorkspaces = createDeliveryTargetWorkspace(targetGithub,f.directory,raw.reader,undefined,async () => join(f.directory,'projects',f.projectId,'v1','managed'));
        const publication = createPublication({ storage,github:f.github,
          workspaces:{ ...f.workspaces,inspectDeliveryTarget:restartedWorkspaces.inspectDeliveryTarget,inspectIntegrationTarget:restartedWorkspaces.inspectIntegrationTarget,
            verifyDeliveryTarget:restartedWorkspaces.verifyDeliveryTarget,createTargetCommit:restartedWorkspaces.createLocalCommit,reconcileTargetCommit:restartedWorkspaces.reconcileLocalCommit },
          cancelAttempt:async () => {},isClosed:() => false,logFailure:vi.fn(),enqueue:task => { tasks.push(task()); } });
        const context = () => ({ operationId:randomUUID(),expectedRevision:`"${f.attemptId}:${storage.getAttempt(f.attemptId).revision}"` });
        publication.reconcile(f.attemptId,{ deliveryId },context());
        await Promise.all(tasks);
        const reconciled = storage.getEffect(local.operationId);
        if (scenario === 'confirmed_repaired') {
          expect(reconciled.state).toBe('confirmed');
          expect(await readFile(join(raw.folder,'tracked.txt'),'utf8')).toBe('approved change\n');
        } else if (scenario === 'failed_known_clean') {
          expect(reconciled).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });
        } else if (scenario === 'failed_known_locked') {
          expect(reconciled).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_REPAIR_FAILED' });
          expect(storage.getDeliveryDetail(deliveryId,{}).publication.commit).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_REPAIR_FAILED',blocked:{ paths:['tracked.txt'],pathCount:1 } });
          for (const lock of scenarioLocks.splice(0)) await lock.unlock();
          publication.complete(f.attemptId,{ deliveryId,authorizedMode:'commit',authorized:true },context());
          await Promise.all(tasks);
          expect(storage.getEffect(local.operationId).state).toBe('confirmed');
          expect(storage.getAttempt(f.attemptId).result).toBe('delivered');
        } else {
          expect(reconciled).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_LANDING_UNVERIFIED' });
          expect(storage.getDeliveryDetail(deliveryId,{}).publication.commit).toMatchObject({ state:'unknown',reason:'PROJECT_FOLDER_LANDING_UNVERIFIED',blocked:{ paths:['tracked.txt'],pathCount:1 } });
          expect(await readFile(join(raw.folder,'tracked.txt'),'utf8')).toBe('operator diverged after crash\n');
        }
      } finally {
        for (const lock of scenarioLocks.splice(0)) await lock.unlock();
        storage.close();
      }
    } finally { await f.close(); }
  }
}, 240_000);

it('does not treat staged operator changes or untracked operator files at A paths as partial landing at baseSha', async () => {
  const f = await fixture({
    baseFiles:[['tracked.txt','base\n'],['del.txt','del1\n'],['other.txt','other\n']],
    approvedFiles:[['tracked.txt','approved change\n'],['approved.txt','approved only\n']],
    deletePaths:['del.txt'],
  });
  // Put exactSha into object database as if an earlier attempt had created the target commit object before blocking.
  await f.run(f.folder,['fetch','--no-tags','--no-recurse-submodules','--',f.retainedRepo,f.approvedRef]);
  const exactSha = (await f.reader(f.folder,['-c','user.name=Nova Fábrica','-c','user.email=fabrica@localhost','commit-tree',f.contentIdentity,'-p',f.baseSha],
    { isolatedConfig:true,commitTime:f.effect.expectedIdentity.commitTime!,input:`fix: Corrigir acesso ç (#17)\n\nFactory-Attempt: ${f.delivery.attemptId}\nFactory-Delivery: ${f.delivery.id}\nFactory-Operation: ${f.effect.operationId}\nFactory-Target: ${f.target.operation_id}\n` })).stdout.trim();
  expect(exactSha).toMatch(/^[a-f0-9]{40}$/);

  // 1) Staged operator edit on a touched path -> PROJECT_FOLDER_DIRTY and COMMIT_NOT_OBSERVED (not PROJECT_FOLDER_REPAIR_REFUSED).
  await writeFile(join(f.folder,'tracked.txt'),'operator staged\n');
  await f.git(f.folder,'add','tracked.txt');
  expect(await f.land()).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_DIRTY',block:{ paths:['tracked.txt'],pathCount:1 } });
  expect(await f.reconcile()).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });
  await f.git(f.folder,'reset','--hard','-q',f.baseSha);

  // 2) Staged operator deletion on a D path -> PROJECT_FOLDER_DIRTY and COMMIT_NOT_OBSERVED.
  await f.git(f.folder,'rm','-q','del.txt');
  expect(await f.land()).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_DIRTY',block:{ paths:['del.txt'],pathCount:1 } });
  expect(await f.reconcile()).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });
  await f.git(f.folder,'reset','--hard','-q',f.baseSha);

  // 3) Untracked operator file at an A path with operator bytes -> PROJECT_FOLDER_UNTRACKED_CONFLICT and COMMIT_NOT_OBSERVED.
  await writeFile(join(f.folder,'approved.txt'),'operator untracked\n');
  expect(await f.land()).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_UNTRACKED_CONFLICT',block:{ paths:['approved.txt'],pathCount:1 } });
  expect(await readFile(join(f.folder,'approved.txt'),'utf8')).toBe('operator untracked\n');
  expect(await f.reconcile()).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });

  // 4) Staged operator file at an A path (even with identical bytes) -> PROJECT_FOLDER_DIRTY and COMMIT_NOT_OBSERVED.
  await writeFile(join(f.folder,'approved.txt'),'approved only\n');
  await f.git(f.folder,'add','approved.txt');
  expect(await f.land()).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_DIRTY',block:{ paths:['approved.txt'],pathCount:1 } });
  expect(await f.reconcile()).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });
  await f.git(f.folder,'reset','--hard','-q',f.baseSha);

  // 5) Ignored operator file at an A path (even with identical bytes) -> PROJECT_FOLDER_UNTRACKED_CONFLICT and COMMIT_NOT_OBSERVED.
  await writeFile(join(f.folder,'.git','info','exclude'),'approved.txt\n');
  await writeFile(join(f.folder,'approved.txt'),'approved only\n');
  expect(await f.land()).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_UNTRACKED_CONFLICT',block:{ paths:['approved.txt'],pathCount:1 } });
  expect(await f.reconcile()).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });
}, 120_000);

it('revalidates and enforces read-tree -n -m -u as second barrier in repair so operator edits between proof and write are never overwritten', async () => {
  // 1) Operator edits a pending file during beforeRepair (between initial proof and write): repair revalidates and refuses without reset or restore.
  const callsA: string[][] = [];
  let folderA = '';
  const fA = await fixture({
    wrapReader:base => async (cwd,args,input) => { if (cwd === folderA) callsA.push([...args]); return base(cwd,args,input); },
  });
  folderA = fA.folder;
  await fA.run(fA.folder,['fetch','--no-tags','--no-recurse-submodules','--',fA.retainedRepo,fA.approvedRef]);
  const exactShaA = (await fA.reader(fA.folder,['-c','user.name=Nova Fábrica','-c','user.email=fabrica@localhost','commit-tree',fA.contentIdentity,'-p',fA.baseSha],
    { isolatedConfig:true,commitTime:fA.effect.expectedIdentity.commitTime!,input:`fix: Corrigir acesso ç (#17)\n\nFactory-Attempt: ${fA.delivery.attemptId}\nFactory-Delivery: ${fA.delivery.id}\nFactory-Operation: ${fA.effect.operationId}\nFactory-Target: ${fA.target.operation_id}\n` })).stdout.trim();
  expect(exactShaA).toMatch(/^[a-f0-9]{40}$/);
  await writeFile(join(fA.folder,'approved.txt'),'approved only\n');
  callsA.length = 0;
  const refusedA = await fA.workspaces.createLocalCommit(fA.delivery,{ ...fA.effect,state:'running' },fA.target,async () => {
    await fA.authorize();
    await writeFile(join(fA.folder,'tracked.txt'),'operator edit during beforeRepair\n');
  });
  expect(refusedA).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_REPAIR_REFUSED',block:{ paths:['tracked.txt'],pathCount:1 } });
  expect(callsA.some(args => args.includes('reset') || args.includes('restore'))).toBe(false);
  expect(await fA.git(fA.folder,'rev-parse','HEAD')).toBe(fA.baseSha);
  expect(await readFile(join(fA.folder,'tracked.txt'),'utf8')).toBe('operator edit during beforeRepair\n');

  // 2) Operator edits a pending file right after revalidation and immediately before read-tree -n -m -u in repair: second barrier catches it before reset/restore.
  const callsB: string[][] = [];
  let folderB = '';
  let mutatedB = false;
  const fB = await fixture({
    wrapReader:base => async (cwd,args,input) => {
      if (cwd === folderB) {
        callsB.push([...args]);
        if (!mutatedB && args.includes('write-tree')) {
          mutatedB = true;
          const res = await base(cwd,args,input);
          await writeFile(join(folderB,'tracked.txt'),'concurrent edit before repair read-tree\n');
          return res;
        }
      }
      return base(cwd,args,input);
    },
  });
  folderB = fB.folder;
  await fB.run(fB.folder,['fetch','--no-tags','--no-recurse-submodules','--',fB.retainedRepo,fB.approvedRef]);
  await fB.reader(fB.folder,['-c','user.name=Nova Fábrica','-c','user.email=fabrica@localhost','commit-tree',fB.contentIdentity,'-p',fB.baseSha],
    { isolatedConfig:true,commitTime:fB.effect.expectedIdentity.commitTime!,input:`fix: Corrigir acesso ç (#17)\n\nFactory-Attempt: ${fB.delivery.attemptId}\nFactory-Delivery: ${fB.delivery.id}\nFactory-Operation: ${fB.effect.operationId}\nFactory-Target: ${fB.target.operation_id}\n` });
  await writeFile(join(fB.folder,'approved.txt'),'approved only\n');
  callsB.length = 0;
  const refusedB = await fB.land();
  expect(refusedB).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_REPAIR_REFUSED',block:{ paths:['tracked.txt'],pathCount:1 } });
  expect(callsB.some(args => args.includes('read-tree') && args.includes('-n') && args.includes('-m') && args.includes('-u'))).toBe(true);
  expect(callsB.some(args => args.includes('reset') || args.includes('restore'))).toBe(false);
  expect(await fB.git(fB.folder,'rev-parse','HEAD')).toBe(fB.baseSha);
  expect(await readFile(join(fB.folder,'tracked.txt'),'utf8')).toBe('concurrent edit before repair read-tree\n');
}, 120_000);

it('never repairs the Pasta do projeto during restart reconciliation when authorization or terminal stops are not valid', async () => {
  const raw = await fixture();
  const f = await publicationFixture(true,'commit',true,{ temporaryRoot:raw.root,baseSha:raw.baseSha,projectFolder:raw.folder,deliveryBranch:{ kind:'existing' } });
  try {
    leaveReviewerStopUnconfirmed(f);
    await raw.git(raw.folder,'remote','set-url','origin',f.issue.repository.url + '.git');
    const deliveryDir = join(f.directory,'projects',f.projectId,'v1','managed','issues','17');
    const retained = join(deliveryDir,'history.git');
    await mkdir(deliveryDir,{ recursive:true });
    await raw.git(raw.root,'clone','--bare',raw.bare,retained);
    await writeFile(join(retained,'factory-owner'),'issue:17');
    await raw.git(retained,'fetch',raw.bare,raw.approvedRef + ':' + raw.approvedRef);
    f.workspaces.captureDelivery.mockImplementation(async (input: { deliveryId: string }) => {
      const ref = `refs/factory/deliveries/${input.deliveryId}`;
      await raw.git(retained,'update-ref',ref,raw.commitSha);
      return { gitRef:ref,contentIdentity:raw.contentIdentity,commitSha:raw.commitSha,hasDelta:true,warnings:[] };
    });
    const targetGithub = { ...f.github, resolveBranch: vi.fn(async () => complete({ repositoryId:f.issue.repository.id,name:'main',sha:raw.baseSha })) };
    const realWorkspaces = createDeliveryTargetWorkspace(targetGithub,f.directory,raw.reader,undefined,async () => join(f.directory,'projects',f.projectId,'v1','managed'));
    f.workspaces.inspectDeliveryTarget.mockImplementation(realWorkspaces.inspectDeliveryTarget);
    f.workspaces.inspectIntegrationTarget.mockImplementation(realWorkspaces.inspectIntegrationTarget);
    Object.assign(f.workspaces,{ verifyDeliveryTarget: realWorkspaces.verifyDeliveryTarget });
    f.workspaces.reconcileTargetCommit.mockImplementation(realWorkspaces.reconcileLocalCommit);
    const lock = await lockFileForRead(join(raw.folder,'tracked.txt'));
    f.workspaces.createTargetCommit.mockImplementation(async (d,e,t,authorize) => {
      await realWorkspaces.createLocalCommit(d,e,t,authorize);
      return { state:'unknown',receipt:null,reason:'CRASH_WHILE_LOCKED' };
    });
    await f.implement();
    await f.approve();
    await lock.unlock();
    const deliveryId = f.status().deliveryId!;
    const local = f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')!;
    expect(await readFile(join(raw.folder,'tracked.txt'),'utf8')).toBe('base\n');

    await f.pipeline.close(); f.storage.close();
    const storage = openStorage({ dataDirectory:f.directory });
    try {
      storage.interruptAttempts();
      // Do NOT confirm terminal stops yet: reconcile must refuse to write via beforeRepair.
      const tasks: Promise<void>[] = [];
      const restartedWorkspaces = createDeliveryTargetWorkspace(targetGithub,f.directory,raw.reader,undefined,async () => join(f.directory,'projects',f.projectId,'v1','managed'));
      const publication = createPublication({ storage,github:f.github,
        workspaces:{ ...f.workspaces,inspectDeliveryTarget:restartedWorkspaces.inspectDeliveryTarget,inspectIntegrationTarget:restartedWorkspaces.inspectIntegrationTarget,
          verifyDeliveryTarget:restartedWorkspaces.verifyDeliveryTarget,createTargetCommit:restartedWorkspaces.createLocalCommit,reconcileTargetCommit:restartedWorkspaces.reconcileLocalCommit },
        cancelAttempt:async () => {},isClosed:() => false,logFailure:vi.fn(),enqueue:task => { tasks.push(task()); } });
      const context = () => ({ operationId:randomUUID(),expectedRevision:`"${f.attemptId}:${storage.getAttempt(f.attemptId).revision}"` });
      const blockedOp = publication.reconcile(f.attemptId,{ deliveryId },context());
      await Promise.all(tasks);
      expect(await readFile(join(raw.folder,'tracked.txt'),'utf8')).toBe('base\n');
      expect(storage.getEffect(local.operationId).state).toBe('unknown');
      expect(storage.getOperation(blockedOp.operation_id)).toMatchObject({ state:'unknown',error:{ code:'RESOURCES_NOT_RECONCILED' } });

      // Once terminal stops are confirmed and authority is valid, reconcile repairs and confirms.
      confirmTerminalStops(f,f.attemptId,storage.executionPersistence());
      const okOp = publication.reconcile(f.attemptId,{ deliveryId },context());
      await Promise.all(tasks);
      expect(storage.getOperation(okOp.operation_id)?.state).toBe('succeeded');
      expect(storage.getEffect(local.operationId).state).toBe('confirmed');
      expect(await readFile(join(raw.folder,'tracked.txt'),'utf8')).toBe('approved change\n');
    } finally { storage.close(); }
  } finally { await f.close(); }
}, 120_000);

const suggestedBranch = 'fix/17-corrigir-acesso-c';
const absent = async (f: Fixture,ref: string) => (await f.run(f.folder,['rev-parse','--verify','--quiet','--end-of-options',ref])).exitCode === 1;

it('creates a branch nova at the base tip with switch, checks it out and commits there, leaving the base branch, operator files and hooks alone; a repeat is idempotent', async () => {
  const f = await fixture({ deliveryBranch:{ kind:'new',name:'feat/login',name_origin:'typed',suggested_name:suggestedBranch } });
  expect(f.plan).toMatchObject({ branch_ref:'refs/heads/feat/login',local_identity:{ branch_kind:'new',operator_config:expect.any(Object) } });
  await writeFile(join(f.folder,'junk.txt'),'mine\n');
  const result = await f.land();
  expect(result).toMatchObject({ state:'confirmed',reason:null,receipt:{ branchRef:'refs/heads/feat/login',parentSha:f.baseSha } });
  const sha = result.receipt!.id;
  expect(await f.git(f.folder,'symbolic-ref','HEAD')).toBe('refs/heads/feat/login');
  expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(sha);
  expect(await f.git(f.folder,'rev-parse','HEAD^')).toBe(f.baseSha);
  expect(await f.git(f.folder,'rev-parse','HEAD^{tree}')).toBe(f.contentIdentity);
  expect(await f.git(f.folder,'rev-parse','refs/heads/main')).toBe(f.baseSha);
  expect(await readFile(join(f.folder,'tracked.txt'),'utf8')).toBe('approved change\n');
  expect(await readFile(join(f.folder,'nested','new.txt'),'utf8')).toBe('nested\n');
  expect((await f.run(f.folder,['diff','--cached','--quiet'])).exitCode).toBe(0);
  expect(await f.git(f.folder,'status','--porcelain','--untracked-files=all')).toBe('?? junk.txt');
  expect(await exists(f.marker)).toBe(false);
  expect(await f.land()).toMatchObject({ state:'confirmed',receipt:{ id:sha } });
  expect(await f.git(f.folder,'rev-list','--count','refs/heads/main..refs/heads/feat/login')).toBe('1');
}, 120_000);

it('never overwrites an ignored file the branch nova would write: the switch is refused before any ref or file changes', async () => {
  const f = await fixture({ deliveryBranch:{ kind:'new',name:suggestedBranch,name_origin:'suggested',suggested_name:suggestedBranch },
    beforeInspect: async folder => { await writeFile(join(folder,'.git','info','exclude'),'approved.txt\n'); await writeFile(join(folder,'approved.txt'),'operator secret\n'); } });
  expect(await f.land()).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_UNTRACKED_CONFLICT',block:{ paths:['approved.txt'] } });
  expect(await readFile(join(f.folder,'approved.txt'),'utf8')).toBe('operator secret\n');
  expect(await f.git(f.folder,'symbolic-ref','HEAD')).toBe('refs/heads/main');
  expect(await f.git(f.folder,'rev-parse','HEAD')).toBe(f.baseSha);
  expect(await absent(f,'refs/heads/' + suggestedBranch)).toBe(true);
}, 120_000);

it('keeps every existing ref intact: a suggested name in use moves to the next suffix, a typed one is refused, and a ref created after inspection is never written', async () => {
  const f = await fixture({ deliveryBranch:{ kind:'new',name:suggestedBranch,name_origin:'suggested',suggested_name:suggestedBranch },
    beforeInspect: async (folder,git) => { await git(folder,'branch',suggestedBranch); await git(folder,'branch','feat/login'); } });
  expect(f.plan.branch_ref).toBe('refs/heads/' + suggestedBranch + '-2');
  await expect(f.workspaces.inspectDeliveryTarget(f.folder,{ ...f.task,deliveryBranch:{ kind:'new',name:'feat/login',name_origin:'typed',suggested_name:suggestedBranch } },f.task))
    .rejects.toMatchObject({ code:'DELIVERY_BRANCH_COLLISION' });
  await f.git(f.folder,'branch',suggestedBranch + '-2');
  const result = await f.land();
  expect(result.state).not.toBe('confirmed');
  for (const branch of [suggestedBranch,suggestedBranch + '-2','feat/login','main']) expect(await f.git(f.folder,'rev-parse','refs/heads/' + branch)).toBe(f.baseSha);
  expect(await f.git(f.folder,'symbolic-ref','HEAD')).toBe('refs/heads/main');
  expect(await readFile(join(f.folder,'tracked.txt'),'utf8')).toBe('base\n');
}, 120_000);

it('never cuts a branch nova from a stale base: a base branch that moved after inspection is reported as DELIVERY_BASE_CHANGED with nothing written', async () => {
  const f = await fixture({ deliveryBranch:{ kind:'new',name:'feat/login',name_origin:'typed',suggested_name:suggestedBranch } });
  const moved = await f.git(f.folder,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit-tree',await f.git(f.folder,'rev-parse',f.baseSha + '^{tree}'),'-p',f.baseSha,'-m','operator moved main');
  await f.git(f.folder,'branch','feature/elsewhere',f.baseSha); await f.git(f.folder,'switch','feature/elsewhere'); await f.git(f.folder,'update-ref','refs/heads/main',moved,f.baseSha);
  expect(await f.land()).toMatchObject({ state:'failed_known',reason:'DELIVERY_BASE_CHANGED' });
  expect(await absent(f,'refs/heads/feat/login')).toBe(true);
  expect(await f.git(f.folder,'symbolic-ref','HEAD')).toBe('refs/heads/feature/elsewhere');
}, 120_000);
