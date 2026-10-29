import { lstat, mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { OperationId, ProjectStorageRootObservation, type ProjectStorageObjectIdentity, type ProjectStorageView } from '#contracts';

export class ProjectStorageError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface ProjectStoragePersistence {
  getAttemptProjectId(attemptId: string): string;
  getAttemptWorkspaceReference(attemptId: string): string;
  getProjectStorageView(projectId: string): ProjectStorageView;
  getStorageTransition?(operationId: string): {
    state: 'planned' | 'running' | 'verified' | 'uncertain' | 'blocked';
    source_relative: string;
    destination_relative: string;
    source_identity: ProjectStorageObjectIdentity;
    destination_identity: ProjectStorageObjectIdentity | null;
  } | null;
  recordProjectStorageLocation(observation: ProjectStorageRootObservation): unknown;
  assertProjectStorageLocation(observation: ProjectStorageRootObservation): void;
}

export type AttemptRootResolver = (attemptId: string, allocate?: boolean) => Promise<string>;

export function requireAttemptRootResolver(resolver: AttemptRootResolver | undefined): AttemptRootResolver {
  if (!resolver) throw new ProjectStorageError('PROJECT_STORAGE_PERSISTENCE_UNAVAILABLE');
  return resolver;
}

const keyPattern = /^[a-z][a-z0-9._-]{0,255}$/;
const safeRelative = (value: string): boolean => value.length > 0 && value.length <= 32768 && !isAbsolute(value) &&
  !value.includes('\\') && !value.includes(':') && !/[\x00-\x1f\x7f]/.test(value) &&
  value.split('/').every(part => part !== '' && part !== '.' && part !== '..');

export function projectStorageRootRelative(projectId: string, locationKey: string, layoutVersion = 1): string {
  if (!Value.Check(OperationId, projectId) || !keyPattern.test(locationKey) || !Number.isSafeInteger(layoutVersion) || layoutVersion < 1) {
    throw new ProjectStorageError('PROJECT_STORAGE_IDENTITY_INVALID');
  }
  return `var/factory/projects/${projectId}/v${layoutVersion}/${locationKey}`;
}

function statIdentity(stat: Awaited<ReturnType<typeof lstat>>): { volume_id: string; object_id: string } {
  const value = stat as typeof stat & { dev: bigint | number; ino: bigint | number };
  const volumeId = String(value.dev);
  const objectId = String(value.ino);
  if (!volumeId || !objectId || objectId === '0' || objectId === 'NaN') throw new ProjectStorageError('PROJECT_STORAGE_IDENTITY_UNAVAILABLE');
  return { volume_id: volumeId, object_id: objectId };
}

/** Inspects only an existing project-owned root; it never creates or moves filesystem entries. */
export function createProjectStorageInspector(dataDirectory: string, canonicalize: (path: string) => Promise<string> = realpath,
  persistence?: ProjectStoragePersistence) {
  const installationRoot = resolve(dataDirectory, '..', '..');
  const pending = new Map<string, Promise<string>>();
  async function ensureDirectory(path: string): Promise<void> {
    try { await mkdir(path); } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await canonicalize(path) !== path) throw new ProjectStorageError('PROJECT_STORAGE_PATH_INVALID');
  }
  async function ensureProjectStorageRoot(projectId: string): Promise<string> {
    if (!persistence) throw new ProjectStorageError('PROJECT_STORAGE_PERSISTENCE_UNAVAILABLE');
    const prior = pending.get(projectId); if (prior) return prior;
    const task = (async () => {
      const existing = persistence.getProjectStorageView(projectId);
      if (existing.state === 'blocked' || existing.state === 'uncertain' || existing.state === 'transitioning') {
        throw new ProjectStorageError('PROJECT_STORAGE_UNAVAILABLE');
      }
      const location = existing.locations.find(item => item.location_key === 'managed' && item.current);
      if (location) {
        const observed = await inspector.inspectProjectStorageRoot(projectId, location.location_key, location.layout_version);
        persistence.assertProjectStorageLocation(observed);
        return resolve(installationRoot, ...location.path.split('/'));
      }
      const rootRelative = projectStorageRootRelative(projectId, 'managed');
      let current = installationRoot;
      for (const part of rootRelative.split('/')) { current = resolve(current, part); await ensureDirectory(current); }
      const observed = await inspector.inspectProjectStorageRoot(projectId, 'managed');
      persistence.recordProjectStorageLocation(observed);
      return current;
    })().finally(() => pending.delete(projectId));
    pending.set(projectId, task); return task;
  }
  const inspector = {
    async inspectProjectStorageRoot(projectId: string, locationKey: string, layoutVersion = 1) {
      try {
      const rootRelative = projectStorageRootRelative(projectId, locationKey, layoutVersion);
      const install = await canonicalize(installationRoot);
      const data = await canonicalize(dataDirectory);
      if (install !== installationRoot || data !== resolve(install, 'var', 'factory')) throw new ProjectStorageError('PROJECT_STORAGE_INSTALLATION_INVALID');
      const target = resolve(install, ...rootRelative.split('/'));
      if (!safeRelative(rootRelative) || relative(install, target).startsWith(`..${sep}`) || isAbsolute(relative(install, target))) {
        throw new ProjectStorageError('PROJECT_STORAGE_PATH_INVALID');
      }
      const parts = rootRelative.split('/');
      let path = install;
      const ancestors: ProjectStorageObjectIdentity['ancestors'] = [];
      for (const part of parts) {
        path = resolve(path, part);
        const before = await lstat(path, { bigint: true });
        if (!before.isDirectory() || before.isSymbolicLink() || await canonicalize(path) !== path) {
          throw new ProjectStorageError('PROJECT_STORAGE_PATH_INVALID');
        }
        const identity = statIdentity(before);
        const after = await lstat(path, { bigint: true });
        const confirmed = statIdentity(after);
        if (before.dev !== after.dev || before.ino !== after.ino || !after.isDirectory() || after.isSymbolicLink()) {
          throw new ProjectStorageError('PROJECT_STORAGE_ROOT_CHANGED');
        }
        ancestors.push(identity);
        if (ancestors.length > 64) throw new ProjectStorageError('PROJECT_STORAGE_PATH_INVALID');
        if (identity.volume_id !== confirmed.volume_id || identity.object_id !== confirmed.object_id) {
          throw new ProjectStorageError('PROJECT_STORAGE_ROOT_CHANGED');
        }
      }
      const object_identity = Value.Parse(ProjectStorageRootObservation.properties.object_identity, {
        format_version: 1, ...ancestors.at(-1)!, ancestors,
      }) as ProjectStorageObjectIdentity;
      return Value.Parse(ProjectStorageRootObservation, {
        project_id: projectId, location_key: locationKey, layout_version: layoutVersion,
        root_relative: rootRelative, object_identity, verified_at_ms: Date.now(),
      });
      } catch (error) {
        if (error instanceof ProjectStorageError) throw error;
        throw new ProjectStorageError('PROJECT_STORAGE_ROOT_UNAVAILABLE');
      }
    },
    resolveProjectRelativeReference(projectId: string, locationKey: string, reference: string, layoutVersion = 1): string {
      const root = projectStorageRootRelative(projectId, locationKey, layoutVersion);
      if (!safeRelative(reference)) throw new ProjectStorageError('PROJECT_STORAGE_REFERENCE_INVALID');
      const rootPath = resolve(installationRoot, ...root.split('/'));
      const target = resolve(rootPath, ...reference.split('/'));
      const pathFromRoot = relative(rootPath, target);
      if (!pathFromRoot || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
        throw new ProjectStorageError('PROJECT_STORAGE_REFERENCE_INVALID');
      }
      return target;
    },
  };
  return {
    ...inspector,
    ensureProjectStorageRoot,
    async resolveAttemptRoot(attemptId: string, allocate = false): Promise<string> {
      if (!persistence) throw new ProjectStorageError('PROJECT_STORAGE_PERSISTENCE_UNAVAILABLE');
      const projectId = persistence.getAttemptProjectId(attemptId);
      const reference = persistence.getAttemptWorkspaceReference(attemptId);
      if (!Value.Check(OperationId, attemptId) || reference !== `projects/${projectId}/v1/managed/work/${attemptId}/implementation`) {
        throw new ProjectStorageError('PROJECT_STORAGE_REFERENCE_INVALID');
      }
      const view = persistence.getProjectStorageView(projectId);
      const current = view.locations.find(item => item.location_key === 'managed' && item.current);
      if (!current) {
        if (allocate) return ensureProjectStorageRoot(projectId);
        throw new ProjectStorageError('PROJECT_STORAGE_ROOT_UNAVAILABLE');
      }
      try {
        const observation = await inspector.inspectProjectStorageRoot(projectId, current.location_key, current.layout_version);
        persistence.assertProjectStorageLocation(observation);
        return resolve(installationRoot, ...current.path.split('/'));
      } catch (error) {
        const operationId = view.active_transition_operation_id;
        const transition = operationId && persistence.getStorageTransition?.(operationId);
        if (!(error instanceof ProjectStorageError) || error.code !== 'PROJECT_STORAGE_ROOT_UNAVAILABLE' ||
            !transition || !['running', 'uncertain', 'blocked'].includes(transition.state) ||
            transition.source_relative !== current.path ||
            transition.source_relative !== projectStorageRootRelative(projectId, current.location_key, current.layout_version) ||
            transition.destination_relative !== projectStorageRootRelative(projectId, current.location_key, current.layout_version + 1)) {
          throw error;
        }
        const destination = await inspector.inspectProjectStorageRoot(projectId, current.location_key, current.layout_version + 1);
        const expectedIdentity = transition.destination_identity ?? transition.source_identity;
        if (destination.object_identity.volume_id !== expectedIdentity.volume_id ||
            destination.object_identity.object_id !== expectedIdentity.object_id) {
          throw new ProjectStorageError('PROJECT_STORAGE_TRANSITION_DESTINATION_CHANGED');
        }
        return resolve(installationRoot, ...transition.destination_relative.split('/'));
      }
    },
    async resolveRepositoryReference(attemptId: string, repositoryRelative: string): Promise<string> {
      if (!Value.Check(OperationId, attemptId) || repositoryRelative !== `git/${attemptId}.git`) {
        throw new ProjectStorageError('PROJECT_STORAGE_REFERENCE_INVALID');
      }
      const root = await this.resolveAttemptRoot(attemptId);
      return resolve(root, 'git', `${attemptId}.git`);
    },
  };
}
