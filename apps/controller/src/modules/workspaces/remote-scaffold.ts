import { lstat, open, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { EffectView, ScaffoldPlan, type GitHubMutationResult } from '#contracts';
import type { ScaffoldAuthorization } from '../github/index.js';
import type { GitReader } from './git.js';
import { acquireScaffoldPathGuard, ScaffoldWorkspaceError, type ScaffoldPathGuardFactory } from './scaffold-path-guard.js';
import { scaffoldOwnership } from './scaffold.js';

export function createScaffoldRemoteGit(git?: GitReader, authorization?: ScaffoldAuthorization, acquireGuard: ScaffoldPathGuardFactory = acquireScaffoldPathGuard) {
  const fail = (reason: string,state: GitHubMutationResult['state'] = 'unknown'): GitHubMutationResult => ({ state,receipt: null,reason,retryAtMs: null });
  async function perform(plan: ScaffoldPlan,effect: EffectView,write: boolean,accountId?: string,authorize?: () => Promise<void>): Promise<GitHubMutationResult> {
    let sent = false;
    let guard: Awaited<ReturnType<ScaffoldPathGuardFactory>> | undefined;
    try {
      const i = effect.expectedIdentity; const remote = plan.input.remote;
      if (!git || !Value.Check(ScaffoldPlan,plan) || !Value.Check(EffectView,effect) || !remote || !effect.creationId || effect.attemptId || effect.deliveryId ||
        effect.scopeKey !== effect.creationId || !['associate_origin','baseline_push'].includes(effect.kind) || !['running','unknown','confirmed'].includes(effect.state) ||
        !i.repositoryId || !i.commitSha || !i.branchRef || i.branchRef !== `refs/heads/${plan.input.baseBranch}` || i.ownerId !== remote.ownerId || i.repositoryName !== remote.name ||
        i.repositoryOwner !== plan.ownerLogin || i.visibility !== remote.visibility || !/^[A-Za-z0-9-]{1,100}$/.test(i.repositoryOwner ?? '') ||
        !/^[A-Za-z0-9_.-]{1,100}$/.test(remote.name) || /^\.+$/.test(remote.name) || i.planHash !== scaffoldOwnership(plan) || (effect.kind === 'baseline_push' && plan.input.creationMode !== 'remote_push')) throw new ScaffoldWorkspaceError('CREATION_EFFECT_INVALID');
      if (write && (effect.state !== 'running' || !effect.authorized || !authorization || accountId !== plan.account.id ||
        !('kind' in authorization && authorization.kind === 'confirmed_plan') &&
        !('accountId' in authorization && authorization.accountId === accountId && authorization.targets.some(t => t.ownerId === remote.ownerId && t.name === remote.name && t.visibility === remote.visibility && (effect.kind !== 'baseline_push' || t.allowPush))))) return fail('CREATION_TARGET_NOT_AUTHORIZED','failed_known');
      guard = await acquireGuard(join(plan.destination,'.git'));
      const plain = async (path: string) => { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink() || relative(path,await realpath(path)) !== '') throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_REDIRECTED'); return `${info.dev}:${info.ino}:${info.birthtimeMs}`; };
      const own = await plain(plan.destination); const gitDir = join(plan.destination,'.git'); const gitIdentity = await plain(gitDir);
      const marker = join(gitDir,'factory-scaffold-owner'); const info = await lstat(marker);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== 64) throw new ScaffoldWorkspaceError('SCAFFOLD_OWNERSHIP_INVALID');
      const ownerFile = await open(marker,'r');
      try {
        const bytes = Buffer.alloc(65); const read = await ownerFile.read(bytes,0,65,0); const after = await ownerFile.stat();
        if (read.bytesRead !== 64 || after.dev !== info.dev || after.ino !== info.ino || after.size !== 64 || after.mtimeMs !== info.mtimeMs ||
          bytes.subarray(0,64).toString('utf8') !== scaffoldOwnership(plan)) throw new ScaffoldWorkspaceError('SCAFFOLD_OWNERSHIP_INVALID');
      } finally { await ownerFile.close(); }
      for (const name of ['commondir','objects/info/alternates']) { try { await lstat(join(gitDir,name)); throw new ScaffoldWorkspaceError('SCAFFOLD_OWNERSHIP_INVALID'); } catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; } }
      const assertOwned = async () => { guard!.assertHeld(); if (await plain(plan.destination) !== own || await plain(gitDir) !== gitIdentity) throw new ScaffoldWorkspaceError('SCAFFOLD_PATH_REDIRECTED'); };
      const run = async (args: string[],isolatedConfig = true) => { await assertOwned(); return git(plan.destination,[`--git-dir=${gitDir}`,`--work-tree=${plan.destination}`,...args],{ isolatedConfig }); };
      const baseline = await run(['rev-parse','--verify',i.branchRef]); const head = await run(['symbolic-ref','HEAD']);
      const parents = await run(['rev-list','--parents','--max-count=1',i.commitSha]);
      if (baseline.exitCode || baseline.stdout.trim() !== i.commitSha || head.exitCode || head.stdout.trim() !== i.branchRef || parents.exitCode || parents.stdout.trim() !== i.commitSha) throw new ScaffoldWorkspaceError('SCAFFOLD_BASELINE_INVALID');
      const url = `https://github.com/${i.repositoryOwner}/${remote.name}.git`;
      const origins = await run(['config','--local','--get-all','remote.origin.url']);
      const receipt = { id: effect.kind === 'baseline_push' ? i.commitSha : i.repositoryId,repositoryId: i.repositoryId,ownerId: remote.ownerId,
        repositoryName: remote.name,visibility: remote.visibility,branchRef: i.branchRef,commitSha: i.commitSha,operationId: effect.operationId,url: url.slice(0,-4) };
      if (effect.kind === 'associate_origin') {
        if (!write && origins.exitCode === 0 && origins.stdout.trim() === url && origins.stdout.trim().split(/\r?\n/).length === 1) return { state: 'confirmed',receipt,reason: null,retryAtMs: null };
        if (!write || origins.exitCode !== 1 || origins.stdout !== '') return fail('ORIGIN_NOT_CONFIRMED');
        await authorize!(); await assertOwned(); sent = true;
        const associated = await run(['remote','add','origin',url]);
        const observed = await run(['config','--local','--get-all','remote.origin.url']);
        if (associated.exitCode || observed.exitCode || observed.stdout.trim() !== url) return fail('ORIGIN_NOT_CONFIRMED');
        return { state: 'confirmed',receipt,reason: null,retryAtMs: null };
      }
      if (origins.exitCode || origins.stdout.trim() !== url) return fail('ORIGIN_NOT_CONFIRMED');
      const config = await run(['config','--get-regexp','^(url\\..*\\.(insteadof|pushinsteadof)|include.*|core\\.sshcommand|remote\\..*\\.(pushurl|push|mirror|receivepack)|push\\.pushoption)$'],false);
      if (config.exitCode !== 1 || config.stdout !== '') throw new ScaffoldWorkspaceError('PUSH_CONFIGURATION_UNSUPPORTED');
      const network = (args: string[]) => run(['-c','core.hooksPath='+(process.platform === 'win32' ? 'NUL' : '/dev/null'),'-c','protocol.allow=never','-c','protocol.https.allow=always','-c','http.followRedirects=false','-c','push.followTags=false',...args],false);
      const inspect = async () => { const r = await network(['ls-remote','--refs',url,i.branchRef!]); return r.exitCode === 0 ? r.stdout.trim() : null; };
      const prior = await inspect();
      if (prior === `${i.commitSha}\t${i.branchRef}`) return { state: 'confirmed',receipt,reason: null,retryAtMs: null };
      if (!write || prior !== '') return fail('BASELINE_REMOTE_REF_NOT_CONFIRMED');
      await authorize!(); await assertOwned(); sent = true;
      await network(['push','--porcelain','--no-follow-tags','--recurse-submodules=no',url,`${i.commitSha}:${i.branchRef}`]);
      return await inspect() === `${i.commitSha}\t${i.branchRef}` ? { state: 'confirmed',receipt,reason: null,retryAtMs: null } : fail('BASELINE_REMOTE_REF_NOT_CONFIRMED');
    } catch (e) { return fail(e instanceof ScaffoldWorkspaceError ? e.code : 'SCAFFOLD_REMOTE_GIT_UNAVAILABLE',write && !sent ? 'failed_known' : 'unknown'); }
    finally { await guard?.close(); }
  }
  return {
    executeScaffoldGit: (plan: ScaffoldPlan,effect: EffectView,accountId: string,authorize: () => Promise<void>) => perform(plan,effect,true,accountId,authorize),
    reconcileScaffoldGit: (plan: ScaffoldPlan,effect: EffectView) => perform(plan,effect,false),
  };
}
