import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { BranchOptions, OriginSource } from '#contracts';
import type { GitHub } from '../github/index.js';
import type { GitReader } from './git.js';
import { githubReference, validBranch } from './inspect.js';

export function createBranchLister(github: Partial<Pick<GitHub,'listBranches'>>,git?: GitReader,canonicalize: (path:string)=>Promise<string> = realpath) {
  return async (source: OriginSource): Promise<BranchOptions> => {
    const unavailable = (): BranchOptions => ({branches:[],state:'unavailable',message:'Não foi possível consultar as branches. Confira a origem e tente atualizar a lista.'});
    try {
      if (source.kind === 'github') {
        const ref = githubReference(source.location);
        if (!ref || !github.listBranches) return unavailable();
        const result = await github.listBranches(ref);
        if (!result.data || !['complete','partial'].includes(result.state)) return unavailable();
        const complete = result.state === 'complete' && result.data.length <= 5000;
        return {branches:[...new Set(result.data)].slice(0,5000).sort(),state:complete ? 'complete' : 'partial',message:complete ? null : 'A lista de branches está incompleta. Atualize a consulta antes de escolher uma branch ausente.'};
      }
      if (!git || !isAbsolute(source.location) || /[\x00-\x1f\x7f]/.test(source.location)) return unavailable();
      const root = await canonicalize(source.location);
      const top = await git(root,['--no-optional-locks','rev-parse','--show-toplevel']);
      if (top.exitCode !== 0 || await canonicalize(top.stdout.trimEnd()) !== root) return unavailable();
      const result = await git(root,['--no-optional-locks','for-each-ref','--sort=refname','--count=5001','--format=%(refname:strip=2)','refs/heads/']);
      if (result.exitCode !== 0) return unavailable();
      const branches = result.stdout.split(/\r?\n/u).filter(Boolean);
      if (!branches.every(validBranch)) return unavailable();
      return {branches:branches.slice(0,5000),state:branches.length > 5000 ? 'partial' : 'complete',message:branches.length > 5000 ? 'A lista mostra as primeiras 5.000 branches locais.' : null};
    } catch { return unavailable(); }
  };
}
