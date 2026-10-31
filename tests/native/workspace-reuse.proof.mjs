import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGitReader } from '../../dist/apps/controller/src/modules/workspaces/git.js';
import { createWorkspacePreparer } from '../../dist/apps/controller/src/modules/workspaces/prepare.js';
import { createCapturer } from '../../dist/apps/controller/src/modules/workspaces/capture.js';
import { createAttemptMaterializer, createPublicationMaterializer } from '../../dist/apps/controller/src/modules/workspaces/materialize.js';

if (process.env.FACTORY_WORKSPACE_REUSE_PROOF !== 'authorized') throw new Error('WORKSPACE_REUSE_PROOF_NOT_AUTHORIZED');
const executable = process.env.FACTORY_GIT_EXE || (process.env.PATH || '').split(delimiter)
  .map(directory => join(directory, process.platform === 'win32' ? 'git.exe' : 'git'))
  .find(candidate => existsSync(candidate));
if (!executable) throw new Error('LOCAL_GIT_UNAVAILABLE');
const readGit = createGitReader({ kind: 'windows_keyring', executable });
let cloneCount = 0;
const git = async (...args) => {
  if (args[1].includes('clone')) cloneCount++;
  return readGit(...args);
};
const rootCache = resolve('.cache');
mkdirSync(rootCache, { recursive: true });
const root = mkdtempSync(join(rootCache, 'workspace-reuse-'));
const source = join(root, 'origin with spaces ação');
const managedRoot = join(root, 'managed root with spaces ação');
const identity = { project_id: randomUUID(), repository_id: 'R_workspace_reuse', issue_id: 'I_workspace_reuse' };
const runSetup = (args, cwd = source) => execFileSync(executable, args, {
  cwd, encoding: 'utf8', windowsHide: true, shell: false, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
}).trim();

try {
  mkdirSync(source, { recursive: true });
  mkdirSync(managedRoot, { recursive: true });
  runSetup(['init', '-b', 'main']);
  writeFileSync(join(source, '.gitignore'), '.cache/\n');
  writeFileSync(join(source, 'tracked.txt'), 'base tracked\n');
  writeFileSync(join(source, 'deleted.txt'), 'base deleted\n');
  writeFileSync(join(source, 'restored.txt'), 'inherited file retained in worktree\n');
  runSetup(['add', '--', '.gitignore', 'tracked.txt', 'deleted.txt', 'restored.txt']);
  runSetup(['-c', 'user.name=Workspace Fixture', '-c', 'user.email=workspace@factory.invalid', 'commit', '-m', 'base']);
  const baseSha = (await git(source, ['rev-parse', 'HEAD'])).stdout.trim();
  const firstAttemptId = randomUUID();
  const retryAttemptId = randomUUID();
  const thirdAttemptId = randomUUID();
  const wrongIdentityAttemptId = randomUUID();
  const wrongOriginAttemptId = randomUUID();
  const missingFirstAttemptId = randomUUID();
  const missingRetryAttemptId = randomUUID();
  const resolveAttemptRoot = async () => managedRoot;
  const resolveAttemptWorkspace = async attemptId => {
    if (![firstAttemptId, retryAttemptId, thirdAttemptId, wrongIdentityAttemptId, wrongOriginAttemptId, missingFirstAttemptId, missingRetryAttemptId].includes(attemptId)) throw new Error('ATTEMPT_NOT_FOUND');
    const issueNumber = attemptId === missingFirstAttemptId || attemptId === missingRetryAttemptId ? 18 : 17;
    return join(managedRoot, 'issues', String(issueNumber), 'workspace');
  };
  const prepare = createWorkspacePreparer(managedRoot, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace);
  const first = await prepare({ attemptId: firstAttemptId, workspace: identity, issueNumber: 17,
    source: { kind: 'local', location: source }, baseSha, predecessorAttemptId: null, inheritedBaseSha: null });
  assert.equal(first.state, 'prepared', first.diagnostic?.code);
  const implementation = first.resource.path;
  const issueDirectory = dirname(implementation);
  writeFileSync(join(issueDirectory, 'progress.md'), 'operational issue progress');
  const wrongIdentity = await prepare({ attemptId: wrongIdentityAttemptId, workspace: { ...identity, issue_id: 'I_other_issue' },
    issueNumber: 17, source: { kind: 'local', location: source }, baseSha, predecessorAttemptId: firstAttemptId, inheritedBaseSha: baseSha });
  assert.equal(wrongIdentity.diagnostic?.code, 'WORKSPACE_IDENTITY_MISMATCH');
  const wrongOriginPath = join(root, 'not-the-registered-origin');
  runSetup(['config', '--local', 'remote.origin.url', wrongOriginPath], implementation);
  const wrongOrigin = await prepare({ attemptId: wrongOriginAttemptId, workspace: identity, issueNumber: 17,
    source: { kind: 'local', location: source }, baseSha, predecessorAttemptId: firstAttemptId, inheritedBaseSha: baseSha });
  assert.equal(wrongOrigin.diagnostic?.code, 'WORKSPACE_REPOSITORY_MISMATCH');
  runSetup(['config', '--local', 'remote.origin.url', source], implementation);

  writeFileSync(join(implementation, 'tracked.txt'), 'inherited tracked edit\n');
  runSetup(['add', '--', 'tracked.txt'], implementation);
  writeFileSync(join(implementation, 'added.txt'), 'inherited untracked addition\n');
  unlinkSync(join(implementation, 'deleted.txt'));
  runSetup(['rm', '--cached', '--', 'restored.txt'], implementation);
  mkdirSync(join(implementation, '.cache'), { recursive: true });
  writeFileSync(join(implementation, '.cache', 'ignored.bin'), 'ignored workspace cache');

  writeFileSync(join(source, 'upstream-only.txt'), 'new upstream base\n');
  runSetup(['add', '--', 'upstream-only.txt']);
  runSetup(['-c', 'user.name=Workspace Fixture', '-c', 'user.email=workspace@factory.invalid', 'commit', '-m', 'advance upstream']);
  const currentUpstreamSha = (await git(source, ['rev-parse', 'HEAD'])).stdout.trim();
  assert.notEqual(currentUpstreamSha, baseSha);

  const retry = await prepare({ attemptId: retryAttemptId, workspace: identity, issueNumber: 17,
    source: { kind: 'local', location: source }, baseSha: currentUpstreamSha,
    predecessorAttemptId: firstAttemptId, inheritedBaseSha: baseSha });
  assert.equal(retry.state, 'prepared');
  assert.equal(retry.resource.path, implementation);
  assert.deepEqual(retry.snapshot?.initial_state, { kind: 'inherited_attempt', source_attempt_id: firstAttemptId,
    content_identity: retry.snapshot.comparison_base_sha });
  assert.equal(retry.snapshot?.inherited_base_sha, baseSha);
  const baselineSha = retry.snapshot.comparison_base_sha;
  assert.equal((await git(implementation, ['rev-parse', 'HEAD'])).stdout.trim(), baselineSha);
  assert.equal((await git(implementation, ['rev-list', '--parents', '-n', '1', baselineSha])).stdout.trim(), baselineSha + ' ' + baseSha);
  assert.equal(readFileSync(join(implementation, 'tracked.txt'), 'utf8'), 'inherited tracked edit\n');
  assert.equal(readFileSync(join(implementation, 'added.txt'), 'utf8'), 'inherited untracked addition\n');
  const restoredText = readFileSync(join(implementation, 'restored.txt'), 'utf8');
  assert.equal(restoredText.replace(/\r\n/g, '\n'), 'inherited file retained in worktree\n');
  assert.equal((await git(implementation, ['ls-files', '--stage', '--', 'restored.txt'])).stdout, '');
  const restoredSnapshotBlob = (await git(implementation, ['rev-parse', `${baselineSha}:restored.txt`])).stdout.trim();
  assert.equal((await git(implementation, ['show', `${baselineSha}:restored.txt`])).stdout, restoredText);
  assert.equal(existsSync(join(implementation, 'deleted.txt')), false);
  assert.equal(readFileSync(join(implementation, '.cache', 'ignored.bin'), 'utf8'), 'ignored workspace cache');
  assert.notEqual((await git(implementation, ['cat-file', '-e', baselineSha + ':upstream-only.txt'])).exitCode, 0);

  writeFileSync(join(implementation, 'new-attempt.txt'), 'only new attempt change\n');
  const deliveryId = randomUUID();
  const captured = await createCapturer(managedRoot, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace)({
    attemptId: retryAttemptId, passageId: randomUUID(), deliveryId, repositoryRelative: 'issues/17/history.git', baseSha: baselineSha, declaredFiles: [],
  });
  assert.equal(captured.hasDelta, true);
  const retained = join(managedRoot, 'issues', '17', 'history.git');
  assert.equal(readFileSync(join(retained, 'factory-owner'), 'utf8'), 'issue:17');
  assert.equal((await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'rev-list', '--parents', '-n', '1', captured.commitSha])).stdout.trim(),
    captured.commitSha + ' ' + baselineSha);
  assert.equal((await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'show', captured.commitSha + ':tracked.txt'])).stdout,
    'inherited tracked edit\n');
  assert.equal((await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'show', captured.commitSha + ':restored.txt'])).stdout,
    restoredText);
  const deliveryTree = (await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'ls-tree', '-r', '-z', captured.commitSha])).stdout;
  assert.match(deliveryTree, /added\.txt/);
  assert.doesNotMatch(deliveryTree, /progress\.md/);
  assert.doesNotMatch(deliveryTree, /deleted\.txt|\.cache\/ignored\.bin|upstream-only\.txt/);
  const retainedRefs = (await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'for-each-ref', '--format=%(refname)'])).stdout;
  assert.match(retainedRefs, new RegExp(`refs/factory/workspace-snapshots/${retryAttemptId}`));
  assert.match(retainedRefs, new RegExp(`refs/factory/deliveries/${deliveryId}`));
  assert.equal(existsSync(join(managedRoot, 'git', retryAttemptId + '.git')), false);

  writeFileSync(join(implementation, 'tracked.txt'), 'third attempt inherits pending edit\n');
  writeFileSync(join(implementation, 'pending-third.txt'), 'pending before third attempt\n');
  const clonesBeforeThird = cloneCount;
  const third = await prepare({ attemptId: thirdAttemptId, workspace: identity, issueNumber: 17,
    source: { kind: 'local', location: source }, baseSha: currentUpstreamSha,
    predecessorAttemptId: retryAttemptId, inheritedBaseSha: baseSha });
  assert.equal(third.state, 'prepared', third.diagnostic?.code);
  assert.equal(third.resource.path, implementation);
  assert.equal(cloneCount, clonesBeforeThird);
  assert.equal(cloneCount, 1);
  assert.equal(third.snapshot.initial_state.source_attempt_id, retryAttemptId);
  assert.equal(readFileSync(join(implementation, '.cache', 'ignored.bin'), 'utf8'), 'ignored workspace cache');
  assert.equal(readFileSync(join(implementation, 'new-attempt.txt'), 'utf8'), 'only new attempt change\n');
  assert.equal(readFileSync(join(implementation, 'pending-third.txt'), 'utf8'), 'pending before third attempt\n');
  assert.equal((await git(implementation, ['rev-parse', `${third.snapshot.comparison_base_sha}:restored.txt`])).stdout.trim(), restoredSnapshotBlob);
  assert.equal(existsSync(join(implementation, 'deleted.txt')), false);
  writeFileSync(join(implementation, 'third-attempt.txt'), 'only third attempt change\n');
  const thirdDeliveryId = randomUUID();
  const thirdCaptured = await createCapturer(managedRoot, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace)({
    attemptId: thirdAttemptId, passageId: randomUUID(), deliveryId: thirdDeliveryId,
    repositoryRelative: 'issues/17/history.git', baseSha: third.snapshot.comparison_base_sha, declaredFiles: [],
  });
  assert.equal(thirdCaptured.hasDelta, true);
  assert.equal((await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'rev-parse',
    `refs/factory/deliveries/${deliveryId}`])).stdout.trim(), captured.commitSha);
  assert.equal((await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'show',
    captured.commitSha + ':tracked.txt'])).stdout, 'inherited tracked edit\n');
  assert.notEqual((await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'cat-file', '-e',
    captured.commitSha + ':third-attempt.txt'])).exitCode, 0);
  assert.equal((await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'show',
    thirdCaptured.commitSha + ':tracked.txt'])).stdout, 'third attempt inherits pending edit\n');
  const thirdDelta = (await git(retained, ['--git-dir=' + retained, '-c', 'core.bare=true', 'diff', '--name-only',
    third.snapshot.comparison_base_sha, thirdCaptured.commitSha])).stdout.trim();
  assert.equal(thirdDelta, 'third-attempt.txt');
  const issueCloneCount = cloneCount;
  const implementationIndex = readFileSync(join(implementation, '.git', 'index'));
  const implementationHead = (await git(implementation, ['rev-parse', 'HEAD'])).stdout;
  assert.notEqual((await git(implementation, ['cat-file', '-e', thirdCaptured.commitSha + '^{commit}'])).exitCode, 0);
  await createAttemptMaterializer(managedRoot, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace)({
    ...thirdCaptured, id: thirdDeliveryId, attemptId: thirdAttemptId, producerPassageId: randomUUID(), round: 1,
    repositoryRelative: 'issues/17/history.git', baseSha: third.snapshot.comparison_base_sha,
    captureState: 'captured', diagnostic: null, capturedAtMs: Date.now(), revision: 3,
  }, randomUUID());
  assert.equal((await git(implementation, ['cat-file', '-e', thirdCaptured.commitSha + '^{commit}'])).exitCode, 0);
  assert.deepEqual(readFileSync(join(implementation, '.git', 'index')), implementationIndex);
  assert.equal((await git(implementation, ['rev-parse', 'HEAD'])).stdout, implementationHead);

  const previousVersion = {
    id: deliveryId, attemptId: retryAttemptId, producerPassageId: randomUUID(), round: 1,
    baseSha: baselineSha, captureState: 'captured', gitRef: captured.gitRef,
    repositoryRelative: 'issues/17/history.git', contentIdentity: captured.contentIdentity,
    commitSha: captured.commitSha, hasDelta: captured.hasDelta, diagnostic: null,
    capturedAtMs: Date.now(), revision: 3, warnings: captured.warnings,
  };
  const materializeForPublication = createPublicationMaterializer(managedRoot, git, undefined, resolveAttemptRoot,
    async (attemptId, area) => {
      assert.equal(attemptId, retryAttemptId);
      assert.equal(area, 'publication');
      return join(managedRoot, 'issues', '17', 'attempts', attemptId, area);
    });
  const previousCheckout = await materializeForPublication(previousVersion, randomUUID());
  assert.equal((await git(previousCheckout, ['rev-parse', 'HEAD'])).stdout.trim(), captured.commitSha);
  assert.equal(readFileSync(join(previousCheckout, 'new-attempt.txt'), 'utf8'), 'only new attempt change\n');
  assert.equal(existsSync(join(previousCheckout, 'third-attempt.txt')), false);
  assert.equal(readFileSync(join(implementation, 'third-attempt.txt'), 'utf8'), 'only third attempt change\n');
  assert.deepEqual(readFileSync(join(implementation, '.git', 'index')), implementationIndex);
  assert.equal((await git(implementation, ['rev-parse', 'HEAD'])).stdout, implementationHead);

  const missingWorkspace = await prepare({ attemptId: missingFirstAttemptId, workspace: { ...identity, issue_id: 'I_missing_test' }, issueNumber: 18,
    source: { kind: 'local', location: source }, baseSha: currentUpstreamSha, predecessorAttemptId: null, inheritedBaseSha: null });
  assert.equal(missingWorkspace.state, 'prepared');
  rmSync(missingWorkspace.resource.path, { recursive: true });
  const missingRetry = await prepare({ attemptId: missingRetryAttemptId, workspace: { ...identity, issue_id: 'I_missing_test' }, issueNumber: 18,
    source: { kind: 'local', location: source }, baseSha: currentUpstreamSha,
    predecessorAttemptId: missingFirstAttemptId, inheritedBaseSha: currentUpstreamSha });
  assert.equal(missingRetry.state, 'failed');
  assert.equal(missingRetry.diagnostic?.code, 'WORKSPACE_MISSING');
  assert.equal(existsSync(missingWorkspace.resource.path), false);

  console.log(JSON.stringify({ proof: 'issue_workspace_reuse_real_git', sameWorkspace: retry.resource.path === first.resource.path,
    inheritedAddedEditedDeleted: true, ignoredFilePreserved: true, progressOutsideDelivery: true,
    noImplicitRebase: true, deliveryParentIsInheritedSnapshot: true,
    sharedHistoryRepository: retained === join(managedRoot, 'issues', '17', 'history.git'),
    immutableDeliveryRefInSharedHistory: retainedRefs.includes(`refs/factory/deliveries/${deliveryId}`),
    noNewAttemptRepository: !existsSync(join(managedRoot, 'git', retryAttemptId + '.git')),
    identityMismatchBlocked: true, repositoryMismatchBlocked: true, missingWorkspaceNotRecreated: true,
    attemptsSharingWorkspace: 3, issueCloneCount, thirdAttemptPreservesPendingChanges: true,
    previousDeliveryUnchangedAfterThirdAttempt: true, thirdDeliveryDeltaExcludesInheritedChanges: true,
    inheritedIndexDeletionMatchesSnapshot: true,
    previousDeliveryMaterializedAfterThirdAttempt: true,
    reviewerCanReadCapturedCommit: true, reviewPreservesIndexAndHead: true,
    attemptId: retryAttemptId, baselineSha, deliverySha: captured.commitSha }));
} finally {
  const resolvedRoot = resolve(root);
  if (!resolvedRoot.startsWith(rootCache + sep)) throw new Error('PROOF_PATH_INVALID');
  rmSync(resolvedRoot, { recursive: true, force: true });
}
