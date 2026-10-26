import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readlink, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery, DeliveryTarget, type DeliveryTarget as SealedTarget, EffectView, type EffectReceipt } from '#contracts';
import type { GitHub } from '../github/index.js';
import { CaptureError, managedRoot, metadataBytes, noBorrowedObjects, plainDirectory } from './capture.js';
import type { GitReader } from './git.js';
import type { AttemptRootResolver } from './project-storage.js';
import { githubReference } from './inspect.js';

export interface DeliveryTaskInput {
  sourceKind?: 'local' | 'github' | undefined; deliveryBranch?: { kind: 'new' | 'existing'; name: string } | null | undefined;
  attemptId: string; approvedRef: string; contentIdentity: string; issueNumber: number; issueTitle: string; repositoryId: string; repositoryUrl: string; baseBranch: string; baseSha: string;
}
export interface DeliveryTargetInspection {
  repository_id: string; local_path: string; local_identity: SealedTarget['local_identity']; branch_ref: string;
  task_type: SealedTarget['task_type']; task_description: string;
}
export interface SelectedDeliveryPath { path: string; rootIdentity: string | null; selectionOperationId: string | null }
export interface TargetCommitResult { state: 'confirmed' | 'not_applicable' | 'failed_known' | 'unknown'; receipt: EffectReceipt | null; reason: string | null }

type TaskType = SealedTarget['task_type'];
const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const targetError = (code: string): never => { throw new CaptureError(code); };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function taskIdentity(title: string,changedPaths: readonly string[] = []): { type: TaskType; description: string; slug: string } {
  const allowed: TaskType[] = ['feat','fix','docs','refactor','test','chore','perf','build','ci','revert'];
  const prefix = /^\s*(feat|fix|docs|refactor|test|chore|perf|build|ci|revert)\s*[:/-]\s*/iu.exec(title);
  const clean = title.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/gu,' ').trim();
  let type: TaskType = prefix && allowed.includes(prefix[1]!.toLowerCase() as TaskType) ? prefix[1]!.toLowerCase() as TaskType : 'feat';
  if (!prefix && /\b(corrigir|corre[cç][aã]o|bug|erro|falha|fix)\b/iu.test(clean)) type = 'fix';
  else if (!prefix && /\b(documenta[cç][aã]o|documentar|docs?)\b/iu.test(clean)) type = 'docs';
  else if (!prefix && /\b(refatorar|refatora[cç][aã]o|refactor)\b/iu.test(clean)) type = 'refactor';
  else if (!prefix && /\b(testes?|tests?|specs?)\b/iu.test(clean)) type = 'test';
  else if (!prefix && /\b(desempenho|performance|perf)\b/iu.test(clean)) type = 'perf';
  else if (!prefix && /\b(build|compila[cç][aã]o)\b/iu.test(clean)) type = 'build';
  else if (!prefix && /\b(ci|integra[cç][aã]o cont[ií]nua|workflow)\b/iu.test(clean)) type = 'ci';
  else if (!prefix && /\b(depend[eê]ncia|configura[cç][aã]o|manuten[cç][aã]o)\b/iu.test(clean)) type = 'chore';
  else if (!prefix && changedPaths.length && changedPaths.every(path => path.startsWith('docs/') || /\.(?:md|mdx|rst|adoc)$/iu.test(path))) type = 'docs';
  else if (!prefix && changedPaths.length && changedPaths.every(path => /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/iu.test(path))) type = 'test';
  else if (!prefix && changedPaths.length && changedPaths.every(path => path.startsWith('.github/workflows/'))) type = 'ci';
  const description = (prefix ? clean.replace(/^\s*(?:feat|fix|docs|refactor|test|chore|perf|build|ci|revert)\s*[:/-]\s*/iu,'') : clean)
    .slice(0,256).trim().replace(/[.\s]+$/u,'');
  const slug = description.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/ß/gu,'ss').replace(/æ/giu,'ae').replace(/œ/giu,'oe')
    .toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,72).replace(/-+$/u,'') || `issue-${title.length}`;
  return { type,description: description || 'melhoria aprovada',slug };
}
async function objectIdentity(path: string): Promise<string> {
  const s = await lstat(path,{ bigint: true });
  if (!s.isDirectory() || s.isSymbolicLink()) targetError('DELIVERY_TARGET_CHANGED');
  return `${s.dev}:${s.ino}:${s.birthtimeNs}`;
}
async function fileDigest(path: string): Promise<string> {
  const before = await lstat(path,{ bigint: true });
  if (before.isSymbolicLink()) return hash(`link\0${await readlink(path)}`);
  if (!before.isFile()) return hash(`${before.isDirectory() ? 'directory' : 'special'}\0${before.dev}:${before.ino}:${before.mode}`);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk as Buffer);
  const after = await lstat(path,{ bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) targetError('DELIVERY_TARGET_CHANGED');
  return digest.digest('hex');
}
function nul(value: string): string[] {
  if (value && !value.endsWith('\0')) targetError('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
  return value ? value.slice(0,-1).split('\0') : [];
}
function inside(root: string,path: string): boolean {
  const rel = relative(root,path); return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Creates commits and refs in the registered clone's object database without opening or changing its checkout. */
export function createDeliveryTargetWorkspace(github: Pick<GitHub,'getRepository'|'resolveBranch'>,dataDirectory: string | undefined,git: GitReader | undefined,
  canonicalize: (path: string) => Promise<string> = realpath, resolveAttemptRoot?: AttemptRootResolver) {
  const isolated: GitReader | undefined = git ? (cwd,args,input) => git(cwd,args,{ ...input,isolatedConfig: true }) : undefined;
  async function gitRun(root: string,args: string[],input?: string,config: string[] = []) {
    const runGit = isolated; if (!runGit) targetError('CONTEXT_UNAVAILABLE');
    const result = await runGit!(root,['--no-optional-locks',...config,...args],input === undefined ? undefined : { input });
    if (result.exitCode !== 0) targetError('DELIVERY_TARGET_GIT_FAILED');
    return result.stdout;
  }
  async function observe(rootInput: string,task: DeliveryTaskInput,approved: { approvedRef: string; contentIdentity: string; baseSha: string },checkBase = true) {
    const gitPort = isolated; if (!gitPort || !isAbsolute(rootInput) || /[\u0000-\u001f\u007f]/u.test(rootInput)) targetError('DELIVERY_TARGET_PATH_INVALID');
    const runGit = gitPort!;
    const root = await canonicalize(rootInput);
    await plainDirectory(root,canonicalize);
    const rootIdentity = await objectIdentity(root);
    const top = (await gitRun(root,['rev-parse','--show-toplevel'])).trim();
    if (await canonicalize(top) !== root) targetError('DELIVERY_TARGET_ROOT_MISMATCH');
    if ((await gitRun(root,['rev-parse','--is-inside-work-tree'])).trim() !== 'true') targetError('DELIVERY_TARGET_NOT_WORKTREE');
    const gitDirValue = (await gitRun(root,['rev-parse','--absolute-git-dir'])).trim();
    const gitDir = await canonicalize(gitDirValue); await plainDirectory(gitDir,canonicalize);
    const gitDirectoryIdentity = await objectIdentity(gitDir);
    const remotes = nul(await gitRun(root,['config','--null','--get-regexp','^remote\\..*\\.url$']));
    const repositoryReference = githubReference(task.repositoryUrl);
    if (!repositoryReference) targetError('DELIVERY_TARGET_REPOSITORY_MISMATCH');
    const matches: { name: string; owner: string; repo: string; remoteHash: string }[] = [];
    for (const entry of remotes) {
      const m = /^remote\.(.+)\.url\n([\s\S]+)$/u.exec(entry);
      if (!m) targetError('DELIVERY_TARGET_REMOTE_INVALID');
      const ref = githubReference(m![2]!);
      if (ref && `${ref.owner}/${ref.name}`.toLowerCase() === `${repositoryReference!.owner}/${repositoryReference!.name}`.toLowerCase()) matches.push({ name:m![1]!,owner:ref.owner,repo:ref.name,remoteHash:hash(m![2]!) });
    }
    const identity = await github.getRepository(repositoryReference!);
    if (identity.state !== 'complete' || identity.data?.id !== task.repositoryId || matches.length !== 1) targetError('DELIVERY_TARGET_REPOSITORY_MISMATCH');
    if (checkBase) {
      const branchCheck = await runGit(root,['check-ref-format','--branch',task.baseBranch]);
      if (branchCheck.exitCode !== 0) targetError('DELIVERY_BASE_BRANCH_INVALID');
      const refs = [`refs/heads/${task.baseBranch}`,`refs/remotes/${matches[0]!.name}/${task.baseBranch}`];
      let observedBase: string | null = null;
      for (const ref of refs) {
        const r = await runGit(root,['rev-parse','--verify','--quiet','--end-of-options',`${ref}^{commit}`]);
        if (r.exitCode === 0) { if (!oid.test(r.stdout.trim())) targetError('DELIVERY_BASE_INVALID'); observedBase = r.stdout.trim(); break; }
      }
      if (observedBase !== approved.baseSha) targetError('DELIVERY_BASE_CHANGED');
      if (task.sourceKind !== 'local' && task.deliveryBranch?.kind !== 'existing') {
        const remoteBase = await github.resolveBranch({ owner: matches[0]!.owner,name: matches[0]!.repo },task.baseBranch);
        if (remoteBase.state !== 'complete' || remoteBase.data?.repositoryId !== task.repositoryId || remoteBase.data.sha !== approved.baseSha) targetError('DELIVERY_BASE_CHANGED');
      }
    }
    if (!oid.test(approved.baseSha) || !oid.test(approved.contentIdentity) || !/^refs\/factory\/deliveries\/[a-f0-9-]{36}$/u.test(approved.approvedRef) ||
        approved.baseSha !== task.baseSha) targetError('DELIVERY_APPROVED_VERSION_INVALID');
    const head = (await gitRun(root,['rev-parse','--verify','HEAD^{commit}'])).trim();
    if (!oid.test(head)) targetError('DELIVERY_CHECKOUT_INVALID');
    const currentBranchResult = await runGit(root,['symbolic-ref','--quiet','HEAD']);
    const observedBranchRef = currentBranchResult.exitCode === 0 ? currentBranchResult.stdout.trim() : null;
    const status = await gitRun(root,['status','--porcelain=v2','-z','--untracked-files=all','--ignore-submodules=none']);
    const paths = [...new Set([...nul(await gitRun(root,['ls-files','-z'])),...nul(await gitRun(root,['ls-files','--others','--exclude-standard','-z']))])].sort();
    const files: [string,string][] = [];
    for (const path of paths) {
      if (!path || path.includes('\\') || path.includes(':') || path.split('/').some(part => part === '' || part === '.' || part === '..')) targetError('DELIVERY_CHECKOUT_PATH_INVALID');
      const absolute = resolve(root,...path.split('/'));
      if (!inside(root,absolute)) targetError('DELIVERY_CHECKOUT_PATH_INVALID');
      files.push([path,await fileDigest(absolute)]);
    }
    const indexValue = (await gitRun(root,['rev-parse','--git-path','index'])).trim();
    const indexPath = await realpath(isAbsolute(indexValue) ? indexValue : resolve(root,indexValue));
    if (!inside(gitDir,indexPath)) targetError('DELIVERY_INDEX_INVALID');
    const indexBefore = await lstat(indexPath,{ bigint:true });
    if (!indexBefore.isFile() || indexBefore.isSymbolicLink()) targetError('DELIVERY_INDEX_INVALID');
    const indexHash = hash(await readFile(indexPath)); const indexAfter = await lstat(indexPath,{ bigint:true });
    if (indexBefore.dev !== indexAfter.dev || indexBefore.ino !== indexAfter.ino || indexBefore.size !== indexAfter.size || indexBefore.mtimeNs !== indexAfter.mtimeNs) targetError('DELIVERY_CHECKOUT_CHANGED');
    const sharedIndex = (await gitRun(root,['rev-parse','--shared-index-path'])).trim();
    const sharedIndexHash = sharedIndex ? hash(await readFile(isAbsolute(sharedIndex) ? sharedIndex : resolve(root,sharedIndex))) : null;
    const workingStateHash = hash(JSON.stringify({ head,observedBranchRef,status:hash(status),files,indexHash,sharedIndexHash }));
    if (rootIdentity !== await objectIdentity(root) || gitDirectoryIdentity !== await objectIdentity(gitDir)) targetError('DELIVERY_TARGET_CHANGED');
    return { root,gitDir,rootIdentity,gitDirectoryIdentity,head,observedBranchRef,workingStateHash,indexHash,sharedIndexHash,remoteName:matches[0]!.name,remoteHash:matches[0]!.remoteHash,repositoryId: task.repositoryId };
  }
  async function inspectDeliveryTarget(path: string,task: DeliveryTaskInput,approved: { approvedRef: string; contentIdentity: string; baseSha: string }): Promise<DeliveryTargetInspection> {
    if (!dataDirectory) targetError('CONTEXT_UNAVAILABLE');
    const found = await observe(path,task,approved);
    const data = await managedRoot(resolveAttemptRoot ? await resolveAttemptRoot(task.attemptId) : dataDirectory!,canonicalize);
    const retained = resolve(data,'git',task.attemptId + '.git');
    await plainDirectory(retained,canonicalize);
    const diff = await isolated!(retained,['--git-dir=' + retained,'diff-tree','--no-commit-id','--name-only','--no-renames','-r','-z',task.baseSha,approved.approvedRef]);
    if (diff.exitCode !== 0) targetError('DELIVERY_APPROVED_VERSION_INVALID');
    const identity = taskIdentity(task.issueTitle,nul(diff.stdout));
    const candidate = (description: string) => `${identity.type}/${task.issueNumber}-${description}`;
    const suffix = task.attemptId.replaceAll('-','').slice(0,8);
    let branch = task.deliveryBranch?.name ?? candidate(identity.slug);
    let check = await isolated!(found.root,['check-ref-format','--branch',branch]);
    if (check.exitCode !== 0) targetError('DELIVERY_BRANCH_INVALID');
    const refs = (await isolated!(found.root,['for-each-ref','--format=%(refname)','refs/heads/'])).stdout.trim().split(/\r?\n/u).filter(Boolean);
    const exists = (name: string) => refs.some(ref => ref.toLowerCase() === `refs/heads/${name}`.toLowerCase());
    if (task.deliveryBranch?.kind === 'existing') {
      if (!exists(branch)) targetError('DELIVERY_BRANCH_NOT_FOUND');
      const tip = (await gitRun(found.root,['rev-parse','--verify','--end-of-options',`refs/heads/${branch}^{commit}`])).trim();
      if (tip !== task.baseSha) targetError('DELIVERY_BASE_CHANGED');
      const worktrees = await gitRun(found.root,['worktree','list','--porcelain']);
      if (worktrees.split(/\r?\n/u).includes(`branch refs/heads/${branch}`)) targetError('DELIVERY_BRANCH_IN_USE');
    } else if (await exists(branch)) {
      if (task.deliveryBranch) targetError('DELIVERY_BRANCH_COLLISION');
      branch = `${branch}-${suffix}`;
      check = await isolated!(found.root,['check-ref-format','--branch',branch]);
      if (check.exitCode !== 0 || await exists(branch)) targetError('DELIVERY_BRANCH_COLLISION');
    }
    return { repository_id: task.repositoryId,local_path: found.root,local_identity: {
      ...(task.deliveryBranch ? { branch_kind: task.deliveryBranch.kind } : {}),
      ...(task.sourceKind ? { source_kind: task.sourceKind } : {}),
      format_version: 1,root_identity: found.rootIdentity,git_directory_identity: found.gitDirectoryIdentity,remote_name:found.remoteName,remote_hash:found.remoteHash,
      base_branch: task.baseBranch,base_sha: task.baseSha,observed_head: found.head,observed_branch_ref: found.observedBranchRef,
      working_state_hash: found.workingStateHash,index_hash: found.indexHash,
    },branch_ref: `refs/heads/${branch}`,task_type: identity.type,task_description: identity.description };
  }
  async function inspectIntegrationTarget(path: string,task: DeliveryTaskInput) {
    const found = await observe(path,task,task,false);
    const baseBranch = task.deliveryBranch?.kind === 'existing' ? task.deliveryBranch.name : task.baseBranch;
    await gitRun(found.root,['check-ref-format','--branch',baseBranch]);
    const local = (await gitRun(found.root,['rev-parse','--verify','--end-of-options',`refs/heads/${baseBranch}^{commit}`])).trim();
    const ref = githubReference(task.repositoryUrl)!;
    if (!oid.test(local)) targetError('DELIVERY_BASE_CHANGED');
    if (task.sourceKind !== 'local' && !task.deliveryBranch) {
      const remote = await github.resolveBranch(ref,baseBranch);
      if (remote.state !== 'complete' || remote.data?.repositoryId !== task.repositoryId || remote.data.sha !== local) targetError('DELIVERY_BASE_CHANGED');
    }
    return { baseSha:local,localPath:found.root,rootIdentity:found.rootIdentity };
  }
  async function reconcileLocalCommit(delivery: Delivery,effect: EffectView,target: SealedTarget): Promise<TargetCommitResult> {
    try {
      const c = await localContext(delivery,effect,target,false); const observed = await isolated!(c.repository,['rev-parse','--verify','--quiet','--end-of-options',target.branch_ref]);
      if (observed.exitCode === 1) return { state:'failed_known',receipt:null,reason:'COMMIT_NOT_OBSERVED' };
      const sha = observed.stdout.trim();
      if (target.local_identity.branch_kind === 'existing' && sha === delivery.baseSha) return { state:'failed_known',receipt:null,reason:'COMMIT_NOT_OBSERVED' };
      if (!oid.test(sha) || (await c.commitMessage(sha)).trimEnd() !== c.message.trimEnd() || await c.tree(sha) !== delivery.contentIdentity || await c.parent(sha) !== delivery.baseSha) targetError('COMMIT_IDENTITY_CONFLICT');
      await transferBranch(c,target,sha);
      await verifyWorkingState(c,target);
      return { state:'confirmed',receipt: receipt(delivery,effect,target,sha),reason:null };
    } catch (e) { return { state:'unknown',receipt:null,reason:e instanceof CaptureError ? e.code : 'DELIVERY_TARGET_UNAVAILABLE' }; }
  }
  async function localContext(delivery: Delivery,effect: EffectView,target: SealedTarget,compareWorkingState = true) {
    if (!Value.Check(Delivery,delivery) || !Value.Check(EffectView,effect) || !Value.Check(DeliveryTarget,target) ||
        effect.kind !== 'local_commit' || effect.expectedIdentity.targetOperationId !== target.operation_id ||
        effect.expectedIdentity.branchRef !== target.branch_ref || effect.expectedIdentity.repositoryId !== target.repository_id ||
        effect.expectedIdentity.taskType !== target.task_type || effect.expectedIdentity.taskDescription !== target.task_description ||
        delivery.attemptId !== target.attempt_id || delivery.id !== target.delivery_id || delivery.baseSha !== target.base_sha ||
        delivery.gitRef !== target.approved_ref || delivery.contentIdentity !== target.content_identity || !dataDirectory || !isolated) targetError('COMMIT_IDENTITY_INVALID');
    const expected = await observe(target.local_path,{ attemptId:delivery.attemptId,approvedRef:target.approved_ref,contentIdentity:target.content_identity,
      issueNumber:target.issue_number,issueTitle:target.task_description,repositoryId:target.repository_id,
      repositoryUrl:`https://github.com/${effect.expectedIdentity.repositoryOwner!}/${effect.expectedIdentity.repositoryName!}`,
      baseBranch:target.base_branch,baseSha:target.base_sha,sourceKind:target.local_identity.source_kind },{ approvedRef:target.approved_ref,contentIdentity:target.content_identity,baseSha:target.base_sha },compareWorkingState && target.local_identity.branch_kind !== 'existing');
    if (expected.rootIdentity !== target.local_identity.root_identity || expected.gitDirectoryIdentity !== target.local_identity.git_directory_identity || expected.remoteName !== target.local_identity.remote_name || expected.remoteHash !== target.local_identity.remote_hash ||
        compareWorkingState && (expected.head !== target.local_identity.observed_head || expected.observedBranchRef !== target.local_identity.observed_branch_ref ||
          expected.workingStateHash !== target.local_identity.working_state_hash || expected.indexHash !== target.local_identity.index_hash)) targetError('DELIVERY_CHECKOUT_CHANGED');
    const repository = expected.root;
    const data = await managedRoot(resolveAttemptRoot ? await resolveAttemptRoot(delivery.attemptId) : dataDirectory!,canonicalize);
    const retained = resolve(data,'git',`${delivery.attemptId}.git`);
    await plainDirectory(retained,canonicalize); await noBorrowedObjects(retained);
    if ((await metadataBytes(resolve(retained,'factory-owner'),36)).toString('utf8') !== delivery.attemptId) targetError('RETAINED_REPOSITORY_INVALID');
    const run = async (args: string[],input?: string,commitTime?: number) => {
      const result = await isolated!(repository,args,{ ...(input === undefined ? {} : { input }),isolatedConfig: true,...(commitTime ? { commitTime } : {}) });
      if (result.exitCode !== 0) targetError('DELIVERY_TARGET_GIT_FAILED');
      return result.stdout;
    };
    const message = `${target.task_type}: ${target.task_description} (#${target.issue_number})\n\nFactory-Attempt: ${delivery.attemptId}\nFactory-Delivery: ${delivery.id}\nFactory-Operation: ${effect.operationId}\nFactory-Target: ${target.operation_id}\n`;
    return { repository,retained,run,message,commitTime: effect.expectedIdentity.commitTime ?? Math.floor(Date.now()/1000),source: effect.expectedIdentity.repositoryId!,
      sourceAttemptId: delivery.attemptId,repositoryUrl:`https://github.com/${effect.expectedIdentity.repositoryOwner!}/${effect.expectedIdentity.repositoryName!}`,
      async commitMessage(sha: string) { return run(['show','--no-patch','--format=%B',sha,'--']); },
      async tree(sha: string) { return (await run(['rev-parse','--verify',`${sha}^{tree}`])).trim(); },
      async parent(sha: string) { return (await run(['rev-list','--parents','-n','1',sha])).trim().split(' ').slice(1).join(' '); } };
  }
  async function verifyWorkingState(c: Awaited<ReturnType<typeof localContext>>,target: SealedTarget) {
    if (target.local_identity.branch_kind === 'existing') {
      const worktrees = await c.run(['worktree','list','--porcelain']);
      if (worktrees.split(/\r?\n/u).includes(`branch ${target.branch_ref}`)) targetError('DELIVERY_BRANCH_IN_USE');
    }
    const observed = await observe(target.local_path,{ attemptId:c.sourceAttemptId,approvedRef:target.approved_ref,contentIdentity:target.content_identity,
      issueNumber:target.issue_number,issueTitle:target.task_description,repositoryId:target.repository_id,repositoryUrl:c.repositoryUrl,baseBranch:target.base_branch,baseSha:target.base_sha,sourceKind:target.local_identity.source_kind },
      { approvedRef:target.approved_ref,contentIdentity:target.content_identity,baseSha:target.base_sha },target.local_identity.branch_kind !== 'existing');
    if (observed.workingStateHash !== target.local_identity.working_state_hash || observed.indexHash !== target.local_identity.index_hash) targetError('DELIVERY_CHECKOUT_CHANGED');
  }
  async function transferBranch(c: Awaited<ReturnType<typeof localContext>>,target: SealedTarget,sha: string) {
    const ref = await isolated!(c.retained,[`--git-dir=${c.retained}`,'fetch','--no-tags','--no-recurse-submodules','--',c.repository,target.branch_ref]);
    if (ref.exitCode !== 0 || (await isolated!(c.retained,[`--git-dir=${c.retained}`,'rev-parse','--verify','FETCH_HEAD'])).stdout.trim() !== sha) targetError('COMMIT_TRANSFER_FAILED');
    const current = await isolated!(c.retained,[`--git-dir=${c.retained}`,'rev-parse','--verify','--quiet','--end-of-options',target.branch_ref]);
    if (current.exitCode === 0 && current.stdout.trim() !== sha) targetError('COMMIT_TRANSFER_CONFLICT');
    if (current.exitCode !== 0) {
      const update = await isolated!(c.retained,[`--git-dir=${c.retained}`,'update-ref','--no-deref',target.branch_ref,sha,'0'.repeat(sha.length)]);
      if (update.exitCode !== 0) {
        const raced = await isolated!(c.retained,[`--git-dir=${c.retained}`,'rev-parse','--verify','--quiet','--end-of-options',target.branch_ref]);
        if (raced.stdout.trim() !== sha) targetError('COMMIT_TRANSFER_CONFLICT');
      }
    }
  }
  function receipt(delivery: Delivery,effect: EffectView,target: SealedTarget,sha: string): EffectReceipt {
    return { id:sha,contentIdentity:delivery.contentIdentity!,parentSha:delivery.baseSha,branchRef:target.branch_ref,operationId:effect.operationId,
      targetOperationId:target.operation_id,taskType:target.task_type,taskDescription:target.task_description };
  }
  async function createLocalCommit(delivery: Delivery,effect: EffectView,target: SealedTarget,authorize: () => Promise<void>): Promise<TargetCommitResult> {
    let mutationStarted = false;
    try {
      if (!effect.authorized || !['running','unknown'].includes(effect.state)) targetError('COMMIT_NOT_AUTHORIZED');
      const c = await localContext(delivery,effect,target);
      const current = await isolated!(c.repository,['rev-parse','--verify','--quiet','--end-of-options',target.branch_ref]);
      const existing = target.local_identity.branch_kind === 'existing';
      if (current.exitCode === 0 && (!existing || current.stdout.trim() !== delivery.baseSha)) return reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target);
      if (existing && (current.exitCode !== 0 || current.stdout.trim() !== delivery.baseSha)) targetError('DELIVERY_BASE_CHANGED');
      if ((!existing && current.exitCode !== 1) || effect.state !== 'running') return { state:'unknown',receipt:null,reason:'COMMIT_NOT_OBSERVED' };
      const fetch = await isolated!(c.repository,['fetch','--no-tags','--no-recurse-submodules','--',c.retained,delivery.gitRef!]);
      if (fetch.exitCode !== 0 || (await isolated!(c.repository,['rev-parse','--verify','FETCH_HEAD'])).stdout.trim() !== delivery.commitSha) targetError('DELIVERY_INTEGRITY_FAILED');
      if ((await isolated!(c.repository,['rev-parse','--verify',`${delivery.commitSha}^{tree}`])).stdout.trim() !== target.content_identity) targetError('DELIVERY_INTEGRITY_FAILED');
      const baseTree = (await isolated!(c.repository,['rev-parse','--verify',`${delivery.baseSha}^{tree}`])).stdout.trim();
      if ((baseTree !== delivery.contentIdentity) !== delivery.hasDelta) targetError('DELIVERY_INTEGRITY_FAILED');
      if (baseTree === delivery.contentIdentity) return { state:'not_applicable',receipt:null,reason:'APPROVED_NO_DELTA' };
      await verifyWorkingState(c,target);
      await authorize(); mutationStarted = true;
      const created = await isolated!(c.repository,['-c','user.name=Nova Fábrica','-c','user.email=fabrica@localhost','commit-tree',delivery.contentIdentity!,'-p',delivery.baseSha],{input:c.message,commitTime:c.commitTime,isolatedConfig:true});
      const sha = created.stdout.trim();
      if (created.exitCode !== 0 || !oid.test(sha)) targetError('COMMIT_IDENTITY_INVALID');
      const update = await isolated!(c.repository,['update-ref','--no-deref',target.branch_ref,sha,existing ? delivery.baseSha : '0'.repeat(sha.length)]);
      if (update.exitCode !== 0) {
        const reconciled = await reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target);
        if (reconciled.state === 'confirmed') return reconciled;
        targetError('DELIVERY_BRANCH_COLLISION');
      }
      const checked = await reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target);
      if (checked.state !== 'confirmed') return checked;
      return checked;
    } catch (e) { return { state:mutationStarted ? 'unknown' : 'failed_known',receipt:null,reason:e instanceof CaptureError ? e.code : 'DELIVERY_TARGET_UNAVAILABLE' }; }
  }
  async function verifyDeliveryTarget(target: SealedTarget,task: DeliveryTaskInput): Promise<void> {
    const found = await observe(target.local_path,task,{ approvedRef:target.approved_ref,contentIdentity:target.content_identity,baseSha:target.base_sha },target.local_identity.branch_kind !== 'existing');
    if (found.rootIdentity !== target.local_identity.root_identity || found.gitDirectoryIdentity !== target.local_identity.git_directory_identity ||
        found.remoteHash !== target.local_identity.remote_hash || found.remoteName !== target.local_identity.remote_name ||
        found.head !== target.local_identity.observed_head || found.observedBranchRef !== target.local_identity.observed_branch_ref ||
        found.workingStateHash !== target.local_identity.working_state_hash || found.indexHash !== target.local_identity.index_hash) targetError('DELIVERY_CHECKOUT_CHANGED');
  }
  return { inspectDeliveryTarget,inspectIntegrationTarget,verifyDeliveryTarget,createLocalCommit,reconcileLocalCommit };
}
