import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { OriginRequest, type OriginDiagnostic, type OriginInspection, type RepositoryReference } from '#contracts';
import type { GitHub } from '../github/index.js';
import type { GitReader } from './git.js';

const messages = {
  CONTEXT_UNAVAILABLE: ['Authorized Git context is unavailable.', 'Use the authorized Windows host context.'],
  ORIGIN_INVALID: ['The origin is not an accessible Git working tree or GitHub repository URL.', 'Choose an existing working tree or an exact GitHub repository URL.'],
  BRANCH_INVALID: ['The base branch name is invalid.', 'Choose an exact branch name.'],
  BRANCH_NOT_FOUND: ['The selected base branch does not exist in the inspected origin.', 'Choose an existing branch; inspection does not fetch or create branches.'],
  GIT_UNAVAILABLE: ['Git inspection could not finish.', 'Verify the executable, permissions and origin; inspect again.'],
  GIT_RESPONSE_INVALID: ['Git returned an invalid or unsupported response.', 'Verify Git compatibility and inspect again.'],
  REMOTE_MISSING: ['The local origin has no remote.', 'Configure and confirm a GitHub remote before starting an attempt.'],
  REMOTE_AMBIGUOUS: ['The origin has multiple remote URLs.', 'Select an exact remote; inspection does not choose one.'],
  REMOTE_UNSUPPORTED: ['The selected remote is not a supported GitHub URL.', 'Use an exact HTTPS or SSH github.com repository URL.'],
  REMOTE_UNCONFIRMED: ['GitHub could not confirm the selected remote and branch.', 'Resolve the GitHub query diagnostic and inspect again.'],
  REMOTE_MISMATCH: ['The local and remote base branch commits differ.', 'Review the intended committed base before preparing an attempt.'],
  HEAD_UNBORN: ['The origin has no committed HEAD.', 'Create the intended baseline outside inspection.'],
  LOCAL_CHANGES_EXCLUDED: ['Uncommitted changes will not enter an attempt.', 'Commit intended changes outside inspection or use the committed base.'],
  ORIGIN_CHANGED: ['HEAD changed during inspection.', 'Finish concurrent Git work and inspect again.'],
  PROJECT_REQUIRED: ['A configured GitHub Project and issue membership are required before execution.', 'Configure the Project and validate the issue during preparation.'],
} satisfies Record<OriginDiagnostic['code'], [string, string]>;

/** Parse Git transport addresses here, keeping remote representation out of projects/pipeline. */
export function githubReference(location: string): RepositoryReference | null {
  if (/\s|[\x00-\x1f\x7f]/.test(location)) return null;
  let path: string;
  const scp = /^git@github\.com:([^?#]+)$/i.exec(location);
  if (scp) path = scp[1] ?? '';
  else {
    let url: URL;
    try { url = new URL(location); } catch { return null; }
    if (url.hostname.toLowerCase() !== 'github.com' || url.port || url.search || url.hash || url.password ||
      !['https:', 'ssh:'].includes(url.protocol) || (url.protocol === 'https:' && url.username) || (url.protocol === 'ssh:' && url.username !== 'git')) return null;
    path = url.pathname.replace(/^\//, '');
  }
  const match = /^([A-Za-z0-9][A-Za-z0-9-]{0,99})\/([A-Za-z0-9_.-]{1,100}?)\/?$/.exec(path);
  if (!match) return null;
  const name = (match[2] ?? '').replace(/\.git$/, '');
  if (!name || name === '.' || name === '..') return null;
  return { owner: match[1] ?? '', name };
}
export const validBranch = (branch: string) => branch.length <= 1024 && branch.length > 0 &&
  !/[\x00-\x20\x7f~^:?*\[\\]/.test(branch) && !branch.startsWith('-') && !branch.startsWith('/') &&
  !branch.endsWith('/') && !branch.endsWith('.') && !branch.includes('..') && !branch.includes('@{') && branch !== '@' && branch !== 'HEAD' &&
  branch.split('/').every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'));
const sha = (value: string) => /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(value.trim());

export function createInspector(github: Pick<GitHub, 'getRepository' | 'resolveBranch'>, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath) {
  return {
    async inspectOrigin(input: OriginRequest): Promise<OriginInspection> {
      const view: OriginInspection = { state: 'invalid', source: null, local: null, base: null, remote: null, diagnostics: [], githubDiagnostics: [], retryAtMs: null, executionReady: false };
      const note = (code: OriginDiagnostic['code']) => {
        const [message, recovery] = messages[code];
        view.diagnostics.push({ code, message, recovery });
      };
      if (!Value.Check(OriginRequest, input)) { note('ORIGIN_INVALID'); return view; }
      // Never echo a credential-bearing URL, including in a failed inspection.
      if (!validBranch(input.baseBranch)) { note('BRANCH_INVALID'); return view; }
      if (input.remoteName !== undefined && !/^[A-Za-z0-9_.-]{1,128}$/.test(input.remoteName)) { note('ORIGIN_INVALID'); return view; }
      let remoteReference: RepositoryReference | null = null;
      if (input.source.kind === 'github') {
        remoteReference = githubReference(input.source.location);
        if (!remoteReference) { note('ORIGIN_INVALID'); return view; }
        const url = `https://github.com/${remoteReference.owner}/${remoteReference.name}`;
        view.source = { kind: 'github', location: url };
        view.remote = { name: null, url, confirmed: false, repository: null, branch: null };
        view.state = 'identified';
      } else {
        if (!isAbsolute(input.source.location) || /[\x00-\x1f\x7f]/.test(input.source.location)) { note('ORIGIN_INVALID'); return view; }
        if (!git) { view.state = 'unavailable'; note('CONTEXT_UNAVAILABLE'); return view; }
        try {
          const location = await canonicalize(input.source.location);
          const top = await git(location, ['rev-parse', '--show-toplevel']);
          if (top.exitCode !== 0) { note('ORIGIN_INVALID'); return view; }
          const root = await canonicalize(top.stdout.replace(/\r?\n$/, ''));
          const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
          if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') { note('ORIGIN_INVALID'); return view; }
          view.source = { kind: 'local', location: root };
          view.state = 'identified';
          const head = await git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}']);
          if (head.exitCode !== 0 && head.exitCode !== 1) { note('GIT_RESPONSE_INVALID'); view.state = 'unavailable'; return view; }
          if (head.exitCode === 0 && !sha(head.stdout)) { note('GIT_RESPONSE_INVALID'); view.state = 'unavailable'; return view; }
          const status = await git(root, ['status', '--porcelain=v2', '-z', '--untracked-files=normal', '--ignore-submodules=none']);
          if (status.exitCode !== 0 || (status.stdout.length > 0 && !status.stdout.endsWith('\0'))) { note('GIT_RESPONSE_INVALID'); view.state = 'unavailable'; return view; }
          view.local = { root, headSha: head.exitCode === 0 ? head.stdout.trim() : null, dirty: status.stdout.length > 0 };
          if (!view.local.headSha) note('HEAD_UNBORN');
          if (view.local.dirty) note('LOCAL_CHANGES_EXCLUDED');
          const base = await git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `refs/heads/${input.baseBranch}^{commit}`]);
          if (base.exitCode === 0 && sha(base.stdout)) view.base = { branch: input.baseBranch, sha: base.stdout.trim(), observedFrom: 'local' };
          else if (base.exitCode === 1) note('BRANCH_NOT_FOUND');
          else { note('GIT_RESPONSE_INVALID'); view.state = 'unavailable'; return view; }
          const config = await git(root, ['config', '--null', '--get-regexp', '^remote\\..*\\.url$']);
          if (config.exitCode !== 0 && config.exitCode !== 1) { note('GIT_RESPONSE_INVALID'); view.state = 'unavailable'; return view; }
          if ((config.stdout.length > 0 && !config.stdout.endsWith('\0')) || (config.exitCode === 1 && config.stdout.length > 0)) { note('GIT_RESPONSE_INVALID'); view.state = 'unavailable'; return view; }
          const remotes: { name: string; url: string }[] = [];
          for (const entry of config.stdout.split('\0').filter(Boolean)) {
            const match = /^remote\.(.+)\.url\n([\s\S]+)$/.exec(entry);
            if (!match) { note('GIT_RESPONSE_INVALID'); view.state = 'unavailable'; return view; }
            remotes.push({ name: match[1] ?? '', url: match[2] ?? '' });
          }
          const selected = input.remoteName === undefined ? remotes : remotes.filter((remote) => remote.name === input.remoteName);
          if (selected.length === 0) note('REMOTE_MISSING');
          else if (selected.length > 1) note('REMOTE_AMBIGUOUS');
          else {
            const selectedRemote = selected[0];
            remoteReference = selectedRemote ? githubReference(selectedRemote.url) : null;
            if (!remoteReference) note('REMOTE_UNSUPPORTED');
            else view.remote = { name: selectedRemote?.name ?? null, url: `https://github.com/${remoteReference.owner}/${remoteReference.name}`, confirmed: false, repository: null, branch: null };
          }
          const after = await git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}']);
          if (after.exitCode !== head.exitCode || after.stdout !== head.stdout) { view.state = 'unavailable'; note('ORIGIN_CHANGED'); return view; }
        } catch {
          view.state = 'unavailable'; note('GIT_UNAVAILABLE'); return view;
        }
      }
      if (remoteReference && view.remote) {
        const repo = await github.getRepository(remoteReference);
        view.githubDiagnostics.push(...repo.diagnostics);
        view.retryAtMs = repo.retryAtMs;
        if (repo.state !== 'complete' || !repo.data) note('REMOTE_UNCONFIRMED');
        else {
          view.remote.repository = repo.data;
          view.remote.url = repo.data.url;
          view.remote.confirmed = true;
          const branch = await github.resolveBranch({ owner: repo.data.owner.login, name: repo.data.name }, input.baseBranch);
          view.githubDiagnostics.push(...branch.diagnostics);
          view.retryAtMs = branch.retryAtMs;
          if (branch.state === 'complete' && branch.data && branch.data.repositoryId === repo.data.id) {
            view.remote.branch = branch.data;
            if (view.source?.kind === 'github') view.base = { branch: input.baseBranch, sha: branch.data.sha, observedFrom: 'github' };
          } else if (view.source?.kind === 'github') {
            note(branch.diagnostics.some((entry) => entry.code === 'BRANCH_NOT_FOUND') ? 'BRANCH_NOT_FOUND' : 'REMOTE_UNCONFIRMED');
          }
        }
      }
      note('PROJECT_REQUIRED');
      return view;
    },
  };
}
