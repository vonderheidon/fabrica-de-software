import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, rmdir, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { LocalCommitBlock } from '#contracts';
import { CaptureError } from './capture.js';
import type { GitReader, GitResponse } from './git.js';

/** Operator settings that change how Git reads or writes working files; everything else stays isolated. */
export const operatorConfigKeys = ['core.autocrlf','core.eol','core.safecrlf','core.filemode','core.symlinks','core.ignorecase','core.longpaths','core.protectntfs'] as const;
export type OperatorConfig = Record<string,string>;
const allowed: readonly string[] = operatorConfigKeys;
const maxListed = 100;
const chunkBytes = 12_000;
/** Git tree modes for submodule entries and symbolic links. */
const gitlinkMode = '160000';
const symlinkMode = '120000';
/** Markers of an operation or lock owned by the operator's Git; their presence blocks, and nothing here ever deletes one. */
const busyNames = ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','BISECT_LOG','sequencer','index.lock','HEAD.lock','shallow.lock'] as const;

/** A block the operator can resolve and retry; `block` carries the bounded list shown with the commit. */
export class LandingBlocked extends CaptureError {
  constructor(code: string,readonly block?: LocalCommitBlock) { super(code); }
}
const shortBranch = (ref: string | null) => ref === null ? null : ref.replace(/^refs\/heads\//u,'').slice(0,1024) || null;
export function blockOf(paths: readonly string[],branches?: { expected: string | null; current: string | null }): LocalCommitBlock {
  const unique = [...new Set(paths)].sort();
  return { paths: unique.slice(0,maxListed).map(path => path.slice(0,1024)),pathCount: unique.length,
    expectedBranch: shortBranch(branches?.expected ?? null),currentBranch: shortBranch(branches?.current ?? null) };
}
const sorted = (config: OperatorConfig): OperatorConfig => Object.fromEntries(Object.entries(config).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
const fail = (code: string): never => { throw new CaptureError(code); };
function lines(value: string): string[] { return value.split(/\r?\n/u).filter(line => line !== ''); }
/** Paths are joined to one command line, so a long list is split below the Windows command-line limit. */
function chunks(paths: readonly string[]): string[][] {
  const result: string[][] = []; let current: string[] = []; let size = 0;
  for (const path of paths) {
    if (current.length && size + path.length > chunkBytes) { result.push(current); current = []; size = 0; }
    current.push(path); size += path.length + 1;
  }
  if (current.length) result.push(current);
  return result;
}
function nulFields(value: string): string[] {
  if (value && !value.endsWith('\0')) fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
  return value ? value.slice(0,-1).split('\0') : [];
}
export interface StatusEntries { changed: string[]; others: string[] }
interface DetailedStatusEntries { changed: string[]; unmerged: string[]; untracked: string[]; ignored: string[] }
/** `status --porcelain=v2 -z`: separates changed/staged/renamed, unmerged (`u`), untracked (`?`) and ignored (`!`). */
function parseDetailedStatus(output: string): DetailedStatusEntries {
  const result: DetailedStatusEntries = { changed: [],unmerged: [],untracked: [],ignored: [] };
  const fields = nulFields(output);
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!; const kind = field[0]; const parts = field.split(' ');
    if (kind === '1') result.changed.push(parts.slice(8).join(' '));
    else if (kind === '2') { result.changed.push(parts.slice(9).join(' ')); i += 1; if (fields[i]) result.changed.push(fields[i]!); }
    else if (kind === 'u') { const path = parts.slice(10).join(' '); result.changed.push(path); result.unmerged.push(path); }
    else if (kind === '?') result.untracked.push(field.slice(2));
    else if (kind === '!') result.ignored.push(field.slice(2));
    else if (kind !== '#') fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
  }
  return result;
}
/** `status --porcelain=v2 -z`: tracked, staged, renamed and conflicted entries are `changed`; untracked and ignored are `others`. */
export function parseStatus(output: string): StatusEntries {
  const detailed = parseDetailedStatus(output);
  return { changed: detailed.changed,others: [...detailed.untracked,...detailed.ignored] };
}
export interface TouchedPath { path: string; status: string; oldMode: string; newMode: string }
const rawDiffMeta = /^:([0-7]{6}) ([0-7]{6}) (?:[a-f0-9]{40}|[a-f0-9]{64}) (?:[a-f0-9]{40}|[a-f0-9]{64}) ([A-Z][0-9]*)$/u;
/** `diff-tree -r -z --no-renames --raw` (and `diff-index`/`diff-files --raw`): one `:meta` field, then the path. */
export function parseTouched(output: string): TouchedPath[] {
  const fields = nulFields(output); const result: TouchedPath[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const meta = rawDiffMeta.exec(fields[i] ?? ''); const path = fields[i + 1];
    if (!meta || !path) fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
    result.push({ path: path!,status: meta![3]!,oldMode: meta![1]!,newMode: meta![2]! });
  }
  return result;
}
const ntfsReservedStem = /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9\u00b9\u00b2\u00b3]|git~[0-9]+)$/iu;
/** Validates every segment against Windows/NTFS naming restrictions regardless of the operator's `core.protectNTFS`. */
export function isInvalidNtfsPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.endsWith('/') || path.includes('\0')) return true;
  for (const segment of path.split('/')) {
    if (!segment || segment === '.' || segment === '..' || segment.toLowerCase() === '.git') return true;
    if (segment.length > 255) return true;
    if (/[\u0000-\u001f<>:"\\|?*]/u.test(segment)) return true;
    if (/[.\s]$/u.test(segment)) return true;
    const dot = segment.indexOf('.');
    const stem = dot < 0 ? segment : segment.slice(0,dot);
    if (ntfsReservedStem.test(stem)) return true;
  }
  return false;
}

export interface CheckoutLandingDeps {
  /** Runs with the factory's isolated Git configuration. */
  isolated: GitReader | undefined;
  /** Runs without isolation; used only to read the operator's allowlisted settings. */
  plain: GitReader | undefined;
  /** Empty directory the factory owns; hooks are looked up here, so none run. */
  hooksDirectory: string | undefined;
  /** Factory-owned directory for temporary `GIT_INDEX_FILE` during safety proofs. */
  indexDirectory?: string | undefined;
}
export interface LandingPlan {
  root: string; branchRef: string; baseSha: string;
  /** Tree of the approved version; compared with the publication base to find the paths the delivery touches. */
  approvedTree: string; retained: string;
  sealedConfig: OperatorConfig | undefined;
}
export type RepairResult =
  | { status: 'repaired'; config: string[] }
  | { status: 'failed'; reason: 'PROJECT_FOLDER_REPAIR_FAILED'; block: LocalCommitBlock }
  | { status: 'refused'; reason: 'PROJECT_FOLDER_REPAIR_REFUSED' | 'PROJECT_FOLDER_LANDING_UNVERIFIED'; block?: LocalCommitBlock };

/** Brings an approved commit into the operator's checkout without ever discarding or re-applying their work. */
export function createCheckoutLanding(deps: CheckoutLandingDeps) {
  async function run(root: string,args: string[],config: readonly string[] = [],input?: string,indexFile?: string): Promise<GitResponse> {
    if (!deps.isolated) return fail('CONTEXT_UNAVAILABLE');
    return deps.isolated(root,['--no-optional-locks',...config,...args],{
      ...(input === undefined ? {} : { input }),
      ...(indexFile === undefined ? {} : { indexFile }),
    });
  }
  async function ok(root: string,args: string[],config: readonly string[] = [],input?: string,indexFile?: string): Promise<string> {
    const result = await run(root,args,config,input,indexFile);
    if (result.exitCode !== 0) fail('DELIVERY_TARGET_GIT_FAILED');
    return result.stdout;
  }
  async function readOperatorConfig(root: string): Promise<OperatorConfig> {
    if (!deps.plain) return fail('CONTEXT_UNAVAILABLE');
    const pattern = `^core\\.(${operatorConfigKeys.map(key => key.slice(5)).join('|')})$`;
    const result = await deps.plain(root,['--no-optional-locks','config','--null','--get-regexp',pattern]);
    if (result.exitCode === 1) return {};
    if (result.exitCode !== 0) return fail('DELIVERY_TARGET_GIT_FAILED');
    const config: OperatorConfig = {};
    for (const entry of nulFields(result.stdout)) {
      const cut = entry.indexOf('\n'); const key = cut < 0 ? entry : entry.slice(0,cut);
      // A key without a value is Git's implicit boolean true; later entries win, as in Git.
      if (allowed.includes(key)) config[key] = (cut < 0 ? 'true' : entry.slice(cut + 1)).slice(0,256);
    }
    return sorted(config);
  }
  async function emptyHooks(): Promise<string> {
    const directory = deps.hooksDirectory;
    if (!directory || !isAbsolute(directory)) return fail('CONTEXT_UNAVAILABLE');
    await mkdir(directory,{ recursive: true });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await readdir(directory)).length) return fail('DELIVERY_HOOKS_DIRECTORY_INVALID');
    return directory.replaceAll('\\','/');
  }
  /** The operator values come first so the factory's own `longpaths`, hook and fsmonitor settings always win. */
  async function writeConfig(root: string,sealed: OperatorConfig | undefined): Promise<string[]> {
    const current = await readOperatorConfig(root);
    if (sealed !== undefined && JSON.stringify(sorted(sealed)) !== JSON.stringify(current)) throw new LandingBlocked('PROJECT_FOLDER_CONFIG_CHANGED');
    const hooks = await emptyHooks();
    return [...Object.entries(sealed ?? current).flatMap(([key,value]) => ['-c',`${key}=${value}`]),'-c','core.longpaths=true','-c',`core.hooksPath=${hooks}`,'-c','core.fsmonitor=false'];
  }
  async function touchedPaths(plan: Pick<LandingPlan,'retained' | 'baseSha' | 'approvedTree'>): Promise<TouchedPath[]> {
    if (!deps.isolated) return fail('CONTEXT_UNAVAILABLE');
    const diff = await deps.isolated(plan.retained,[`--git-dir=${plan.retained}`,'diff-tree','-r','-z','--no-renames','--raw',plan.baseSha,plan.approvedTree]);
    if (diff.exitCode !== 0) return fail('DELIVERY_APPROVED_VERSION_INVALID');
    return parseTouched(diff.stdout);
  }
  async function lstatOptional(path: string) {
    try { return await lstat(path); }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw error;
    }
  }
  async function exists(path: string): Promise<boolean> { return (await lstatOptional(path)) !== null; }
  async function assertIdle(root: string,branchRef: string): Promise<void> {
    const names = [...busyNames,`${branchRef}.lock`];
    const resolved = lines(await ok(root,['rev-parse',...names.flatMap(name => ['--git-path',name])]));
    if (resolved.length !== names.length) fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
    const present: string[] = [];
    for (const [index,name] of names.entries()) if (await exists(resolve(root,resolved[index]!))) present.push(name);
    if (present.length) throw new LandingBlocked('PROJECT_FOLDER_BUSY',blockOf(present));
  }
  async function currentBranch(root: string): Promise<string | null> {
    const symbolic = await run(root,['symbolic-ref','--quiet','HEAD']);
    if (symbolic.exitCode === 1) return null;
    if (symbolic.exitCode !== 0) return fail('DELIVERY_TARGET_GIT_FAILED');
    return symbolic.stdout.trim();
  }
  async function assertHead(root: string,branchRef: string,baseSha: string): Promise<void> {
    const current = await currentBranch(root);
    if (current === null) throw new LandingBlocked('PROJECT_FOLDER_DETACHED_HEAD',blockOf([],{ expected: branchRef,current: null }));
    if (current !== branchRef) throw new LandingBlocked('PROJECT_FOLDER_BRANCH_CHANGED',blockOf([],{ expected: branchRef,current }));
    if ((await ok(root,['rev-parse','--verify','HEAD^{commit}'])).trim() !== baseSha) fail('DELIVERY_BASE_CHANGED');
  }
  /** At most this checkout may hold the branch: a second worktree on it would be rewritten behind the operator's back. */
  async function assertNoOtherWorktree(root: string,branchRef: string): Promise<void> {
    const own = (await currentBranch(root)) === branchRef ? 1 : 0;
    let holders = 0;
    for (const block of (await ok(root,['worktree','list','--porcelain'])).split(/\r?\n\r?\n/u)) {
      if (lines(block).includes(`branch ${branchRef}`)) holders += 1;
    }
    if (holders > own) fail('DELIVERY_BRANCH_IN_USE');
  }
  async function assertSupported(plan: Pick<LandingPlan,'root' | 'baseSha' | 'approvedTree' | 'retained'>,touched: readonly TouchedPath[]): Promise<void> {
    for (const key of ['core.sparseCheckout','core.sparseCheckoutCone']) {
      const sparse = await run(plan.root,['config','--get','--type=bool',key]);
      if (sparse.exitCode !== 0 && sparse.exitCode !== 1) fail('DELIVERY_TARGET_GIT_FAILED');
      if (sparse.exitCode === 0 && sparse.stdout.trim() === 'true') throw new LandingBlocked('PROJECT_FOLDER_SPARSE_CHECKOUT');
    }
    const submodules = touched.filter(entry => entry.oldMode === gitlinkMode || entry.newMode === gitlinkMode).map(entry => entry.path);
    if (submodules.length) throw new LandingBlocked('PROJECT_FOLDER_SUBMODULE_UNSUPPORTED',blockOf(submodules));
    const treeSymlinks = touched.filter(entry => entry.oldMode === symlinkMode || entry.newMode === symlinkMode).map(entry => entry.path);
    if (treeSymlinks.length) throw new LandingBlocked('PROJECT_FOLDER_SYMLINK_UNSUPPORTED',blockOf(treeSymlinks));
    const invalidNtfs = touched.filter(entry => isInvalidNtfsPath(entry.path)).map(entry => entry.path);
    if (invalidNtfs.length) throw new LandingBlocked('PROJECT_FOLDER_NTFS_NAME_INVALID',blockOf(invalidNtfs));
    const checkedDisk = new Set<string>();
    const diskSymlinks: string[] = [];
    for (const entry of touched) {
      const segments = entry.path.split('/');
      for (let depth = 1; depth <= segments.length; depth++) {
        const candidate = segments.slice(0,depth).join('/');
        if (checkedDisk.has(candidate)) continue;
        checkedDisk.add(candidate);
        const info = await lstatOptional(resolve(plan.root,...candidate.split('/')));
        if (info?.isSymbolicLink()) diskSymlinks.push(candidate);
      }
    }
    if (diskSymlinks.length) throw new LandingBlocked('PROJECT_FOLDER_SYMLINK_UNSUPPORTED',blockOf(diskSymlinks));
    const paths = touched.map(entry => entry.path);
    if (paths.length) {
      if (!deps.isolated || !deps.plain) return fail('CONTEXT_UNAVAILABLE');
      const input = `${paths.join('\0')}\0`;
      const filtered = new Set<string>();
      const sources: ReadonlyArray<readonly [GitReader, string, string[]]> = [
        [deps.isolated,plan.retained,[`--git-dir=${plan.retained}`,'check-attr',`--source=${plan.approvedTree}`,'-z','--stdin','filter','working-tree-encoding']],
        [deps.isolated,plan.retained,[`--git-dir=${plan.retained}`,'check-attr',`--source=${plan.baseSha}`,'-z','--stdin','filter','working-tree-encoding']],
        [deps.isolated,plan.root,['check-attr','-z','--stdin','filter','working-tree-encoding']],
        [deps.plain,plan.root,['check-attr','-z','--stdin','filter','working-tree-encoding']],
      ];
      for (const [reader,cwd,args] of sources) {
        const result = await reader(cwd,['--no-optional-locks',...args],{ input });
        if (result.exitCode !== 0) fail('DELIVERY_TARGET_GIT_FAILED');
        const fields = nulFields(result.stdout);
        if (fields.length % 3 !== 0) fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
        for (let i = 0; i < fields.length; i += 3) {
          const value = fields[i + 2]!;
          if (value !== 'unspecified' && value !== 'unset') filtered.add(fields[i]!);
        }
      }
      if (filtered.size) throw new LandingBlocked('PROJECT_FOLDER_FILTER_UNSUPPORTED',blockOf([...filtered]));
    }
  }
  async function assertNoHiddenPaths(root: string,touched: readonly TouchedPath[]): Promise<void> {
    const hidden: string[] = [];
    for (const group of chunks(touched.map(entry => entry.path))) {
      for (const entry of nulFields(await ok(root,['--literal-pathspecs','ls-files','-v','-z','--',...group]))) {
        // Lowercase tags are assume-unchanged and `S` is skip-worktree: Git would not notice an edit there.
        if (/^[a-zS] /u.test(entry)) hidden.push(entry.slice(2));
      }
    }
    if (hidden.length) throw new LandingBlocked('PROJECT_FOLDER_PATH_HIDDEN',blockOf(hidden));
  }
  async function assertClean(root: string,config: readonly string[],touched: readonly TouchedPath[]): Promise<void> {
    const tracked = parseStatus(await ok(root,['status','--porcelain=v2','-z','--untracked-files=no','--ignore-submodules=none'],config));
    if (tracked.changed.length) throw new LandingBlocked('PROJECT_FOLDER_DIRTY',blockOf(tracked.changed));
    // Untracked and ignored files only matter where the delivery writes; everything else stays out of the bounded listing.
    const written = touched.filter(entry => entry.status === 'A' || entry.status === 'T').map(entry => entry.path);
    const crossed: string[] = [];
    for (const path of written) {
      // A file where the delivery needs a folder is as much a collision as a file at the target path.
      const segments = path.split('/');
      for (let depth = 1; depth < segments.length; depth++) {
        const parent = segments.slice(0,depth).join('/');
        const stat = await lstatOptional(resolve(root,...parent.split('/')));
        if (stat && !stat.isDirectory()) crossed.push(parent);
      }
    }
    for (const group of chunks(written)) {
      const status = parseStatus(await ok(root,['--literal-pathspecs','status','--porcelain=v2','-z','--untracked-files=all','--ignored','--ignore-submodules=none','--',...group],config));
      crossed.push(...status.others,...status.changed);
    }
    if (crossed.length) throw new LandingBlocked('PROJECT_FOLDER_UNTRACKED_CONFLICT',blockOf(crossed));
    await assertNoHiddenPaths(root,touched);
  }
  /** Everything checked before the first byte is written; returns the arguments every later write must carry. */
  async function preflight(plan: LandingPlan): Promise<{ config: string[]; touched: TouchedPath[] }> {
    const config = await writeConfig(plan.root,plan.sealedConfig);
    await assertIdle(plan.root,plan.branchRef);
    await assertHead(plan.root,plan.branchRef,plan.baseSha);
    await assertNoOtherWorktree(plan.root,plan.branchRef);
    const touched = await touchedPaths(plan);
    await assertSupported(plan,touched);
    await assertClean(plan.root,config,touched);
    return { config,touched };
  }
  /** Second barrier and last look: a dry-run two-tree checkout, then the cheap checks again right before the write. */
  async function beforeWrite(plan: LandingPlan,config: readonly string[],sha: string): Promise<void> {
    await assertIdle(plan.root,plan.branchRef);
    await assertHead(plan.root,plan.branchRef,plan.baseSha);
    const barrier = await run(plan.root,['read-tree','-n','-m','-u',plan.baseSha,sha],config);
    if (barrier.exitCode !== 0) throw new LandingBlocked('PROJECT_FOLDER_REFUSED');
  }
  /** A fast-forward only: Git refuses anything that would overwrite local changes, and nothing is stashed or reset. */
  async function land(plan: LandingPlan,config: readonly string[],sha: string): Promise<GitResponse> {
    return run(plan.root,['-c','user.name=Nova Fábrica','-c','user.email=fabrica@localhost','merge','--ff-only','--no-autostash','--no-edit',sha],config);
  }
  /** True when HEAD is on the branch at `commit`, index matches, tracked files match, and touched A/D paths match on disk. */
  async function matches(plan: Pick<LandingPlan,'root' | 'branchRef' | 'baseSha'>,config: readonly string[],commit: string,touched: readonly TouchedPath[] = []): Promise<boolean> {
    if ((await currentBranch(plan.root)) !== plan.branchRef) return false;
    const head = await run(plan.root,['rev-parse','--verify','HEAD^{commit}']);
    if (head.exitCode !== 0 || head.stdout.trim() !== commit) return false;
    const staged = await run(plan.root,['diff-index','--cached','--name-only','-z','--no-renames',commit]);
    if (staged.exitCode !== 0 || staged.stdout !== '') return false;
    const status = await run(plan.root,['status','--porcelain=v2','-z','--untracked-files=no','--ignore-submodules=none'],config);
    if (status.exitCode !== 0 || status.stdout !== '') return false;
    const diskCheck = commit === plan.baseSha
      ? touched.filter(entry => entry.status === 'A')
      : touched.filter(entry => entry.status === 'D');
    for (const entry of diskCheck) {
      if (await exists(resolve(plan.root,...entry.path.split('/')))) return false;
    }
    return true;
  }
  async function removeOptional(path: string): Promise<void> {
    try { await unlink(path); }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    }
  }
  async function withTempIndex<T>(action: (tempIndex: string) => Promise<T>): Promise<T> {
    const directory = deps.indexDirectory;
    if (!directory || !isAbsolute(directory)) return fail('CONTEXT_UNAVAILABLE');
    await mkdir(directory,{ recursive: true });
    const tempIndex = resolve(directory,`landing-index-${randomUUID()}`);
    try { return await action(tempIndex); }
    finally {
      await removeOptional(tempIndex).catch(() => {});
      await removeOptional(`${tempIndex}.lock`).catch(() => {});
    }
  }
  async function worktreeDiffsAgainst(root: string,config: readonly string[],treeSha: string,tempIndex: string): Promise<Set<string>> {
    await removeOptional(tempIndex);
    await ok(root,['read-tree',treeSha],config,undefined,tempIndex);
    const refreshed = await run(root,['update-index','-q','--refresh'],config,undefined,tempIndex);
    if (refreshed.exitCode !== 0 && refreshed.exitCode !== 1) fail('DELIVERY_TARGET_GIT_FAILED');
    const diff = await ok(root,['diff-files','-z','--raw','--no-renames'],config,undefined,tempIndex);
    return new Set(parseTouched(diff).map(entry => entry.path));
  }
  /** True when HEAD is still at `baseSha` yet at least one unstaged touched path on disk reflects the landing. */
  async function hasPartialLanding(plan: LandingPlan,config: readonly string[],sha: string,touched: readonly TouchedPath[]): Promise<boolean> {
    const stagedSet = new Set(nulFields(await ok(plan.root,['diff-index','--cached','--name-only','-z','--no-renames',plan.baseSha])));
    for (const entry of touched) {
      if (entry.status === 'D' && !stagedSet.has(entry.path) && !await exists(resolve(plan.root,...entry.path.split('/')))) return true;
    }
    const addedCandidates: string[] = [];
    for (const entry of touched) {
      if (entry.status === 'A' && !stagedSet.has(entry.path) && await exists(resolve(plan.root,...entry.path.split('/')))) addedCandidates.push(entry.path);
    }
    const ignoredAdded = new Set<string>();
    for (const group of chunks(addedCandidates)) {
      const detailed = parseDetailedStatus(await ok(plan.root,['--literal-pathspecs','status','--porcelain=v2','-z','--untracked-files=all','--ignored','--ignore-submodules=none','--',...group],config));
      for (const path of detailed.ignored) ignoredAdded.add(path.replace(/\/$/u,''));
    }
    const unignoredAdded = addedCandidates.filter(path => !ignoredAdded.has(path) && ![...ignoredAdded].some(dir => path.startsWith(`${dir}/`)));
    const modified = touched.filter(entry => (entry.status === 'M' || entry.status === 'T') && !stagedSet.has(entry.path)).map(entry => entry.path);
    let changedModified: string[] = [];
    if (modified.length) {
      const status = parseDetailedStatus(await ok(plan.root,['status','--porcelain=v2','-z','--untracked-files=no','--ignore-submodules=none'],config));
      changedModified = modified.filter(path => status.changed.includes(path));
    }
    const candidates = [...unignoredAdded,...changedModified];
    if (!candidates.length) return false;
    return withTempIndex(async tempIndex => {
      const wtFromTarget = await worktreeDiffsAgainst(plan.root,config,sha,tempIndex);
      return candidates.some(path => !wtFromTarget.has(path));
    });
  }
  async function proveSafeRepair(plan: LandingPlan,config: readonly string[],sha: string,touched: readonly TouchedPath[],atTarget: boolean,tempIndex: string):
    Promise<{ ok: true; pendingDelete: string[]; pendingRestore: string[] } | { ok: false; result: RepairResult }> {
    const wtFromBase = await worktreeDiffsAgainst(plan.root,config,plan.baseSha,tempIndex);
    const wtFromTarget = await worktreeDiffsAgainst(plan.root,config,sha,tempIndex);
    const idxFromBase = new Set(parseTouched(await ok(plan.root,['diff-index','--cached','-z','--raw','--no-renames',plan.baseSha])).map(entry => entry.path));
    const idxFromTarget = new Set(parseTouched(await ok(plan.root,['diff-index','--cached','-z','--raw','--no-renames',sha])).map(entry => entry.path));
    const status = parseDetailedStatus(await ok(plan.root,['status','--porcelain=v2','-z','--untracked-files=all','--ignore-submodules=none'],config));

    const ignoredAtTouched: string[] = [];
    for (const group of chunks(touched.map(entry => entry.path))) {
      const ignored = parseDetailedStatus(await ok(plan.root,['--literal-pathspecs','status','--porcelain=v2','-z','--untracked-files=all','--ignored','--ignore-submodules=none','--',...group],config));
      ignoredAtTouched.push(...ignored.ignored,...ignored.changed,...ignored.untracked);
    }

    const touchedByPath = new Map(touched.map(entry => [entry.path,entry]));
    const written = touched.filter(entry => entry.status === 'A' || entry.status === 'T').map(entry => entry.path);
    const conflictPaths = new Set<string>(status.unmerged);
    for (const path of new Set([...idxFromBase,...idxFromTarget])) {
      if (idxFromBase.has(path) && idxFromTarget.has(path)) conflictPaths.add(path);
    }
    const evaluate = new Set<string>(status.changed);
    for (const other of status.untracked) {
      const clean = other.replace(/\/$/u,'');
      if (touchedByPath.has(clean) || written.some(w => w.startsWith(`${clean}/`) || clean.startsWith(`${w}/`))) evaluate.add(clean);
    }
    for (const entry of ignoredAtTouched) evaluate.add(entry.replace(/\/$/u,''));
    for (const path of written) {
      const segments = path.split('/');
      for (let depth = 1; depth < segments.length; depth++) {
        const parent = segments.slice(0,depth).join('/');
        const info = await lstatOptional(resolve(plan.root,...parent.split('/')));
        if (info && !info.isDirectory()) evaluate.add(parent);
      }
    }
    for (const path of wtFromTarget) evaluate.add(path);
    for (const entry of touched) {
      if (entry.status === 'D' && await exists(resolve(plan.root,...entry.path.split('/')))) evaluate.add(entry.path);
    }

    for (const path of evaluate) {
      const touch = touchedByPath.get(path);
      if (!touch) { conflictPaths.add(path); continue; }
      const matchesBase = touch.status === 'A' ? !(await exists(resolve(plan.root,...path.split('/')))) : !wtFromBase.has(path);
      const matchesTarget = touch.status === 'D' ? !(await exists(resolve(plan.root,...path.split('/')))) : !wtFromTarget.has(path);
      if (!matchesBase && !matchesTarget) conflictPaths.add(path);
    }

    if (conflictPaths.size) {
      return { ok: false,result: { status: 'refused',reason: atTarget ? 'PROJECT_FOLDER_LANDING_UNVERIFIED' : 'PROJECT_FOLDER_REPAIR_REFUSED',block: blockOf([...conflictPaths]) } };
    }

    const pendingDelete: string[] = [];
    const pendingRestore: string[] = [];
    for (const entry of touched) {
      if (entry.status === 'D') {
        if (await exists(resolve(plan.root,...entry.path.split('/')))) pendingDelete.push(entry.path);
      } else if (wtFromTarget.has(entry.path)) {
        pendingRestore.push(entry.path);
      }
    }
    return { ok: true,pendingDelete,pendingRestore };
  }
  async function deletePendingPaths(root: string,pendingDelete: readonly string[]): Promise<string[]> {
    const failedDeletes: string[] = [];
    for (const relPath of pendingDelete) {
      const abs = resolve(root,...relPath.split('/'));
      try {
        await unlink(abs);
        let dir = dirname(abs);
        while (true) {
          const relDir = relative(root,dir);
          if (!relDir || relDir.startsWith('..') || isAbsolute(relDir)) break;
          try { await rmdir(dir); dir = dirname(dir); }
          catch { break; }
        }
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : undefined;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') failedDeletes.push(relPath);
      }
    }
    return failedDeletes;
  }
  async function validateRepairPreconditions(plan: LandingPlan,sha: string,touched: readonly TouchedPath[]): Promise<{ config: string[]; atTarget: boolean }> {
    const config = await writeConfig(plan.root,plan.sealedConfig);
    await assertIdle(plan.root,plan.branchRef);
    await assertNoOtherWorktree(plan.root,plan.branchRef);
    const branch = await currentBranch(plan.root);
    if (branch === null) throw new LandingBlocked('PROJECT_FOLDER_DETACHED_HEAD',blockOf([],{ expected: plan.branchRef,current: null }));
    if (branch !== plan.branchRef) throw new LandingBlocked('PROJECT_FOLDER_BRANCH_CHANGED',blockOf([],{ expected: plan.branchRef,current: branch }));
    const head = (await ok(plan.root,['rev-parse','--verify','HEAD^{commit}'])).trim();
    if (head !== plan.baseSha && head !== sha) fail('DELIVERY_BASE_CHANGED');
    const atTarget = head === sha;
    await assertSupported(plan,touched);
    await assertNoHiddenPaths(plan.root,touched);
    return { config,atTarget };
  }
  /** Second barrier for repair: dry-run two-tree checkout from the proven current disk state to `sha`. */
  async function assertRepairReadTreeBarrier(
    plan: LandingPlan,
    config: readonly string[],
    sha: string,
    touched: readonly TouchedPath[],
    pendingDelete: readonly string[],
    pendingRestore: readonly string[],
    atTarget: boolean,
    tempIndex: string,
  ): Promise<RepairResult | null> {
    await removeOptional(tempIndex);
    await ok(plan.root,['read-tree',sha],config,undefined,tempIndex);
    const pending = [...new Set([...pendingDelete,...pendingRestore])];
    if (pending.length) {
      const touchedMap = new Map(touched.map(entry => [entry.path,entry]));
      const baseEntries = new Map<string,string>();
      for (const group of chunks(pending)) {
        const listed = nulFields(await ok(plan.root,['--literal-pathspecs','ls-tree','-z','-r',plan.baseSha,'--', ...group],config));
        for (const item of listed) {
          const tab = item.indexOf('\t');
          if (tab < 0) fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
          const [mode,type,oid] = item.slice(0,tab).split(' ');
          const path = item.slice(tab + 1);
          if (!mode || type !== 'blob' || !oid || !path) fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
          baseEntries.set(path,`${mode} ${oid}\t${path}`);
        }
      }
      const removals: string[] = [];
      const restorations: string[] = [];
      for (const path of pending) {
        const touch = touchedMap.get(path);
        const baseEntry = baseEntries.get(path);
        if (touch?.status === 'A' && !baseEntry) removals.push(`0 ${'0'.repeat(sha.length)}\t${path}`);
        else if (baseEntry) restorations.push(baseEntry);
      }
      const updates = [...removals,...restorations];
      if (updates.length) await ok(plan.root,['update-index','-z','--index-info'],config,`${updates.join('\0')}\0`,tempIndex);
    }
    const currentTree = (await ok(plan.root,['write-tree'],config,undefined,tempIndex)).trim();
    const refreshed = await run(plan.root,['update-index','-q','--refresh'],config,undefined,tempIndex);
    if (refreshed.exitCode !== 0 && refreshed.exitCode !== 1) fail('DELIVERY_TARGET_GIT_FAILED');
    const barrier = await run(plan.root,['read-tree','-n','-m','-u',currentTree,sha],config,undefined,tempIndex);
    if (barrier.exitCode === 0) return null;
    const postProof = await proveSafeRepair(plan,config,sha,touched,atTarget,tempIndex);
    if (!postProof.ok) return postProof.result;
    return { status: 'refused',reason: atTarget ? 'PROJECT_FOLDER_LANDING_UNVERIFIED' : 'PROJECT_FOLDER_REPAIR_REFUSED',block: blockOf(pending) };
  }
  /** Proves every dirty path matches either pre-state or target, revalidates with `read-tree -n -m -u`, then completes only pending paths via `reset --mixed` + `restore --worktree`. */
  async function repair(plan: LandingPlan,sha: string,touched: readonly TouchedPath[],beforeRepair?: () => Promise<void>): Promise<RepairResult> {
    const initial = await validateRepairPreconditions(plan,sha,touched);

    return withTempIndex(async tempIndex => {
      const proof = await proveSafeRepair(plan,initial.config,sha,touched,initial.atTarget,tempIndex);
      if (!proof.ok) return proof.result;
      await beforeRepair?.();
      const revalidated = await validateRepairPreconditions(plan,sha,touched);
      const revalidatedProof = await proveSafeRepair(plan,revalidated.config,sha,touched,revalidated.atTarget,tempIndex);
      if (!revalidatedProof.ok) return revalidatedProof.result;
      const barrierFailure = await assertRepairReadTreeBarrier(
        plan,revalidated.config,sha,touched,revalidatedProof.pendingDelete,revalidatedProof.pendingRestore,revalidated.atTarget,tempIndex,
      );
      if (barrierFailure) return barrierFailure;

      await ok(plan.root,['reset','--mixed',sha],revalidated.config);
      if (revalidatedProof.pendingDelete.length || revalidatedProof.pendingRestore.length) {
        const touchedMap = new Map(touched.map(entry => [entry.path,entry]));
        const wtFromBase = await worktreeDiffsAgainst(plan.root,revalidated.config,plan.baseSha,tempIndex);
        let drifted = false;
        for (const path of revalidatedProof.pendingDelete) if (wtFromBase.has(path)) { drifted = true; break; }
        if (!drifted) {
          for (const path of revalidatedProof.pendingRestore) {
            const isAdded = touchedMap.get(path)?.status === 'A';
            if (isAdded ? await exists(resolve(plan.root,...path.split('/'))) : wtFromBase.has(path)) { drifted = true; break; }
          }
        }
        if (drifted) {
          const postResetProof = await proveSafeRepair(plan,revalidated.config,sha,touched,true,tempIndex);
          return postResetProof.ok ? { status: 'refused',reason: 'PROJECT_FOLDER_LANDING_UNVERIFIED',block: blockOf([...revalidatedProof.pendingDelete,...revalidatedProof.pendingRestore]) } : postResetProof.result;
        }
      }
      const failedDeletes = await deletePendingPaths(plan.root,revalidatedProof.pendingDelete);
      if (failedDeletes.length) {
        return { status: 'failed',reason: 'PROJECT_FOLDER_REPAIR_FAILED',block: blockOf([...failedDeletes,...revalidatedProof.pendingRestore]) };
      }
      if (revalidatedProof.pendingRestore.length > 0) {
        const restore = await run(plan.root,['restore','--worktree',`--source=${sha}`,'--pathspec-from-file=-','--pathspec-file-nul'],revalidated.config,`${revalidatedProof.pendingRestore.join('\0')}\0`);
        if (restore.exitCode !== 0) {
          const remaining = await worktreeDiffsAgainst(plan.root,revalidated.config,sha,tempIndex).catch(() => new Set(revalidatedProof.pendingRestore));
          const stillPending = revalidatedProof.pendingRestore.filter(path => remaining.has(path));
          return { status: 'failed',reason: 'PROJECT_FOLDER_REPAIR_FAILED',block: blockOf(stillPending.length ? stillPending : revalidatedProof.pendingRestore) };
        }
      }
      if (!await matches(plan,revalidated.config,sha,touched)) {
        const postCheck = await proveSafeRepair(plan,revalidated.config,sha,touched,true,tempIndex);
        return postCheck.ok ? { status: 'refused',reason: 'PROJECT_FOLDER_LANDING_UNVERIFIED',block: blockOf([...revalidatedProof.pendingDelete,...revalidatedProof.pendingRestore]) } : postCheck.result;
      }
      return { status: 'repaired',config: revalidated.config };
    });
  }
  /** Every write the factory makes in the operator's repository runs with the empty hooks directory, not only the checkout update. */
  async function hooksOff(): Promise<string[]> { return ['-c',`core.hooksPath=${await emptyHooks()}`]; }
  return { readOperatorConfig,writeConfig,hooksOff,touchedPaths,preflight,beforeWrite,land,matches,hasPartialLanding,repair,assertNoOtherWorktree,currentBranch };
}
