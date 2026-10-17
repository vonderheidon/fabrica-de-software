import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createLocalScaffolder, inspectScaffoldDestination } from '../dist/apps/controller/src/modules/workspaces/scaffold.js';

// Explicit Windows filesystem regression. Git is a controlled seam: no Git command,
// provider, remote or agent is started by this smoke.
assert.equal(process.platform, 'win32', 'This regression requires Windows directory sharing semantics.');
const cache = resolve('.cache');
mkdirSync(cache, { recursive: true });
const directory = mkdtempSync(join(cache, 'scaffold-paths-'));
assert(!relative(cache, directory).startsWith('..'));
const projectsRoot = join(directory, 'projects');
const outside = join(directory, 'outside');
mkdirSync(projectsRoot);
mkdirSync(outside);
const files = [{ path: 'README.md', content: '# Scaffold\n' }];
const calls = [];
const git = async (cwd, args) => {
  calls.push([...args]);
  if (args[0] === 'init') mkdirSync(join(cwd, '.git'));
  return { exitCode: 0, stdout: ['rev-parse', 'rev-list'].includes(args[0]) ? 'a'.repeat(40)
    : args[0] === 'symbolic-ref' ? 'refs/heads/feature/baseline' : '' };
};
try {
  const destination = await inspectScaffoldDestination(projectsRoot, 'new-project');
  const plan = { ...destination, input: { destinationRelative: 'new-project', baseBranch: 'feature/baseline' },
    files: files.map(file => ({ path: file.path, bytes: Buffer.byteLength(file.content), sha256: createHash('sha256').update(file.content).digest('hex') })) };
  let attempted = false;
  let blocked = false;
  let failure;
  try {
    await createLocalScaffolder(git).createLocalScaffold({ plan, files, record(step, state) {
      if (step !== 'directory' || state !== 'running') return;
      attempted = true;
      try { renameSync(projectsRoot, join(directory, 'original-projects')); }
      catch (error) {
        assert(['EPERM', 'EACCES', 'EBUSY'].includes(error.code));
        blocked = true;
        return;
      }
      throw new Error('The validated ancestor could be replaced before mkdir.');
    } });
  } catch (error) { failure = error; }
  assert(attempted, 'The swap must run after revalidation, immediately before creation.');
  assert.equal(existsSync(join(outside, 'new-project')), false, 'Scaffold wrote outside the projects root before refusing the redirection.');
  assert(blocked, 'The ancestor must remain pinned through the write.');
  assert.equal(failure, undefined);
  assert(existsSync(join(projectsRoot, 'new-project', 'README.md')));
  assert.equal(calls.filter(args => args.includes('commit')).length, 1);
  console.log('Windows scaffold: ancestor replacement blocked before mkdir; no outside writes; controlled baseline OK');
} finally {
  rmSync(directory, { recursive: true });
}
