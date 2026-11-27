import { lstat, mkdir, readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { LocalCommitBlock } from '#contracts';
import { CaptureError } from './capture.js';
import type { GitReader, GitResponse } from './git.js';

/** Operator settings that change how Git reads or writes working files; everything else stays isolated. */
export const operatorConfigKeys = ['core.autocrlf','core.eol','core.safecrlf','core.filemode','core.symlinks','core.ignorecase','core.longpaths','core.protectntfs'] as const;
export type OperatorConfig = Record<string,string>;
const allowed: readonly string[] = operatorConfigKeys;
const maxListed = 100;
const chunkBytes = 12_000;
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
/** `status --porcelain=v2 -z`: tracked, staged, renamed and conflicted entries are `changed`; untracked and ignored are `others`. */
export function parseStatus(output: string): StatusEntries {
  const result: StatusEntries = { changed: [],others: [] };
  const fields = nulFields(output);
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!; const kind = field[0]; const parts = field.split(' ');
    if (kind === '1') result.changed.push(parts.slice(8).join(' '));
    else if (kind === '2') { result.changed.push(parts.slice(9).join(' ')); i += 1; if (fields[i]) result.changed.push(fields[i]!); }
    else if (kind === 'u') result.changed.push(parts.slice(10).join(' '));
    else if (kind === '?' || kind === '!') result.others.push(field.slice(2));
    else if (kind !== '#') fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
  }
  return result;
}
export interface TouchedPath { path: string; status: string }
/** `diff-tree -r -z --no-renames --raw` between two trees: one `:meta` field, then the path. */
export function parseTouched(output: string): TouchedPath[] {
  const fields = nulFields(output); const result: TouchedPath[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const meta = fields[i]!; const path = fields[i + 1];
    if (!meta.startsWith(':') || !path) fail('DELIVERY_TARGET_GIT_RESPONSE_INVALID');
    result.push({ path: path!,status: meta.slice(-1) });
  }
  return result;
}

export interface CheckoutLandingDeps {
  /** Runs with the factory's isolated Git configuration. */
  isolated: GitReader | undefined;
  /** Runs without isolation; used only to read the operator's allowlisted settings. */
  plain: GitReader | undefined;
  /** Empty directory the factory owns; hooks are looked up here, so none run. */
  hooksDirectory: string | undefined;
}
export interface LandingPlan {
  root: string; branchRef: string; baseSha: string;
  /** Tree of the approved version; compared with the publication base to find the paths the delivery touches. */
  approvedTree: string; retained: string;
  sealedConfig: OperatorConfig | undefined;
}

/** Brings an approved commit into the operator's checkout without ever discarding or re-applying their work. */
export function createCheckoutLanding(deps: CheckoutLandingDeps) {
  async function run(root: string,args: string[],config: readonly string[] = [],input?: string): Promise<GitResponse> {
    if (!deps.isolated) return fail('CONTEXT_UNAVAILABLE');
    return deps.isolated(root,['--no-optional-locks',...config,...args],input === undefined ? undefined : { input });
  }
  async function ok(root: string,args: string[],config: readonly string[] = []): Promise<string> {
    const result = await run(root,args,config);
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
  async function exists(path: string): Promise<boolean> {
    try { await lstat(path); return true; }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code === 'ENOENT' || code === 'ENOTDIR') return false;
      throw error;
    }
  }
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
        const stat = await lstat(resolve(root,...parent.split('/'))).catch(() => null);
        if (stat && !stat.isDirectory()) crossed.push(parent);
      }
    }
    for (const group of chunks(written)) {
      const status = parseStatus(await ok(root,['--literal-pathspecs','status','--porcelain=v2','-z','--untracked-files=all','--ignored','--ignore-submodules=none','--',...group],config));
      crossed.push(...status.others,...status.changed);
    }
    if (crossed.length) throw new LandingBlocked('PROJECT_FOLDER_UNTRACKED_CONFLICT',blockOf(crossed));
    const hidden: string[] = [];
    for (const group of chunks(touched.map(entry => entry.path))) {
      for (const entry of nulFields(await ok(root,['--literal-pathspecs','ls-files','-v','-z','--',...group]))) {
        // Lowercase tags are assume-unchanged and `S` is skip-worktree: Git would not notice an edit there.
        if (/^[a-zS] /u.test(entry)) hidden.push(entry.slice(2));
      }
    }
    if (hidden.length) throw new LandingBlocked('PROJECT_FOLDER_PATH_HIDDEN',blockOf(hidden));
  }
  /** Everything checked before the first byte is written; returns the arguments every later write must carry. */
  async function preflight(plan: LandingPlan): Promise<{ config: string[]; touched: TouchedPath[] }> {
    const config = await writeConfig(plan.root,plan.sealedConfig);
    await assertIdle(plan.root,plan.branchRef);
    await assertHead(plan.root,plan.branchRef,plan.baseSha);
    await assertNoOtherWorktree(plan.root,plan.branchRef);
    const touched = await touchedPaths(plan);
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
  /** True when HEAD is on the branch at `commit` and neither index nor tracked files differ from it. */
  async function matches(plan: Pick<LandingPlan,'root' | 'branchRef'>,config: readonly string[],commit: string): Promise<boolean> {
    if ((await currentBranch(plan.root)) !== plan.branchRef) return false;
    const head = await run(plan.root,['rev-parse','--verify','HEAD^{commit}']);
    if (head.exitCode !== 0 || head.stdout.trim() !== commit) return false;
    const staged = await run(plan.root,['diff-index','--cached','--name-only','-z','--no-renames',commit]);
    if (staged.exitCode !== 0 || staged.stdout !== '') return false;
    const status = await run(plan.root,['status','--porcelain=v2','-z','--untracked-files=no','--ignore-submodules=none'],config);
    return status.exitCode === 0 && status.stdout === '';
  }
  /** Every write the factory makes in the operator's repository runs with the empty hooks directory, not only the checkout update. */
  async function hooksOff(): Promise<string[]> { return ['-c',`core.hooksPath=${await emptyHooks()}`]; }
  return { readOperatorConfig,writeConfig,hooksOff,preflight,beforeWrite,land,matches,assertNoOtherWorktree,currentBranch };
}
