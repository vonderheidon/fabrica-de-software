import { createHash } from 'node:crypto';
import { access, lstat, mkdir, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, win32 } from 'node:path';
import type { ScaffoldPlan, CreationStep } from '#contracts';
import type { GitReader } from './git.js';

export class ScaffoldWorkspaceError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function validateScaffoldBranch(branch: string): void {
  if (!branch || branch.length > 256 || branch.startsWith('-') || branch === '@' || branch === 'HEAD' || /[\s~^:?*\[\\\x00-\x1f\x7f]/.test(branch) || branch.includes('..') || branch.includes('@{') ||
    branch.split('/').some(s => !s || s.startsWith('.') || s.endsWith('.') || /\.lock$/i.test(s) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s))) throw new ScaffoldWorkspaceError('SCAFFOLD_BRANCH_INVALID');
}
function pathParts(path: string): string[] {
  if (!path || path.length > 1024 || isAbsolute(path) || win32.isAbsolute(path) || /[\\:<>"|?*\x00-\x1f\x7f]/.test(path)) throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_INVALID');
  const parts = path.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_INVALID');
  return parts;
}
async function directoryIdentity(path: string): Promise<string> {
  const info = await lstat(path); const canonical = await realpath(path);
  if (!info.isDirectory() || info.isSymbolicLink() || relative(resolve(path), canonical) !== '') throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_REDIRECTED');
  return `${canonical}:${info.dev}:${info.ino}:${info.birthtimeMs}`;
}
export async function inspectScaffoldDestination(projectsRoot: string, destinationRelative: string) {
  if (!isAbsolute(projectsRoot) || /^\\\\/.test(projectsRoot)) throw new ScaffoldWorkspaceError('SCAFFOLD_ROOT_INVALID');
  const parts = pathParts(destinationRelative); const configuredRoot = resolve(projectsRoot);
  // Inspect each ancestor as well as every segment inside the configured root.
  const ancestors: string[] = []; let current = configuredRoot;
  while (true) { ancestors.unshift(current); const parent = dirname(current); if (parent === current) break; current = parent; }
  const identities: string[] = [];
  for (const ancestor of ancestors) identities.push(await directoryIdentity(ancestor));
  current = configuredRoot;
  for (const part of parts.slice(0, -1)) { current = join(current, part); identities.push(await directoryIdentity(current)); }
  await access(current, constants.R_OK | constants.W_OK);
  const destination = join(current, parts.at(-1)!);
  try { await lstat(destination); } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { projectsRoot: configuredRoot, destination, parentIdentity: createHash('sha256').update(JSON.stringify(identities)).digest('hex') };
    throw error;
  }
  throw new ScaffoldWorkspaceError('SCAFFOLD_DESTINATION_EXISTS');
}
export interface LocalScaffoldInput {
  plan: ScaffoldPlan; files: readonly { path: string; content: string }[];
  record: (step: CreationStep['step'], state: CreationStep['state'], baselineSha?: string) => void;
}
export function createLocalScaffolder(git?: GitReader) {
  return {
    scaffoldCapability() { return { available: git !== undefined, ...(git ? {} : { reasonCode: 'CONTEXT_UNAVAILABLE', reason: 'The authorized Git host context is unavailable.', recovery: 'Start the controller in the authorized host context.' }) }; },
    inspectScaffoldDestination,
    async createLocalScaffold({ plan, files, record }: LocalScaffoldInput): Promise<{ baselineSha: string; baselineRef: string }> {
      if (!git) throw new ScaffoldWorkspaceError('CONTEXT_UNAVAILABLE');
      validateScaffoldBranch(plan.input.baseBranch);
      if (files.length !== plan.files.length || new Set(files.map(f => f.path.toLowerCase())).size !== files.length || files.some(file => {
        pathParts(file.path); const expected = plan.files.find(f => f.path === file.path);
        return !expected || expected.bytes !== Buffer.byteLength(file.content) || expected.sha256 !== createHash('sha256').update(file.content).digest('hex');
      })) throw new ScaffoldWorkspaceError('SCAFFOLD_PLAN_CHANGED');
      const destination = await inspectScaffoldDestination(plan.projectsRoot, plan.input.destinationRelative);
      if (destination.destination !== plan.destination || destination.parentIdentity !== plan.parentIdentity) throw new ScaffoldWorkspaceError('SCAFFOLD_PLAN_CHANGED');
      record('directory', 'running');
      await mkdir(plan.destination); // Exclusive: never adopt an existing destination.
      record('directory', 'confirmed');
      const ownedIdentity = await directoryIdentity(plan.destination);
      const parentIdentity = await directoryIdentity(dirname(plan.destination));
      let gitIdentity: string | undefined;
      const assertOwned = async () => {
        if (await directoryIdentity(plan.destination) !== ownedIdentity) throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_REDIRECTED');
        if (await directoryIdentity(dirname(plan.destination)) !== parentIdentity) throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_REDIRECTED');
        if (gitIdentity && await directoryIdentity(join(plan.destination,'.git')) !== gitIdentity) throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_REDIRECTED');
      };
      record('files', 'running');
      for (const file of files) {
        const parts = pathParts(file.path);
        if (parts.some(p => /^\.git$/i.test(p))) throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_INVALID');
        await assertOwned(); let parent = plan.destination;
        for (const part of parts.slice(0, -1)) {
          parent = join(parent, part);
          try { await mkdir(parent); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
          await directoryIdentity(parent);
        }
        const expected = plan.files.find(f => f.path === file.path);
        if (!expected || expected.bytes !== Buffer.byteLength(file.content) || expected.sha256 !== createHash('sha256').update(file.content).digest('hex')) throw new ScaffoldWorkspaceError('SCAFFOLD_PLAN_CHANGED');
        const handle = await open(join(parent, parts.at(-1)!), 'wx');
        try { await handle.writeFile(file.content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      }
      record('files', 'confirmed'); await assertOwned();
      record('git', 'running');
      const run = async (args: readonly string[]) => {
        await assertOwned(); const result = await git(plan.destination, args, { isolatedConfig: true });
        if (result.exitCode !== 0) throw new ScaffoldWorkspaceError('SCAFFOLD_GIT_FAILED');
        return result.stdout.trim();
      };
      try { await lstat(join(plan.destination,'.git')); throw new ScaffoldWorkspaceError('SCAFFOLD_GIT_EXISTS'); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
      await run(['init', '--template=', `--initial-branch=${plan.input.baseBranch}`, '.']);
      const gitDirectory = join(plan.destination, '.git'); await directoryIdentity(gitDirectory);
      gitIdentity = await directoryIdentity(gitDirectory);
      const hooks = join(gitDirectory, 'factory-hooks'); await mkdir(hooks);
      const attributes = join(gitDirectory, 'factory-attributes'); const empty = await open(attributes, 'wx'); await empty.close();
      record('git', 'confirmed');
      record('baseline', 'running');
      const flags = ['-c', `core.hooksPath=${hooks}`, '-c', `core.attributesFile=${attributes}`, '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=Factory', '-c', 'user.email=factory@localhost'];
      await run([...flags, 'add', '--', ...files.map(f => f.path)]);
      await run([...flags, 'commit', '-m', 'chore: initialize project']);
      const baselineSha = await run(['rev-parse', '--verify', 'HEAD']);
      const baselineRef = await run(['symbolic-ref', 'HEAD']);
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baselineSha) || baselineRef !== `refs/heads/${plan.input.baseBranch}` ||
        await run(['rev-list', '--parents', '--max-count=1', 'HEAD']) !== baselineSha || await run(['status', '--porcelain=v2', '-z']) !== '') throw new ScaffoldWorkspaceError('SCAFFOLD_BASELINE_INVALID');
      record('baseline', 'confirmed', baselineSha);
      return { baselineSha, baselineRef };
    },
  };
}
