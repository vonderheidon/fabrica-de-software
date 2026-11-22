import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { win32, posix } from 'node:path';
import { blocksDeletion, type DeletionBlocker, type DeletionPreview, type DeletionTarget } from '#contracts';
import { observeWindowsReference, observeWindowsReferences, removeWindowsReference } from './windows-reference.js';

export interface DeletionPathClaim {
  readonly key: string;
  readonly kind: DeletionTarget['target_kind'];
  readonly path: string;
  readonly ownerKind: 'project' | 'attempt' | 'delivery' | 'creation';
  readonly ownerId: string;
}
export interface DeletionInspectionInput {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRevision: number;
  readonly sourceKind: 'local' | 'github';
  readonly inventoryVersion: string;
  readonly targets: readonly DeletionPathClaim[];
  /** All accounts, including registrations not visible in the current UI. */
  readonly protectedPaths: readonly string[];
  readonly originalProtectedPaths: readonly string[];
  /** Shared containers may contain an exclusive leaf, but are never targets. */
  readonly containers: readonly string[];
  readonly blockers: readonly DeletionBlocker[];
}
export interface DeletionPathObservation {
  readonly path: string;
  readonly resolvedPath: string | null;
  readonly kind: 'directory' | 'file' | 'symlink' | 'junction' | 'absent';
  /** Stable object/volume identity only, without size, times or internal entries. */
  readonly identity: string | null;
  readonly ancestors: readonly { path: string; identity: string; resolvedPath: string }[];
}
export interface DeletionInspectionPlatform {
  readonly pathStyle: 'windows' | 'posix';
  /** Must be established for the observed volume, not inferred from the OS. */
  readonly caseSensitive: boolean;
  readonly policyVersion: string;
  readonly safeReferenceRemoval: boolean;
  observe(path: string): Promise<DeletionPathObservation>;
  observeMany?(paths: readonly string[]): Promise<readonly DeletionPathObservation[]>;
  /** Must retain the authorized object and ancestor handles through each effect.
   * The adapter must revalidate expected inside that boundary, not by path first.
   */
  removeReference?(expected: DeletionPathObservation): Promise<void>;
}
export interface DeletionInspection {
  readonly preview: DeletionPreview;
  readonly policyVersion: string;
  readonly inventoryVersion: string;
  readonly observations: readonly DeletionPathObservation[];
  readonly claims: readonly DeletionPathClaim[];
}
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
};
const fingerprint = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
const blocker = (reason: string, recovery: string): DeletionBlocker => ({ reason, recovery });

/** Read-only. No authorization, directory discovery, recursive inventory or removal. */
export function createDeletionInspector(platform: DeletionInspectionPlatform = nativeDeletionInspectionPlatform()) {
  const paths = platform.pathStyle === 'windows' ? win32 : posix;
  const normalize = (path: string): string => {
    if (!paths.isAbsolute(path) || /[\u0000-\u001f]/u.test(path) || path.length > 4096 ||
      (platform.pathStyle === 'windows' && (!/^[A-Za-z]:[\\/]/u.test(path) ||
        /[:<>"|?*]/u.test(path.slice(2)) || path.split(/[\\/]/u).slice(1).some(part => /[. ]$/u.test(part) || part === '..' || part === '.' ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))))) {
      throw new Error('DELETION_PATH_UNCERTAIN');
    }
    const normalized = paths.normalize(path).replace(/[\\/]$/u, '');
    return platform.caseSensitive ? normalized : normalized.toLowerCase();
  };
  const contains = (parent: string, child: string): boolean => parent === child || child.startsWith(`${parent}${paths.sep}`);
  const overlaps = (a: string, b: string): boolean => contains(a, b) || contains(b, a);

  async function inspectProjectDeletion(input: DeletionInspectionInput, previous?: DeletionInspection): Promise<DeletionInspection> {
    const blockers = [...input.blockers];
    const observations: DeletionPathObservation[] = [];
    const claims = [...input.targets].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const protectedObservations: DeletionPathObservation[] = [];
    const fail = (error?: unknown) => {
      const code = error instanceof Error && 'code' in error ? error.code : null;
      blockers.push(blocker(code === 'EACCES' || code === 'EPERM' ? 'O acesso a um caminho foi negado; sua ausência não foi comprovada.'
        : code === 'EBUSY' || code === 'ETXTBSY' ? 'Um objeto está bloqueado; sua ausência não foi comprovada.'
          : 'Não foi possível conferir com segurança todos os caminhos.',
      'Verifique o acesso às pastas e consulte novamente a exclusão.'));
    };
    const observeMany = async (pathsToObserve: readonly string[]): Promise<readonly DeletionPathObservation[]> => {
      if (platform.observeMany) {
        const observed = await platform.observeMany(pathsToObserve);
        if (observed.length !== pathsToObserve.length) throw new Error('DELETION_OBSERVATION_COUNT_MISMATCH');
        return observed;
      }
      const observed: DeletionPathObservation[] = [];
      for (const path of pathsToObserve) observed.push(await platform.observe(path));
      return observed;
    };
    if (previous && (previous.preview.project_id !== input.projectId || previous.preview.project_revision !== input.projectRevision ||
      previous.preview.source_kind !== input.sourceKind ||
      previous.policyVersion !== platform.policyVersion || previous.inventoryVersion !== input.inventoryVersion ||
      canonical(previous.claims) !== canonical(claims))) blockers.push(blocker('O conjunto de alvos ou a política da conferência mudou.',
      'Consulte novamente a exclusão do cadastro antes de confirmar.'));
    try {
      if (new Set(claims.map(c => c.key)).size !== claims.length || new Set(claims.map(c => normalize(c.path))).size !== claims.length) fail();
      const protectedPaths = [...new Set([...input.protectedPaths, ...input.originalProtectedPaths, ...input.containers])].sort();
      for (const path of protectedPaths) normalize(path);
      const initialObservations = await observeMany([...protectedPaths, ...claims.map(claim => claim.path)]);
      protectedObservations.push(...initialObservations.slice(0, protectedPaths.length));
      for (let index = 0; index < claims.length; index++) {
        const claim = claims[index]!;
        const lexical = normalize(claim.path);
        const observed = initialObservations[protectedPaths.length + index];
        if (!observed) throw new Error('DELETION_OBSERVATION_COUNT_MISMATCH');
        if (normalize(observed.path) !== lexical || (observed.kind === 'absent') !== (observed.resolvedPath === null) ||
          (observed.kind !== 'absent' && !observed.identity) || !observed.ancestors.length) throw new Error('DELETION_PATH_UNCERTAIN');
        observations.push(observed);
        const effective = observed.resolvedPath === null ? lexical : normalize(observed.resolvedPath);
        if (lexical === normalize(paths.parse(claim.path).root) || effective === normalize(paths.parse(observed.resolvedPath ?? claim.path).root)) {
          blockers.push(blocker('Uma raiz de volume não pode ser excluída.', 'Escolha uma pasta exclusiva na configuração do projeto.'));
        }
        for (const protection of protectedObservations) {
          const originalOnly = input.originalProtectedPaths.includes(protection.path);
          const sharedContainer = input.containers.includes(protection.path) && !(originalOnly && claim.kind === 'original_directory');
          if (originalOnly && claim.kind !== 'original_directory' && !input.containers.includes(protection.path)) continue;
          const variants = [normalize(protection.path), ...(protection.resolvedPath ? [normalize(protection.resolvedPath)] : [])];
          if (variants.some(p => sharedContainer ? contains(lexical, p) || contains(effective, p)
            : overlaps(lexical, p) || overlaps(effective, p)) ||
            (observed.identity !== null && observed.identity === protection.identity)) {
            blockers.push(blocker('O caminho atinge outro cadastro, a instalação ou um recurso compartilhado.',
              'Separe os caminhos compartilhados antes de tentar excluir este projeto.'));
          }
        }
        const before = previous?.observations.find(o => normalize(o.path) === lexical);
        // External removal may resolve a substitution without granting authority
        // over its identity. Keep the original ancestor chain as the boundary.
        const safelyAbsent = observed.kind === 'absent' && observed.identity === null && observed.resolvedPath === null &&
          before !== undefined && canonical(before.ancestors) === canonical(observed.ancestors);
        if (before && canonical(before) !== canonical(observed) && !safelyAbsent) blockers.push(blocker('A pasta ou um de seus ancestrais foi substituído.',
          'Retire a pasta substituta desse caminho fora da aplicação, preservando seu conteúdo, e clique em Tentar novamente para conferir.'));
      }
      for (let i = 0; i < observations.length; i++) for (const right of observations.slice(i + 1)) {
        const left = observations[i]!;
        if (overlaps(normalize(left.path), normalize(right.path)) ||
          (left.resolvedPath && right.resolvedPath && overlaps(normalize(left.resolvedPath), normalize(right.resolvedPath))) ||
          (left.identity && left.identity === right.identity)) {
          blockers.push(blocker('Há alvos sobrepostos ou aliases no conjunto de exclusão.', 'Confira a origem e os recursos exclusivos do cadastro.'));
        }
      }
      // Adjacent second observation detects changes during the inspection itself.
      const guarded = [...protectedObservations, ...observations];
      const adjacent = await observeMany(guarded.map(observation => observation.path));
      for (let index = 0; index < guarded.length; index++) {
        if (canonical(guarded[index]) !== canonical(adjacent[index])) throw new Error('DELETION_PATH_CHANGED');
      }
    } catch (error) { fail(error); }
    if (observations.some(observation => observation.kind !== 'absent') && !platform.safeReferenceRemoval) blockers.push(blocker('A plataforma não oferece a primitiva segura necessária para excluir estes alvos.',
      'Use uma composição do host com remoção por referência de objeto e proteção de ancestrais validada.'));
    if (observations.length !== claims.length) fail();
    const authorizationDigest = fingerprint({ project: input.projectId, revision: input.projectRevision,
      inventory: input.inventoryVersion, policy: platform.policyVersion, caseSensitive: platform.caseSensitive,
      safeReferenceRemoval: platform.safeReferenceRemoval, source: input.sourceKind, claims, observations, protectedObservations });
    return { policyVersion: platform.policyVersion, inventoryVersion: input.inventoryVersion, observations, claims,
      preview: { project_id: input.projectId, project_name: input.projectName, project_revision: input.projectRevision,
        source_kind: input.sourceKind, authorization_digest: authorizationDigest, can_confirm: !blocksDeletion(blockers),
        blockers, targets: claims.map(c => ({ target_key: c.key, target_kind: c.kind, path: c.path,
          state: blocksDeletion(blockers) ? 'blocked' : observations.find(o => normalize(o.path) === normalize(c.path))?.kind === 'absent'
            ? 'removed' : 'pending' })) } };
  }
  /** Always reobserve every authorized path, including persisted removed targets.
   * The caller must retain the original authorization: a blocked observation
   * must never replace the accepted identity or ancestor boundary.
   * This is reconciliation only; it neither removes files nor finalizes SQL.
   */
  async function reconcileProjectDeletion(input: DeletionInspectionInput, authorization: DeletionInspection): Promise<DeletionInspection> {
    return inspectProjectDeletion(input, authorization);
  }
  async function removeProjectDeletion(input: DeletionInspectionInput, authorization: DeletionInspection, progress?: {
    before(key: string): Promise<void>;
    removed(key: string): void;
  }): Promise<DeletionInspection> {
    let current = await reconcileProjectDeletion(input, authorization);
    if (!authorization.preview.can_confirm) return { ...current, preview: { ...current.preview, can_confirm: false,
      blockers: [...authorization.preview.blockers, ...current.preview.blockers],
      targets: current.preview.targets.map(target => ({ ...target, state: 'blocked' })) } };
    if (!current.preview.can_confirm) return current;
    for (const expected of authorization.observations) {
      const key = authorization.claims.find(claim => claim.path === expected.path)!.key;
      await progress?.before(key);
      // Revalidate the complete set, including previously absent/removed leaves,
      // before starting another target. Stop globally on the first divergence.
      current = await reconcileProjectDeletion(input, authorization);
      if (!current.preview.can_confirm) return current;
      if (current.observations.find(o => o.path === expected.path)?.kind === 'absent') { progress?.removed(key); continue; }
      if (!platform.safeReferenceRemoval || !platform.removeReference) return {
        ...current, preview: { ...current.preview, can_confirm: false,
          blockers: [blocker('A remoção segura por referência ainda não está disponível.',
            'Use uma composição do host com a primitiva e as provas adversariais validadas.')],
          targets: current.preview.targets.map(target => ({ ...target, state: 'blocked' })) },
      };
      try { await platform.removeReference(expected); progress?.removed(key); }
      catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : null;
        return { ...current, preview: { ...current.preview, can_confirm: false,
          blockers: [code === 'IDENTITY_CHANGED'
            ? blocker('A pasta ou um de seus ancestrais foi substituído.',
              'Retire a pasta substituta desse caminho fora da aplicação, preservando seu conteúdo, e clique em Tentar novamente para conferir.')
            : blocker(code === 'EACCES' || code === 'EPERM' ? 'O acesso a uma pasta foi negado.'
              : code === 'EBUSY' ? 'Um arquivo ou pasta está bloqueado.' : 'A remoção não pôde ser concluída com segurança.',
            'Verifique o acesso e libere os arquivos em uso; clique em Tentar novamente para conferir.')],
          targets: current.preview.targets.map(target => ({ ...target, state: target.path === expected.path ? 'blocked' : target.state })) } };
      }
    }
    return reconcileProjectDeletion(input, authorization);
  }
  return { inspectProjectDeletion, reconcileProjectDeletion, removeProjectDeletion,
    projectDeletionCapability: () => ({ available: platform.safeReferenceRemoval && platform.removeReference !== undefined,
      reason: platform.safeReferenceRemoval && platform.removeReference ? null : 'A plataforma não oferece remoção por referência segura de objeto.',
      recovery: platform.safeReferenceRemoval && platform.removeReference ? null : 'Use uma composição do host com a primitiva segura validada.' }) };
}

/** Local NTFS adapter qualified by the native adversarial proof suite.
 * Absence is rechecked immediately before SQL finalization, without reserving
 * empty names against creations by other processes after that observation.
 */
export function windowsReferenceDeletionPlatform(): DeletionInspectionPlatform {
  return { pathStyle: 'windows', caseSensitive: false,
    policyVersion: 'project-deletion-paths/windows-ntfs-handles-v2',
    safeReferenceRemoval: true, observe: observeWindowsReference, observeMany: observeWindowsReferences, removeReference: removeWindowsReference };
}

/** Node supplies useful observations, but no handle-relative deletion guarantee. */
export function nativeDeletionInspectionPlatform(): DeletionInspectionPlatform {
  return { pathStyle: process.platform === 'win32' ? 'windows' : 'posix', caseSensitive: process.platform !== 'win32',
    policyVersion: 'project-deletion-paths/v1-node-observation-only', safeReferenceRemoval: false,
    async observe(path) {
      const paths = process.platform === 'win32' ? win32 : posix;
      const ancestors: { path: string; identity: string; resolvedPath: string }[] = [];
      // Bigint identity avoids loss of precision on file IDs.
      const objectIdentity = async (p: string): Promise<string> => {
        const stat = await lstat(p, { bigint: true });
        if (stat.ino === 0n) throw new Error('DELETION_IDENTITY_UNAVAILABLE');
        return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
      };
      const parts: string[] = []; let parent = paths.dirname(path);
      while (true) { parts.unshift(parent); const next = paths.dirname(parent); if (next === parent) break; parent = next; }
      for (const part of parts) {
        const stat = await lstat(part).catch((error: unknown) => {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
          throw error;
        });
        if (!stat) return { path, ancestors, kind: 'absent', resolvedPath: null, identity: null };
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('DELETION_ANCESTOR_UNSAFE');
        ancestors.push({ path: part, identity: await objectIdentity(part), resolvedPath: await realpath(part) });
      }
      try {
        const stat = await lstat(path);
        if (!stat.isDirectory() && !stat.isFile() && !stat.isSymbolicLink()) throw new Error('DELETION_OBJECT_UNSUPPORTED');
        return { path, ancestors, resolvedPath: await realpath(path), identity: await objectIdentity(path),
          kind: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file' };
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          // A dangling link is not absence. Only lstat ENOENT proves the leaf absent.
          try { await lstat(path); } catch (missing) {
            if (missing instanceof Error && 'code' in missing && missing.code === 'ENOENT') return { path, ancestors, kind: 'absent', resolvedPath: null, identity: null };
          }
        }
        throw error;
      }
    } };
}
