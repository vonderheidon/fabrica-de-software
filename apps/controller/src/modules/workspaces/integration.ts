import { lstat, realpath } from 'node:fs/promises';
import type { Delivery } from '#contracts';
import { CaptureError, plainDirectory } from './capture.js';
import type { GitReader } from './git.js';

export function createIntegrationImporter(git: GitReader | undefined, materialize: (delivery: Delivery, operationId: string) => Promise<string>) {
  return async (delivery: Delivery, operationId: string, target: { localPath: string; rootIdentity: string; baseSha: string }) => {
    if (!git) throw new CaptureError('CONTEXT_UNAVAILABLE');
    const cwd = await materialize(delivery,operationId);
    const root = await realpath(target.localPath); await plainDirectory(root,realpath);
    const identity = async () => { const s = await lstat(root,{ bigint:true }); return `${s.dev}:${s.ino}:${s.birthtimeNs}`; };
    if (root !== target.localPath || target.rootIdentity !== await identity() || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(target.baseSha)) throw new CaptureError('DELIVERY_TARGET_CHANGED');
    const imported = await git(cwd,['-c','core.hooksPath=','fetch','--no-write-fetch-head','--no-tags','--no-recurse-submodules','--',root,target.baseSha],{ isolatedConfig:true });
    if (imported.exitCode !== 0 || target.rootIdentity !== await identity()) throw new CaptureError('INTEGRATION_BASE_UNAVAILABLE');
    const base = await git(cwd,['rev-parse','--verify',`${target.baseSha}^{commit}`],{ isolatedConfig:true });
    if (base.exitCode !== 0 || base.stdout.trim() !== target.baseSha) throw new CaptureError('INTEGRATION_BASE_UNAVAILABLE');
  };
}
