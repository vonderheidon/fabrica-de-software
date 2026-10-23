import { lstat, mkdir, realpath, rename } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { ProjectStorageObjectIdentity, type ProjectStorageObjectIdentity as Identity } from '#contracts';
import { ProjectStorageError, projectStorageRootRelative, createProjectStorageInspector } from './project-storage.js';

function identityKey(identity: Identity): string { return `${identity.volume_id}:${identity.object_id}`; }
function absent(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }

export function createProjectStorageTransitionWorkspace(dataDirectory: string,
  canonicalize: (path: string) => Promise<string> = realpath) {
  const installationRoot = resolve(dataDirectory, '..', '..');
  const inspector = createProjectStorageInspector(dataDirectory, canonicalize);

  async function destinationExists(path: string): Promise<boolean> {
    try { await lstat(path); return true; } catch (error) { if (absent(error)) return false; throw new ProjectStorageError('STORAGE_TRANSITION_DESTINATION_UNAVAILABLE'); }
  }

  async function ensureDestinationParent(destination: string): Promise<void> {
    const parent = resolve(destination, '..');
    const fromRoot = relative(installationRoot, parent);
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new ProjectStorageError('STORAGE_TRANSITION_PATH_INVALID');
    }
    let current = installationRoot;
    for (const part of fromRoot.split(sep)) {
      current = resolve(current, part);
      try { await mkdir(current); } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw new ProjectStorageError('STORAGE_TRANSITION_DIRECTORY_CREATE_FAILED');
      }
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await canonicalize(current) !== current) {
        throw new ProjectStorageError('STORAGE_TRANSITION_PATH_INVALID');
      }
    }
  }

  async function inspect(projectId: string, sourcePath: string, sourceLayoutVersion: number) {
    const expectedSource = projectStorageRootRelative(projectId, 'managed', sourceLayoutVersion);
    const destinationRelative = projectStorageRootRelative(projectId, 'managed', sourceLayoutVersion + 1);
    if (sourcePath !== expectedSource) throw new ProjectStorageError('STORAGE_TRANSITION_SOURCE_INVALID');
    const source = await inspector.inspectProjectStorageRoot(projectId, 'managed', sourceLayoutVersion);
    const destination = resolve(installationRoot, ...destinationRelative.split('/'));
    if (await destinationExists(destination)) throw new ProjectStorageError('STORAGE_TRANSITION_DESTINATION_EXISTS');
    return { source, destination_relative: destinationRelative };
  }

  async function move(input: { project_id: string; source_relative: string; destination_relative: string; source_identity: Identity }) {
    if (!Value.Check(ProjectStorageObjectIdentity, input.source_identity)) throw new ProjectStorageError('STORAGE_TRANSITION_IDENTITY_INVALID');
    const sourceParts = /^var\/factory\/projects\/([0-9a-f-]{36})\/v([1-9][0-9]*)\/managed$/.exec(input.source_relative);
    if (!sourceParts || sourceParts[1] !== input.project_id ||
        input.destination_relative !== projectStorageRootRelative(input.project_id, 'managed', Number(sourceParts[2]) + 1)) {
      throw new ProjectStorageError('STORAGE_TRANSITION_PATH_INVALID');
    }
    const source = resolve(installationRoot, ...input.source_relative.split('/'));
    const destination = resolve(installationRoot, ...input.destination_relative.split('/'));
    let sourcePresent = false;
    try { await lstat(source); sourcePresent = true; } catch (error) { if (!absent(error)) throw new ProjectStorageError('STORAGE_TRANSITION_SOURCE_UNAVAILABLE'); }
    const destinationPresent = await destinationExists(destination);
    if (!sourcePresent && !destinationPresent) throw new ProjectStorageError('STORAGE_TRANSITION_BOTH_MISSING');
    if (sourcePresent) {
      const before = await inspector.inspectProjectStorageRoot(input.project_id, 'managed', Number(sourceParts[2]));
      if (before.object_identity.volume_id !== input.source_identity.volume_id || before.object_identity.object_id !== input.source_identity.object_id) {
        throw new ProjectStorageError('STORAGE_TRANSITION_SOURCE_CHANGED');
      }
    }
    if (sourcePresent && destinationPresent) throw new ProjectStorageError('STORAGE_TRANSITION_BOTH_PRESENT');
    if (sourcePresent) {
      await ensureDestinationParent(destination);
      const adjacent = await inspector.inspectProjectStorageRoot(input.project_id, 'managed', Number(sourceParts[2]));
      if (JSON.stringify(adjacent.object_identity) !== JSON.stringify(input.source_identity)) {
        throw new ProjectStorageError('STORAGE_TRANSITION_SOURCE_CHANGED');
      }
      if (await destinationExists(destination)) throw new ProjectStorageError('STORAGE_TRANSITION_DESTINATION_EXISTS');
      try { await rename(source, destination); }
      catch (error) {
        const nativeCode = error instanceof Error && 'code' in error ? String(error.code) : '';
        throw new ProjectStorageError(nativeCode === 'EXDEV' ? 'STORAGE_TRANSITION_CROSS_VOLUME' :
          nativeCode === 'EACCES' || nativeCode === 'EPERM' ? 'STORAGE_TRANSITION_ACCESS_DENIED' :
          nativeCode === 'EEXIST' ? 'STORAGE_TRANSITION_DESTINATION_EXISTS' : 'STORAGE_TRANSITION_MOVE_FAILED');
      }
    }
    const destinationObservation = await inspector.inspectProjectStorageRoot(input.project_id, 'managed', Number(sourceParts[2]) + 1);
    if (identityKey(destinationObservation.object_identity) !== identityKey(input.source_identity)) {
      throw new ProjectStorageError('STORAGE_TRANSITION_DESTINATION_CHANGED');
    }
    return destinationObservation;
  }

  return { inspectProjectStorageTransition: inspect, moveProjectStorageTransition: move };
}
