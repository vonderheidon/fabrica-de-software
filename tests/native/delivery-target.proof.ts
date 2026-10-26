import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Delivery, EffectView, GitHubQueryResult } from '#contracts';
import type { GitInput, GitReader } from '../../apps/controller/src/modules/workspaces/git.js';
import { createDeliveryTargetWorkspace } from '../../apps/controller/src/modules/workspaces/delivery-target.js';
import { createIntegrationImporter } from '../../apps/controller/src/modules/workspaces/integration.js';
import { createBranchLister } from '../../apps/controller/src/modules/workspaces/branches.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root,{ recursive: true,force: true }); });
const complete = <T>(data: T): GitHubQueryResult<T> => ({ state:'complete',data,diagnostics:[],retryAtMs:null });
function realGit(cwd: string,args: readonly string[],input?: GitInput) {
  const commitDate = input?.commitTime === undefined ? {} : { GIT_AUTHOR_DATE:'@' + input.commitTime + ' +0000',GIT_COMMITTER_DATE:'@' + input.commitTime + ' +0000' };
  const result = spawnSync('git',[...args],{ cwd,encoding:'utf8',input:input?.input,windowsHide:true,shell:false,timeout:30_000,
    env:{ ...process.env,...commitDate,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform === 'win32' ? 'NUL' : '/dev/null',GIT_TERMINAL_PROMPT:'0' } });
  if (result.error) throw result.error;
  return { exitCode:result.status ?? 1,stdout:result.stdout ?? '' };
}
function git(cwd: string,...args: string[]) {
  const result = realGit(cwd,args);
  if (result.exitCode !== 0) throw new Error('fixture git failed: ' + args[0]);
  return result.stdout.trim();
}

it.each([[false, 'automatic'], [true, 'automatic'], [true, 'new'], [true, 'existing']] as const)('commits and reconciles with project storage=%s and branch=%s preserving checkout state', async (projectScoped, branchKind) => {
  const root = await mkdtemp(join(process.cwd(),'.cache','delivery-target-git-')); roots.push(root);
  const bare = join(root,'origin.git'); const seed = join(root,'seed'); const targetRoot = join(root,'clone ç');
  const data = join(root,'factory-data'); const attemptRoot = projectScoped ? join(data,'projects','p','v1','managed') : data;
  const retained = join(attemptRoot,'git');
  await (await import('node:fs/promises')).mkdir(retained,{ recursive:true });
  git(root,'init','--bare',bare);
  git(root,'init','-b','main',seed);
  git(seed,'config','user.name','Fixture'); git(seed,'config','user.email','fixture@example.test');
  await writeFile(join(seed,'tracked.txt'),'base\n'); git(seed,'add','--','tracked.txt'); git(seed,'commit','-m','base');
  const baseSha = git(seed,'rev-parse','HEAD');
  git(seed,'remote','add','origin',bare); git(seed,'push','origin','HEAD:refs/heads/main');
  git(bare,'symbolic-ref','HEAD','refs/heads/main');
  const attemptId = randomUUID(); const deliveryId = randomUUID(); const passageId = randomUUID(); const targetOperationId = randomUUID();
  const approvedRef = 'refs/factory/deliveries/' + deliveryId;
  const retainedRepo = join(retained,attemptId + '.git'); git(root,'clone','--bare',bare,retainedRepo);
  await writeFile(join(retainedRepo,'factory-owner'),attemptId);
  git(seed,'checkout','-b','approved'); await writeFile(join(seed,'approved.txt'),'approved only\n');
  git(seed,'add','--','approved.txt'); git(seed,'commit','-m','approved');
  const commitSha = git(seed,'rev-parse','HEAD'); const contentIdentity = git(seed,'rev-parse','HEAD^{tree}');
  git(seed,'push','origin',commitSha + ':' + approvedRef);
  git(retainedRepo,'fetch',bare,approvedRef + ':' + approvedRef);
  git(root,'clone',bare,targetRoot); git(targetRoot,'remote','set-url','origin','https://github.com/org/repo.git');
  git(targetRoot,'config','user.name','Operator'); git(targetRoot,'config','user.email','operator@example.test');
  await writeFile(join(targetRoot,'tracked.txt'),'staged version\n'); git(targetRoot,'add','--','tracked.txt');
  await writeFile(join(targetRoot,'tracked.txt'),'staged plus working change\n');
  await writeFile(join(targetRoot,'staged.txt'),'staged file\n'); git(targetRoot,'add','--','staged.txt');
  await writeFile(join(targetRoot,'untracked.txt'),'untracked bytes\n');
  git(targetRoot,'update-ref','refs/heads/fix/17-corrigir-acesso-c-e-unicode',git(targetRoot,'rev-parse','HEAD'));
  if (branchKind === 'existing') {
    git(targetRoot,'branch','release',baseSha);
    const list = createBranchLister({},async (cwd,args,input) => realGit(cwd,args,input));
    expect(await list({kind:'local',location:targetRoot})).toMatchObject({state:'complete',branches:expect.arrayContaining(['main','release'])});
    expect(realGit(bare,['rev-parse','--verify','refs/heads/release']).exitCode).not.toBe(0);
  }
  const originalHead = git(targetRoot,'rev-parse','HEAD');
  const originalBranch = git(targetRoot,'symbolic-ref','HEAD');
  const originalStatus = git(targetRoot,'status','--porcelain=v2','-z','--untracked-files=all');
  const indexPath = join(targetRoot,'.git','index'); const originalIndex = await readFile(indexPath);
  const originalTracked = await readFile(join(targetRoot,'tracked.txt')); const originalStaged = await readFile(join(targetRoot,'staged.txt'));
  const originalUntracked = await readFile(join(targetRoot,'untracked.txt'));
  const repository = { id:'R_target',owner:{ id:'O_target',login:'org' },name:'repo',url:'https://github.com/org/repo',defaultBranch:'main',isArchived:false,isPrivate:true };
  const github = { getRepository:vi.fn(async () => complete(repository)),resolveBranch:vi.fn(async () => complete({ repositoryId:repository.id,name:'main',sha:baseSha })) };
  let loseCommitTreeResponse = true; let loseUpdateRef = true; let commitTreeCount = 0; const commitIds: string[] = [];
  const port: GitReader = async (cwd,args,input) => {
    const result = realGit(cwd,args,input);
    if (args.includes('commit-tree')) {
      commitTreeCount += 1;
      if (result.exitCode === 0) commitIds.push(result.stdout.trim());
      if (loseCommitTreeResponse) { loseCommitTreeResponse = false; throw new Error('controlled response loss after object creation'); }
    }
    if (loseUpdateRef && cwd === targetRoot && args.includes('update-ref') && args.some(arg => arg.startsWith('refs/heads/fix/17-corrigir-acesso-c-e-unicode-') || arg === 'refs/heads/custom/result' || arg === 'refs/heads/release')) {
      loseUpdateRef = false; throw new Error('controlled response loss after ref creation');
    }
    return result;
  };
  const resolveAttemptRoot = vi.fn(async (id: string) => { expect(id).toBe(attemptId); return attemptRoot; });
  const workspaces = createDeliveryTargetWorkspace(github,data,port,undefined,resolveAttemptRoot);
  const delivery: Delivery = { id:deliveryId,attemptId,producerPassageId:passageId,round:1,baseSha,captureState:'captured',
    gitRef:approvedRef,repositoryRelative:'git/' + attemptId + '.git',contentIdentity,commitSha,hasDelta:true,diagnostic:null,capturedAtMs:1,revision:1,warnings:[] };
  const task = { attemptId,approvedRef,contentIdentity,issueNumber:17,issueTitle:'fix: Corrigir acesso ç e Unicode',repositoryId:repository.id,repositoryUrl:repository.url,baseBranch:'main',baseSha, ...(branchKind === 'automatic' ? {} : { sourceKind: 'local' as const, deliveryBranch: { kind:branchKind, name:branchKind === 'existing' ? 'release' : 'custom/result' } }) };
  const plan = await workspaces.inspectDeliveryTarget(targetRoot,task,{ approvedRef,contentIdentity,baseSha });
  if (branchKind === 'existing') {
    await expect(workspaces.inspectDeliveryTarget(targetRoot,{ ...task,deliveryBranch:{kind:'existing',name:'main'} },task)).rejects.toMatchObject({code:'DELIVERY_BRANCH_IN_USE'});
  }
  if (branchKind === 'new') {
    await expect(workspaces.inspectDeliveryTarget(targetRoot,{ ...task,deliveryBranch:{kind:'new',name:'main'} },task)).rejects.toMatchObject({code:'DELIVERY_BRANCH_COLLISION'});
  }
  expect(plan.task_type).toBe('fix'); expect(plan.task_description).toBe('Corrigir acesso ç e Unicode');
  expect(plan.branch_ref).toBe(branchKind === 'automatic' ? 'refs/heads/fix/17-corrigir-acesso-c-e-unicode-' + attemptId.replaceAll('-','').slice(0,8) : branchKind === 'existing' ? 'refs/heads/release' : 'refs/heads/custom/result');
  const target = { operation_id:targetOperationId,selection_operation_id:null,delivery_id:deliveryId,attempt_id:attemptId,repository_id:repository.id,
    local_path:plan.local_path,local_identity:plan.local_identity,branch_ref:plan.branch_ref,task_type:plan.task_type,task_description:plan.task_description,
    issue_number:17,base_branch:'main',base_sha:baseSha,approved_ref:approvedRef,content_identity:contentIdentity,format_version:1 as const,created_at_ms:1 };
  const effect: EffectView = { operationId:randomUUID(),attemptId,creationId:null,deliveryId,kind:'local_commit',scopeKey:deliveryId,
    state:'running',expectedIdentity:{ repositoryId:repository.id,issueId:randomUUID(),issueNumber:17,contentIdentity,parentSha:baseSha,branchRef:plan.branch_ref,
      commitTime:1_798_000_000,targetOperationId,taskType:plan.task_type,taskDescription:plan.task_description,repositoryOwner:'org',repositoryName:'repo',baseBranch:'main' },
    confirmedIdentity:null,receipt:null,reason:null,authorized:true,revision:2,sentAtMs:1,confirmedAtMs:null };
  const first = await workspaces.createLocalCommit(delivery,effect,target,async () => { expect(git(targetRoot,'symbolic-ref','HEAD')).toBe(originalBranch); });
  expect(first).toMatchObject({ state:'unknown',receipt:null });
  const absent = await workspaces.reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target);
  expect(absent).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });
  const retried = await workspaces.createLocalCommit(delivery,effect,target,async () => {});
  expect(retried).toMatchObject({ state:'unknown',receipt:null });
  const reconciled = await workspaces.reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target);
  expect(reconciled).toMatchObject({ state:'confirmed',reason:null,receipt:{ targetOperationId,taskType:'fix',taskDescription:'Corrigir acesso ç e Unicode',branchRef:plan.branch_ref } });
  expect(commitTreeCount).toBe(2); expect(commitIds).toHaveLength(2); expect(commitIds[0]).toBe(commitIds[1]);
  expect(git(targetRoot,'rev-parse','HEAD')).toBe(originalHead);
  expect(git(targetRoot,'symbolic-ref','HEAD')).toBe(originalBranch);
  expect(git(targetRoot,'status','--porcelain=v2','-z','--untracked-files=all')).toBe(originalStatus);
  expect(await readFile(indexPath)).toEqual(originalIndex);
  expect(await readFile(join(targetRoot,'tracked.txt'))).toEqual(originalTracked);
  expect(await readFile(join(targetRoot,'staged.txt'))).toEqual(originalStaged);
  expect(await readFile(join(targetRoot,'untracked.txt'))).toEqual(originalUntracked);
  const commit = git(targetRoot,'show','--no-patch','--format=%T%x00%P%x00%B',reconciled.receipt!.id);
  expect(commit).toContain(contentIdentity + '\0' + baseSha + '\0fix: Corrigir acesso ç e Unicode (#17)');
  expect(git(targetRoot,'rev-parse','refs/heads/fix/17-corrigir-acesso-c-e-unicode')).toBe(baseSha);
  expect(git(targetRoot,'rev-parse',plan.branch_ref)).toBe(reconciled.receipt!.id);
  expect(git(retainedRepo,'rev-parse',plan.branch_ref)).toBe(reconciled.receipt!.id);
  if (branchKind === 'existing') return;
  // Advance only a ref in the disposable operator clone; staged/unstaged/untracked bytes stay intact.
  const newBase = git(targetRoot,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit-tree',contentIdentity,'-p',baseSha,'-m','new base');
  git(targetRoot,'update-ref','refs/heads/main',newBase,baseSha);
  github.resolveBranch.mockResolvedValue(complete({ repositoryId:repository.id,name:'main',sha:newBase }));
  const movedHead = git(targetRoot,'rev-parse','HEAD'); const movedStatus = git(targetRoot,'status','--porcelain=v2','-z','--untracked-files=all');
  await expect(workspaces.inspectDeliveryTarget(targetRoot,task,task)).rejects.toMatchObject({ code:'DELIVERY_BASE_CHANGED' });
  const integration = await workspaces.inspectIntegrationTarget(targetRoot,task);
  expect(integration.baseSha).toBe(newBase);
  const importer = createIntegrationImporter(async (cwd,args,input) => realGit(cwd,args,input),async () => seed);
  await importer(delivery,randomUUID(),integration);
  expect(git(seed,'rev-parse',newBase + '^{tree}')).toBe(contentIdentity);
  expect(git(targetRoot,'rev-parse','HEAD')).toBe(movedHead);
  expect(git(targetRoot,'status','--porcelain=v2','-z','--untracked-files=all')).toBe(movedStatus);
  expect(await readFile(indexPath)).toEqual(originalIndex);
  expect(await readFile(join(targetRoot,'tracked.txt'))).toEqual(originalTracked);
  expect(await readFile(join(targetRoot,'staged.txt'))).toEqual(originalStaged);
  expect(await readFile(join(targetRoot,'untracked.txt'))).toEqual(originalUntracked);
  const identity = await lstat(await realpath(targetRoot),{ bigint:true });
  await expect(importer(delivery,randomUUID(),{ ...integration,rootIdentity:`${identity.dev}:${identity.ino}:replaced` })).rejects.toMatchObject({ code:'DELIVERY_TARGET_CHANGED' });
});
