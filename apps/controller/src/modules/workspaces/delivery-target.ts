import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { Delivery, DeliveryTarget, type DeliveryBranchChoice, type DeliveryTarget as SealedTarget, EffectView, type EffectReceipt, type LocalCommitBlock } from '#contracts';
import type { GitHub } from '../github/index.js';
import { CaptureError, managedRoot, metadataBytes, noBorrowedObjects, plainDirectory, verifyRetained } from './capture.js';
import type { GitReader } from './git.js';
import { retainedRepositoryOwner, retainedRepositoryPath, requireAttemptRootResolver, type AttemptRootResolver } from './project-storage.js';
import { githubReference } from './inspect.js';
import { createCheckoutLanding, LandingBlocked, type LandingPlan, type OperatorConfig } from './checkout-landing.js';

export interface DeliveryTaskInput {
  sourceKind?: 'local' | 'github' | undefined; deliveryBranch?: DeliveryBranchChoice | null | undefined;
  attemptId: string; approvedRef: string; contentIdentity: string; repositoryRelative: string; issueNumber: number; issueTitle: string; repositoryId: string; repositoryUrl: string; baseBranch: string; baseSha: string;
}
export interface DeliveryTargetInspection {
  repository_id: string; local_path: string; local_identity: SealedTarget['local_identity']; branch_ref: string;
  task_type: SealedTarget['task_type']; task_description: string;
}
export interface SelectedDeliveryPath { path: string; rootIdentity: string | null; selectionOperationId: string | null }
export interface TargetCommitResult { state: 'confirmed' | 'not_applicable' | 'failed_known' | 'unknown'; receipt: EffectReceipt | null; reason: string | null; block?: LocalCommitBlock }

type TaskType = SealedTarget['task_type'];
const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const targetError = (code: string): never => { throw new CaptureError(code); };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
/** Failures that mean the registered folder is no longer a usable clone of the project's repository. */
const invalidFolderCodes: readonly string[] = ['DELIVERY_TARGET_PATH_INVALID','DELIVERY_TARGET_ROOT_MISMATCH','DELIVERY_TARGET_NOT_WORKTREE','DELIVERY_TARGET_REMOTE_INVALID',
  'DELIVERY_TARGET_REPOSITORY_MISMATCH','DELIVERY_TARGET_CHANGED','DELIVERY_TARGET_GIT_FAILED','MANAGED_PATH_INVALID'];
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
/** Suggested name of a branch nova: `<tipo>/<N>-<slug>`, derived from the issue. */
export function suggestDeliveryBranch(issueNumber: number,issueTitle: string): string {
  const identity = taskIdentity(issueTitle);
  return `${identity.type}/${issueNumber}-${identity.slug}`;
}
/** `name` when no local branch uses it, else the first free `-2`, `-3`…; refs compare case-insensitively, as on Windows. */
export function nextFreeBranch(name: string,existing: readonly string[]): string {
  const taken = new Set(existing.map(branch => branch.toLowerCase()));
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name}-${n}`;
  return candidate;
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
  const landing = createCheckoutLanding({ isolated,plain: git,
    hooksDirectory: dataDirectory ? join(dataDirectory,'hooks-disabled') : undefined,
    indexDirectory: dataDirectory ? join(dataDirectory,'landing-indexes') : undefined });
  async function gitRun(root: string,args: string[],input?: string,config: string[] = []) {
    const runGit = isolated; if (!runGit) targetError('CONTEXT_UNAVAILABLE');
    const result = await runGit!(root,['--no-optional-locks',...config,...args],input === undefined ? undefined : { input });
    if (result.exitCode !== 0) targetError('DELIVERY_TARGET_GIT_FAILED');
    return result.stdout;
  }
  async function observe(rootInput: string,task: DeliveryTaskInput,approved: { approvedRef: string; contentIdentity: string; baseSha: string },checkBase = true,workingState = true) {
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
    if (identity.state !== 'complete') targetError('DELIVERY_TARGET_UNAVAILABLE');
    if (identity.data?.id !== task.repositoryId || matches.length !== 1) targetError('DELIVERY_TARGET_REPOSITORY_MISMATCH');
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
    let workingStateHash: string; let indexHash: string; let sharedIndexHash: string | null = null;
    if (workingState) {
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
      indexHash = hash(await readFile(indexPath)); const indexAfter = await lstat(indexPath,{ bigint:true });
      if (indexBefore.dev !== indexAfter.dev || indexBefore.ino !== indexAfter.ino || indexBefore.size !== indexAfter.size || indexBefore.mtimeNs !== indexAfter.mtimeNs) targetError('DELIVERY_CHECKOUT_CHANGED');
      const sharedIndex = (await gitRun(root,['rev-parse','--shared-index-path'])).trim();
      sharedIndexHash = sharedIndex ? hash(await readFile(isAbsolute(sharedIndex) ? sharedIndex : resolve(root,sharedIndex))) : null;
      workingStateHash = hash(JSON.stringify({ head,observedBranchRef,status:hash(status),files,indexHash,sharedIndexHash }));
    } else {
      // The landing path never hashes the operator's files: its own preflight decides before every write.
      workingStateHash = hash(`landing\0${head}\0${observedBranchRef}`); indexHash = workingStateHash;
    }
    if (rootIdentity !== await objectIdentity(root) || gitDirectoryIdentity !== await objectIdentity(gitDir)) targetError('DELIVERY_TARGET_CHANGED');
    return { root,gitDir,rootIdentity,gitDirectoryIdentity,head,observedBranchRef,workingStateHash,indexHash,sharedIndexHash,remoteName:matches[0]!.name,remoteHash:matches[0]!.remoteHash,repositoryId: task.repositoryId };
  }
  /** Local branch names of a checkout, without the `refs/heads/` prefix. */
  async function localBranchNames(root: string): Promise<string[]> {
    const listed = await gitRun(root,['for-each-ref','--format=%(refname)','refs/heads/']);
    return listed.split(/\r?\n/u).filter(Boolean).map(ref => ref.replace(/^refs\/heads\//u,''));
  }
  async function inspectDeliveryTarget(path: string,task: DeliveryTaskInput,approved: { approvedRef: string; contentIdentity: string; baseSha: string }): Promise<DeliveryTargetInspection> {
    if (!dataDirectory) targetError('CONTEXT_UNAVAILABLE');
    const landed = task.deliveryBranch?.kind === 'existing' || task.deliveryBranch?.kind === 'new';
    const found = await observe(path,task,approved,true,!landed);
    const data = await managedRoot(await requireAttemptRootResolver(resolveAttemptRoot)(task.attemptId),canonicalize);
    const retained = retainedRepositoryPath(data, task.attemptId, task.repositoryRelative);
    await plainDirectory(dirname(retained),canonicalize); await plainDirectory(retained,canonicalize); await noBorrowedObjects(retained);
    if ((await metadataBytes(resolve(retained,'factory-owner'),64)).toString('utf8') !== retainedRepositoryOwner(task.attemptId,task.repositoryRelative)) targetError('RETAINED_REPOSITORY_INVALID');
    const diff = await isolated!(retained,['--git-dir=' + retained,'diff-tree','--no-commit-id','--name-only','--no-renames','-r','-z',task.baseSha,approved.approvedRef]);
    if (diff.exitCode !== 0) targetError('DELIVERY_APPROVED_VERSION_INVALID');
    const identity = taskIdentity(task.issueTitle,nul(diff.stdout));
    const candidate = (description: string) => `${identity.type}/${task.issueNumber}-${description}`;
    const suffix = task.attemptId.replaceAll('-','').slice(0,8);
    let branch = task.deliveryBranch?.name ?? candidate(identity.slug);
    let check = await isolated!(found.root,['check-ref-format','--branch',branch]);
    if (check.exitCode !== 0) targetError('DELIVERY_BRANCH_INVALID');
    const refs = await localBranchNames(found.root);
    const exists = (name: string) => refs.some(ref => ref.toLowerCase() === name.toLowerCase());
    let operatorConfig: OperatorConfig | undefined;
    if (task.deliveryBranch?.kind === 'existing') {
      if (!exists(branch)) targetError('DELIVERY_BRANCH_NOT_FOUND');
      const tip = (await gitRun(found.root,['rev-parse','--verify','--end-of-options',`refs/heads/${branch}^{commit}`])).trim();
      if (tip !== task.baseSha) targetError('DELIVERY_BASE_CHANGED');
      // The branch in checkout is the delivery branch; only another worktree holding it is a conflict. The checkout itself is judged just before the write.
      await landing.assertNoOtherWorktree(found.root,`refs/heads/${branch}`);
      operatorConfig = await landing.readOperatorConfig(found.root);
    } else if (task.deliveryBranch?.kind === 'new') {
      // A typed name is the operator's: never written over. A suggested one moves on to the next free suffix.
      if (exists(branch)) {
        if (task.deliveryBranch.name_origin === 'typed') targetError('DELIVERY_BRANCH_COLLISION');
        branch = nextFreeBranch(task.deliveryBranch.suggested_name,refs);
        check = await isolated!(found.root,['check-ref-format','--branch',branch]);
        if (check.exitCode !== 0) targetError('DELIVERY_BRANCH_INVALID');
      }
      operatorConfig = await landing.readOperatorConfig(found.root);
    } else if (exists(branch)) {
      branch = `${branch}-${suffix}`;
      check = await isolated!(found.root,['check-ref-format','--branch',branch]);
      if (check.exitCode !== 0 || exists(branch)) targetError('DELIVERY_BRANCH_COLLISION');
    }
    return { repository_id: task.repositoryId,local_path: found.root,local_identity: {
      ...(task.deliveryBranch ? { branch_kind: task.deliveryBranch.kind } : {}),
      ...(task.sourceKind ? { source_kind: task.sourceKind } : {}),
      format_version: 1,root_identity: found.rootIdentity,git_directory_identity: found.gitDirectoryIdentity,remote_name:found.remoteName,remote_hash:found.remoteHash,
      base_branch: task.baseBranch,base_sha: task.baseSha,observed_head: found.head,observed_branch_ref: found.observedBranchRef,
      working_state_hash: found.workingStateHash,index_hash: found.indexHash,
      ...(operatorConfig ? { operator_config: operatorConfig } : {}),
    },branch_ref: `refs/heads/${branch}`,task_type: identity.type,task_description: identity.description };
  }
  async function inspectIntegrationTarget(path: string,task: DeliveryTaskInput) {
    const found = await observe(path,task,task,false,false);
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
  async function expectedLandingSha(c: Awaited<ReturnType<typeof localContext>>,delivery: Delivery,effect: EffectView,target: SealedTarget): Promise<string | null> {
    const commitTime = effect.expectedIdentity.commitTime;
    if (commitTime === undefined || !Number.isSafeInteger(commitTime)) return null;
    const payload = `tree ${delivery.contentIdentity!}\nparent ${target.local_identity.base_sha}\nauthor Nova Fábrica <fabrica@localhost> ${commitTime} +0000\ncommitter Nova Fábrica <fabrica@localhost> ${commitTime} +0000\n\n${c.message}`;
    const computed = await isolated!(c.repository,['hash-object','-t','commit','--stdin'],{ input: payload });
    if (computed.exitCode !== 0) return null;
    const sha = computed.stdout.trim();
    return oid.test(sha) ? sha : null;
  }
  async function tryRepairAtBase(c: Awaited<ReturnType<typeof localContext>>,delivery: Delivery,effect: EffectView,target: SealedTarget,plan: LandingPlan,beforeRepair?: () => Promise<void>): Promise<TargetCommitResult | null> {
    const expectedSha = await expectedLandingSha(c,delivery,effect,target);
    if (!expectedSha) return null;
    const present = await isolated!(c.repository,['cat-file','-e',`${expectedSha}^{commit}`]);
    if (present.exitCode !== 0) return null;
    const config = await landing.writeConfig(c.repository,target.local_identity.operator_config);
    const touched = await landing.touchedPaths(plan);
    if (!await landing.hasPartialLanding(plan,config,expectedSha,touched)) return null;
    let repaired: Awaited<ReturnType<typeof landing.repair>>;
    try {
      repaired = await landing.repair(plan,expectedSha,touched,beforeRepair);
    } catch (error) {
      if (error instanceof LandingBlocked) {
        // `repair` only throws LandingBlocked before `reset --mixed`, so HEAD is still at `baseSha`.
        return { state:'failed_known',receipt:null,reason:error.code,...(error.block ? { block: error.block } : {}) };
      }
      throw error;
    }
    if (repaired.status === 'failed') return { state:'unknown',receipt:null,reason:repaired.reason,block:repaired.block };
    if (repaired.status === 'refused') {
      // `PROJECT_FOLDER_LANDING_UNVERIFIED` means the refusal came after `reset --mixed` moved the branch to the target, so the landing can no longer be called absent.
      const block = repaired.block ? { block: repaired.block } : {};
      return repaired.reason === 'PROJECT_FOLDER_LANDING_UNVERIFIED'
        ? { state:'unknown',receipt:null,reason:repaired.reason,...block }
        : { state:'failed_known',receipt:null,reason:'PROJECT_FOLDER_REPAIR_REFUSED',...block };
    }
    await transferBranch(c,target,expectedSha);
    return { state:'confirmed',receipt: receipt(delivery,effect,target,expectedSha),reason:null };
  }
  type LocalContext = Awaited<ReturnType<typeof localContext>>;
  function landingPlan(c: LocalContext,delivery: Delivery,target: SealedTarget): LandingPlan {
    return { root:c.repository,branchRef:target.branch_ref,baseSha:target.local_identity.base_sha,approvedTree:delivery.contentIdentity!,retained:c.retained,sealedConfig:target.local_identity.operator_config };
  }
  /** Brings the approved commit into the Pasta do projeto's object store and checks it is the delivery the factory approved. */
  async function fetchApprovedCommit(c: LocalContext,delivery: Delivery,target: SealedTarget,hooksOff: readonly string[]): Promise<void> {
    const fetch = await isolated!(c.repository,[...hooksOff,'fetch','--no-tags','--no-recurse-submodules','--',c.retained,delivery.gitRef!]);
    if (fetch.exitCode !== 0 || (await isolated!(c.repository,['rev-parse','--verify','FETCH_HEAD'])).stdout.trim() !== delivery.commitSha) targetError('DELIVERY_INTEGRITY_FAILED');
    if ((await isolated!(c.repository,['rev-parse','--verify',`${delivery.commitSha}^{tree}`])).stdout.trim() !== target.content_identity) targetError('DELIVERY_INTEGRITY_FAILED');
  }
  async function commitApprovedTree(c: LocalContext,target: SealedTarget): Promise<string> {
    const created = await isolated!(c.repository,['-c','user.name=Nova Fábrica','-c','user.email=fabrica@localhost','commit-tree',target.content_identity,'-p',target.local_identity.base_sha],{input:c.message,commitTime:c.commitTime,isolatedConfig:true});
    const sha = created.stdout.trim();
    if (created.exitCode !== 0 || !oid.test(sha)) targetError('COMMIT_IDENTITY_INVALID');
    return sha;
  }
  async function reconcileLocalCommit(delivery: Delivery,effect: EffectView,target: SealedTarget,beforeRepair?: () => Promise<void>): Promise<TargetCommitResult> {
    let atBase = false;
    try {
      const existing = target.local_identity.branch_kind === 'existing';
      const switched = target.local_identity.branch_kind === 'new';
      const c = await localContext(delivery,effect,target,false); const observed = await isolated!(c.repository,['rev-parse','--verify','--quiet','--end-of-options',target.branch_ref]);
      if (observed.exitCode === 1) return { state:'failed_known',receipt:null,reason:'COMMIT_NOT_OBSERVED' };
      let sha = observed.stdout.trim();
      const plan = landingPlan(c,delivery,target);
      if (existing && sha === target.local_identity.base_sha) {
        atBase = true;
        return await tryRepairAtBase(c,delivery,effect,target,plan,beforeRepair) ?? { state:'failed_known',receipt:null,reason:'COMMIT_NOT_OBSERVED' };
      }
      // The checkout is only inspected for a write that is still unresolved. Once confirmed, the operator may edit, commit or switch freely.
      let inspectCheckout = existing && effect.state !== 'confirmed';
      const matchesApproved = async (candidate: string) => oid.test(candidate) && (await c.commitMessage(candidate)).trimEnd() === c.message.trimEnd() &&
        await c.tree(candidate) === delivery.contentIdentity && await c.parent(candidate) === target.local_identity.base_sha;
      if (existing && !await matchesApproved(sha)) {
        // The operator may have committed on top of the landing; the factory commit stays identifiable by its own trailer.
        const found = (await isolated!(c.repository,['rev-list','-n','1','--fixed-strings',`--grep=Factory-Operation: ${effect.operationId}`,`${target.local_identity.base_sha}..${target.branch_ref}`])).stdout.trim();
        if (oid.test(found)) { sha = found; inspectCheckout = false; }
      }
      if (!await matchesApproved(sha)) targetError('COMMIT_IDENTITY_CONFLICT');
      if (switched) {
        // A switch that is still unresolved is only done when the folder is on the new branch at the commit, with nothing left over.
        if (effect.state !== 'confirmed') {
          const config = await landing.writeConfig(c.repository,target.local_identity.operator_config);
          if (!await landing.matches(plan,config,sha)) return { state:'unknown',receipt:null,reason:'PROJECT_FOLDER_LANDING_UNVERIFIED' };
        }
        await transferBranch(c,target,sha);
      } else if (!existing) {
        await transferBranch(c,target,sha);
        await verifyWorkingState(c,target);
      } else if (inspectCheckout) {
        const config = await landing.writeConfig(c.repository,target.local_identity.operator_config);
        const touched = await landing.touchedPaths(plan);
        if (!await landing.matches(plan,config,sha,touched)) {
          const repaired = await landing.repair(plan,sha,touched,beforeRepair);
          if (repaired.status === 'failed') return { state:'unknown',receipt:null,reason:repaired.reason,block:repaired.block };
          if (repaired.status === 'refused') return { state:'unknown',receipt:null,reason:repaired.reason,...(repaired.block ? { block: repaired.block } : {}) };
          if (!await landing.matches(plan,repaired.config,sha,touched)) targetError('PROJECT_FOLDER_LANDING_UNVERIFIED');
        }
        await transferBranch(c,target,sha);
      }
      return { state:'confirmed',receipt: receipt(delivery,effect,target,sha),reason:null };
    } catch (e) {
      if (atBase && e instanceof LandingBlocked) {
        return { state:'failed_known',receipt:null,reason:e.code,...(e.block ? { block: e.block } : {}) };
      }
      return { state:'unknown',receipt:null,reason:e instanceof CaptureError ? e.code : 'DELIVERY_TARGET_UNAVAILABLE',...(e instanceof LandingBlocked && e.block ? { block: e.block } : {}) };
    }
  }
  async function localContext(delivery: Delivery,effect: EffectView,target: SealedTarget,compareWorkingState = true) {
    if (!Value.Check(Delivery,delivery) || !Value.Check(EffectView,effect) || !Value.Check(DeliveryTarget,target) ||
        effect.kind !== 'local_commit' || effect.expectedIdentity.targetOperationId !== target.operation_id ||
        effect.expectedIdentity.branchRef !== target.branch_ref || effect.expectedIdentity.repositoryId !== target.repository_id ||
        effect.expectedIdentity.taskType !== target.task_type || effect.expectedIdentity.taskDescription !== target.task_description ||
        delivery.attemptId !== target.attempt_id || delivery.id !== target.delivery_id || delivery.baseSha !== target.base_sha || effect.expectedIdentity.parentSha !== target.local_identity.base_sha ||
        delivery.gitRef !== target.approved_ref || delivery.contentIdentity !== target.content_identity || !dataDirectory || !isolated) targetError('COMMIT_IDENTITY_INVALID');
    // Both landing shapes judge the operator's checkout with their own pre-voo right before writing, not against a sealed hash.
    const existing = target.local_identity.branch_kind === 'existing' || target.local_identity.branch_kind === 'new';
    const folderInput = { attemptId:delivery.attemptId,approvedRef:target.approved_ref,contentIdentity:target.content_identity,repositoryRelative:delivery.repositoryRelative,
      issueNumber:target.issue_number,issueTitle:target.task_description,repositoryId:target.repository_id,
      repositoryUrl:`https://github.com/${effect.expectedIdentity.repositoryOwner!}/${effect.expectedIdentity.repositoryName!}`,
      baseBranch:target.base_branch,baseSha:target.local_identity.base_sha,sourceKind:target.local_identity.source_kind };
    const folderApproved = { approvedRef:target.approved_ref,contentIdentity:target.content_identity,baseSha:target.local_identity.base_sha };
    let expected: Awaited<ReturnType<typeof observe>>;
    try { expected = await observe(target.local_path,folderInput,folderApproved,compareWorkingState && !existing,!existing); }
    catch (error) {
      // A folder that stopped being the project's clone is reported as such for the landing path; other paths keep their codes.
      if (existing && (error instanceof CaptureError ? invalidFolderCodes.includes(error.code) : error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR'))) targetError('PROJECT_FOLDER_INVALID');
      throw error;
    }
    if (expected.rootIdentity !== target.local_identity.root_identity || expected.gitDirectoryIdentity !== target.local_identity.git_directory_identity || expected.remoteName !== target.local_identity.remote_name || expected.remoteHash !== target.local_identity.remote_hash) {
      targetError(existing ? 'PROJECT_FOLDER_INVALID' : 'DELIVERY_CHECKOUT_CHANGED');
    }
    if (compareWorkingState && !existing && (expected.head !== target.local_identity.observed_head || expected.observedBranchRef !== target.local_identity.observed_branch_ref ||
          expected.workingStateHash !== target.local_identity.working_state_hash || expected.indexHash !== target.local_identity.index_hash)) targetError('DELIVERY_CHECKOUT_CHANGED');
    const repository = expected.root;
    const data = await managedRoot(await requireAttemptRootResolver(resolveAttemptRoot)(delivery.attemptId),canonicalize);
    const retained = retainedRepositoryPath(data, delivery.attemptId, delivery.repositoryRelative);
    await plainDirectory(retained,canonicalize); await noBorrowedObjects(retained);
    if ((await metadataBytes(resolve(retained,'factory-owner'),64)).toString('utf8') !== retainedRepositoryOwner(delivery.attemptId,delivery.repositoryRelative)) targetError('RETAINED_REPOSITORY_INVALID');
    await verifyRetained(async args => {
      const result = await isolated!(retained,[`--git-dir=${retained}`,...args]);
      if (result.exitCode !== 0) targetError('DELIVERY_INTEGRITY_FAILED');
      return result.stdout;
    },delivery);
    const run = async (args: string[],input?: string,commitTime?: number) => {
      const result = await isolated!(repository,args,{ ...(input === undefined ? {} : { input }),isolatedConfig: true,...(commitTime ? { commitTime } : {}) });
      if (result.exitCode !== 0) targetError('DELIVERY_TARGET_GIT_FAILED');
      return result.stdout;
    };
    const message = `${target.task_type}: ${target.task_description} (#${target.issue_number})\n\nFactory-Attempt: ${delivery.attemptId}\nFactory-Delivery: ${delivery.id}\nFactory-Operation: ${effect.operationId}\nFactory-Target: ${target.operation_id}\n`;
    return { repository,retained,run,message,commitTime: effect.expectedIdentity.commitTime ?? Math.floor(Date.now()/1000),source: effect.expectedIdentity.repositoryId!,
      sourceAttemptId: delivery.attemptId,repositoryRelative:delivery.repositoryRelative,repositoryUrl:`https://github.com/${effect.expectedIdentity.repositoryOwner!}/${effect.expectedIdentity.repositoryName!}`,
      async commitMessage(sha: string) { return run(['show','--no-patch','--format=%B',sha,'--']); },
      async tree(sha: string) { return (await run(['rev-parse','--verify',`${sha}^{tree}`])).trim(); },
      async parent(sha: string) { return (await run(['rev-list','--parents','-n','1',sha])).trim().split(' ').slice(1).join(' '); } };
  }
  async function verifyWorkingState(c: Awaited<ReturnType<typeof localContext>>,target: SealedTarget) {
    const observed = await observe(target.local_path,{ attemptId:c.sourceAttemptId,approvedRef:target.approved_ref,contentIdentity:target.content_identity,repositoryRelative:c.repositoryRelative,
      issueNumber:target.issue_number,issueTitle:target.task_description,repositoryId:target.repository_id,repositoryUrl:c.repositoryUrl,baseBranch:target.base_branch,baseSha:target.local_identity.base_sha,sourceKind:target.local_identity.source_kind },
      { approvedRef:target.approved_ref,contentIdentity:target.content_identity,baseSha:target.local_identity.base_sha });
    if (observed.workingStateHash !== target.local_identity.working_state_hash || observed.indexHash !== target.local_identity.index_hash) targetError('DELIVERY_CHECKOUT_CHANGED');
  }
  async function transferBranch(c: Awaited<ReturnType<typeof localContext>>,target: SealedTarget,sha: string) {
    const ref = await isolated!(c.retained,[`--git-dir=${c.retained}`,'fetch','--no-tags','--no-recurse-submodules','--',c.repository,target.branch_ref]);
    if (ref.exitCode !== 0 || (await isolated!(c.retained,[`--git-dir=${c.retained}`,'rev-parse','--verify','FETCH_HEAD'])).stdout.trim() !== sha) targetError('COMMIT_TRANSFER_FAILED');
    const current = await isolated!(c.retained,[`--git-dir=${c.retained}`,'rev-parse','--verify','--quiet','--end-of-options',target.branch_ref]);
    const old = current.exitCode === 0 ? current.stdout.trim() : '0'.repeat(sha.length);
    if (old === sha) return;
    // The retained mirror may already hold an existing delivery branch at its base; it follows the landing but never moves from anywhere else.
    if (current.exitCode === 0 && !(target.local_identity.branch_kind === 'existing' && old === target.local_identity.base_sha)) targetError('COMMIT_TRANSFER_CONFLICT');
    const update = await isolated!(c.retained,[`--git-dir=${c.retained}`,'update-ref','--no-deref',target.branch_ref,sha,old]);
    if (update.exitCode !== 0) {
      const raced = await isolated!(c.retained,[`--git-dir=${c.retained}`,'rev-parse','--verify','--quiet','--end-of-options',target.branch_ref]);
      if (raced.stdout.trim() !== sha) targetError('COMMIT_TRANSFER_CONFLICT');
    }
  }
  function receipt(delivery: Delivery,effect: EffectView,target: SealedTarget,sha: string): EffectReceipt {
    return { id:sha,contentIdentity:delivery.contentIdentity!,parentSha:target.local_identity.base_sha,branchRef:target.branch_ref,operationId:effect.operationId,
      targetOperationId:target.operation_id,taskType:target.task_type,taskDescription:target.task_description };
  }
  async function createLocalCommit(delivery: Delivery,effect: EffectView,target: SealedTarget,authorize: () => Promise<void>): Promise<TargetCommitResult> {
    let mutationStarted = false;
    try {
      if (!effect.authorized || !['running','unknown'].includes(effect.state)) targetError('COMMIT_NOT_AUTHORIZED');
      const c = await localContext(delivery,effect,target);
      const current = await isolated!(c.repository,['rev-parse','--verify','--quiet','--end-of-options',target.branch_ref]);
      const existing = target.local_identity.branch_kind === 'existing';
      const switched = target.local_identity.branch_kind === 'new';
      const markMutation = async () => { await authorize(); mutationStarted = true; };
      if (current.exitCode === 0 && (!existing || current.stdout.trim() !== target.local_identity.base_sha)) {
        const observed = await reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target,existing ? markMutation : undefined);
        // A branch tip that is neither the base nor our commit means the base advanced: the integration round takes over.
        return existing && observed.state === 'unknown' && observed.reason === 'COMMIT_IDENTITY_CONFLICT' ? { state:'failed_known',receipt:null,reason:'DELIVERY_BASE_CHANGED' } : observed;
      }
      if (existing && (current.exitCode !== 0 || current.stdout.trim() !== target.local_identity.base_sha)) targetError('DELIVERY_BASE_CHANGED');
      if ((!existing && current.exitCode !== 1) || effect.state !== 'running') return { state:'unknown',receipt:null,reason:'COMMIT_NOT_OBSERVED' };
      if (existing || switched) {
        // Verify delivery integrity and APPROVED_NO_DELTA before writing objects or FETCH_HEAD into the Pasta do projeto.
        const deliveryTree = await isolated!(c.retained,[`--git-dir=${c.retained}`,'rev-parse','--verify',`${delivery.commitSha}^{tree}`]);
        if (deliveryTree.exitCode !== 0 || deliveryTree.stdout.trim() !== target.content_identity) targetError('DELIVERY_INTEGRITY_FAILED');
        const baseTree = await isolated!(c.retained,[`--git-dir=${c.retained}`,'rev-parse','--verify',`${delivery.baseSha}^{tree}`]);
        if (baseTree.exitCode !== 0 || (baseTree.stdout.trim() !== delivery.contentIdentity) !== delivery.hasDelta) targetError('DELIVERY_INTEGRITY_FAILED');
        const publicationBaseTree = await isolated!(c.repository,['rev-parse','--verify',`${target.local_identity.base_sha}^{tree}`]);
        if (publicationBaseTree.exitCode !== 0) targetError('DELIVERY_INTEGRITY_FAILED');
        if (publicationBaseTree.stdout.trim() === delivery.contentIdentity) return { state:'not_applicable',receipt:null,reason:'APPROVED_NO_DELTA' };
        const plan = landingPlan(c,delivery,target);
        if (switched) {
          // A branch nova always starts at the tip of the base branch; a base that moved since the inspection goes to the integration round.
          const baseTip = await isolated!(c.repository,['rev-parse','--verify','--quiet','--end-of-options',`refs/heads/${target.base_branch}^{commit}`]);
          if (baseTip.exitCode !== 0 || baseTip.stdout.trim() !== target.local_identity.base_sha) targetError('DELIVERY_BASE_CHANGED');
          const hooksOff = await landing.hooksOff();
          await fetchApprovedCommit(c,delivery,target,hooksOff);
          const sha = await commitApprovedTree(c,target);
          const { config,touched,origin } = await landing.preflightSwitch(plan,sha);
          await authorize();
          // Only the switch below creates the branch and changes the checkout; until then a refusal leaves only an unreferenced object.
          await landing.beforeSwitch(plan,config,origin,sha);
          mutationStarted = true;
          const created = await landing.switchNew(plan,config,sha);
          const landed = await reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target);
          if (landed.state === 'confirmed') return landed;
          if (landed.state === 'failed_known' && landed.reason === 'COMMIT_NOT_OBSERVED') {
            // A refused switch that left the original branch, index and files untouched wrote nothing: the operator may retry.
            return created.exitCode !== 0 && await landing.matches({ ...plan,branchRef: origin.branchRef,baseSha: origin.head },config,origin.head,touched)
              ? { state:'failed_known',receipt:null,reason:'PROJECT_FOLDER_REFUSED' }
              : { state:'unknown',receipt:null,reason:'PROJECT_FOLDER_LANDING_UNVERIFIED' };
          }
          return landed.reason ? landed : { ...landed,reason:'PROJECT_FOLDER_LANDING_UNVERIFIED' };
        }
        const partial = await tryRepairAtBase(c,delivery,effect,target,plan,markMutation);
        if (partial) return partial;
        const { config,touched } = await landing.preflight(plan);
        const hooksOff = await landing.hooksOff();
        await authorize();
        await fetchApprovedCommit(c,delivery,target,hooksOff);
        const sha = await commitApprovedTree(c,target);
        // Only the fast-forward below can move the branch and the checkout; until it starts, a refusal leaves nothing behind but an unreferenced object.
        await landing.beforeWrite(plan,config,sha);
        mutationStarted = true;
        const merged = await landing.land(plan,config,sha);
        const landed = await reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target,authorize);
        if (landed.state === 'confirmed') return landed;
        // A refused merge that left HEAD, index and files at the base wrote nothing, so the operator can retry once they resolve it.
        if (landed.state === 'failed_known') {
          if (landed.reason === 'COMMIT_NOT_OBSERVED') {
            return merged.exitCode !== 0 && await landing.matches(plan,config,plan.baseSha,touched)
              ? { state:'failed_known',receipt:null,reason:'PROJECT_FOLDER_REFUSED' }
              : { state:'unknown',receipt:null,reason:'PROJECT_FOLDER_LANDING_UNVERIFIED' };
          }
          return landed;
        }
        return landed.reason ? landed : { ...landed,reason:'PROJECT_FOLDER_LANDING_UNVERIFIED' };
      }
      const hooksOff = await landing.hooksOff();
      await fetchApprovedCommit(c,delivery,target,hooksOff);
      const baseTree = (await isolated!(c.repository,['rev-parse','--verify',`${delivery.baseSha}^{tree}`])).stdout.trim();
      if ((baseTree !== delivery.contentIdentity) !== delivery.hasDelta) targetError('DELIVERY_INTEGRITY_FAILED');
      const publicationBaseTree = (await isolated!(c.repository,['rev-parse','--verify',`${target.local_identity.base_sha}^{tree}`])).stdout.trim();
      if (publicationBaseTree === delivery.contentIdentity) return { state:'not_applicable',receipt:null,reason:'APPROVED_NO_DELTA' };
      await verifyWorkingState(c,target);
      await authorize(); mutationStarted = true;
      const sha = await commitApprovedTree(c,target);
      const update = await isolated!(c.repository,[...hooksOff,'update-ref','--no-deref',target.branch_ref,sha,'0'.repeat(sha.length)]);
      if (update.exitCode !== 0) {
        const reconciled = await reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target);
        if (reconciled.state === 'confirmed') return reconciled;
        targetError('DELIVERY_BRANCH_COLLISION');
      }
      return reconcileLocalCommit(delivery,{ ...effect,state:'unknown' },target);
    } catch (e) {
      return { state:mutationStarted ? 'unknown' : 'failed_known',receipt:null,reason:e instanceof CaptureError ? e.code : 'DELIVERY_TARGET_UNAVAILABLE',
        ...(e instanceof LandingBlocked && e.block ? { block: e.block } : {}) };
    }
  }
  async function verifyDeliveryTarget(target: SealedTarget,task: DeliveryTaskInput): Promise<void> {
    const existing = target.local_identity.branch_kind === 'existing' || target.local_identity.branch_kind === 'new';
    const found = await observe(target.local_path,task,{ approvedRef:target.approved_ref,contentIdentity:target.content_identity,baseSha:target.local_identity.base_sha },!existing,!existing);
    if (found.rootIdentity !== target.local_identity.root_identity || found.gitDirectoryIdentity !== target.local_identity.git_directory_identity ||
        found.remoteHash !== target.local_identity.remote_hash || found.remoteName !== target.local_identity.remote_name) targetError('DELIVERY_CHECKOUT_CHANGED');
    // The landing moved HEAD, index and files on purpose, so only the other delivery shapes compare them with the sealed state.
    if (!existing && (found.head !== target.local_identity.observed_head || found.observedBranchRef !== target.local_identity.observed_branch_ref ||
        found.workingStateHash !== target.local_identity.working_state_hash || found.indexHash !== target.local_identity.index_hash)) targetError('DELIVERY_CHECKOUT_CHANGED');
  }
  return { inspectDeliveryTarget,inspectIntegrationTarget,verifyDeliveryTarget,createLocalCommit,reconcileLocalCommit,localBranchNames };
}
