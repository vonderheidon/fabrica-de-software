import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import type Database from 'better-sqlite3';
import { ProjectStorageObjectIdentity, ProjectStorageLocation, ProjectStorageRootObservation, ProjectStorageView, type ProjectStorageRootObservation as ProjectStorageRootObservationValue } from '#contracts';
import { OperationError } from './operations.js';
import { readProject } from './configuration-reads.js';

interface StoredLocation extends Omit<ProjectStorageLocation, 'current'> {
  project_id: string; root_relative: string; object_identity_json: string; is_current: number; revision: number; created_at_ms: number;
}

const normalizedPath = (path: string): string => process.platform === 'win32' ? path.toLocaleLowerCase('en-US') : path;
function safeRootRelative(value: string, projectId: string): boolean {
  return value.length <= 32768 && value.startsWith(`var/factory/projects/${projectId}/`) && !value.includes('\\') && !value.includes(':') &&
    !/[\x00-\x1f\x7f]/.test(value) &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
function identityJson(observation: ProjectStorageRootObservationValue): string {
  if (!Value.Check(ProjectStorageObjectIdentity, observation.object_identity)) {
    throw new OperationError(400, 'PROJECT_STORAGE_IDENTITY_INVALID', 'A identidade da pasta não pôde ser confirmada.');
  }
  return JSON.stringify(observation.object_identity);
}
function identityTuple(value: string): string {
  let identity: unknown;
  try { identity = JSON.parse(value); } catch { throw new Error('PROJECT_STORAGE_DATA_INVALID'); }
  if (!Value.Check(ProjectStorageObjectIdentity, identity)) throw new Error('PROJECT_STORAGE_DATA_INVALID');
  return `${identity.volume_id}:${identity.object_id}`;
}
function mapLocation(row: StoredLocation) {
  const value = {
    id: row.id, location_key: row.location_key, layout_version: row.layout_version,
    path: row.root_relative, current: row.is_current === 1, verified_at_ms: row.verified_at_ms,
  };
  if (!Value.Check(ProjectStorageLocation, value)) throw new Error('PROJECT_STORAGE_DATA_INVALID');
  return value;
}

export function createProjectStorageLocations(db: Database.Database) {
  function locations(projectId: string): ProjectStorageLocation[] {
    readProject(db, projectId);
    const rows = db.prepare<[string], StoredLocation>(`SELECT id,project_id,location_key,layout_version,root_relative,
      object_identity_json,is_current,revision,created_at_ms,verified_at_ms FROM project_storage_locations
      WHERE project_id=? ORDER BY location_key,revision,id`).all(projectId);
    if (rows.length > 100) throw new Error('PROJECT_STORAGE_DATA_INVALID');
    return rows.map(mapLocation);
  }
  function view(projectId: string) {
    const project = readProject(db, projectId).project;
    const all = db.prepare<[string], StoredLocation>(`SELECT id,project_id,location_key,layout_version,root_relative,
      object_identity_json,is_current,revision,created_at_ms,verified_at_ms FROM project_storage_locations
      WHERE project_id=? ORDER BY location_key,revision,id`).all(projectId);
    if (all.length > 100) throw new Error('PROJECT_STORAGE_DATA_INVALID');
    const current = all.filter(location => location.is_current === 1);
    const value = {
      managed_root: current.find(location => location.location_key === 'managed')?.root_relative ?? null,
      original_path: project.source.kind === 'local' ? project.source.location : null,
      locations: all.map(mapLocation), transition_plan: null, active_transition_operation_id: null,
      state: current.length ? 'current' as const : 'legacy' as const, cause: null, recovery: null,
    };
    if (!Value.Check(ProjectStorageView, value)) throw new Error('PROJECT_STORAGE_DATA_INVALID');
    return value;
  }
  function record(observation: ProjectStorageRootObservationValue): ProjectStorageLocation {
    if (!Value.Check(ProjectStorageRootObservation, observation) ||
      observation.root_relative !== `var/factory/projects/${observation.project_id}/v${observation.layout_version}/${observation.location_key}` ||
      !safeRootRelative(observation.root_relative, observation.project_id) ||
      !/^[a-z][a-z0-9._-]{0,255}$/.test(observation.location_key)) {
      throw new OperationError(400, 'PROJECT_STORAGE_OBSERVATION_INVALID', 'A localização verificada tem formato inválido.');
    }
    const encodedIdentity = identityJson(observation);
    const result = db.transaction(() => {
      readProject(db, observation.project_id);
      const sameKey = db.prepare<[string, string], StoredLocation>(`SELECT id,project_id,location_key,layout_version,root_relative,
        object_identity_json,is_current,revision,created_at_ms,verified_at_ms FROM project_storage_locations
        WHERE project_id=? AND location_key=? ORDER BY revision DESC LIMIT 1`).get(observation.project_id, observation.location_key);
      if (sameKey?.is_current === 1) {
        if (sameKey.root_relative === observation.root_relative && sameKey.object_identity_json === encodedIdentity &&
          sameKey.layout_version === observation.layout_version) return mapLocation(sameKey);
        throw new OperationError(409, 'PROJECT_STORAGE_TRANSITION_REQUIRED', 'A localização atual precisa de uma transição verificada antes de ser substituída.');
      }
      const pathKey = normalizedPath(observation.root_relative);
      const identityKey = identityTuple(encodedIdentity);
      const occupied = db.prepare<[], { project_id: string; location_key: string; root_relative: string; object_identity_json: string }>(`SELECT project_id,location_key,root_relative,object_identity_json
        FROM project_storage_locations WHERE is_current=1`).all().find(row => {
        const otherPath = normalizedPath(row.root_relative);
        return identityTuple(row.object_identity_json) === identityKey || pathKey === otherPath || pathKey.startsWith(`${otherPath}/`) || otherPath.startsWith(`${pathKey}/`);
      });
      if (occupied) throw new OperationError(409, 'PROJECT_STORAGE_ROOT_SHARED', 'A pasta já pertence a outra localização gerenciada.');
      const revision = db.prepare<[string, string], { revision: number | null }>(`SELECT max(revision) AS revision FROM project_storage_locations
        WHERE project_id=? AND location_key=?`).get(observation.project_id, observation.location_key)?.revision ?? 0;
      const id = randomUUID();
      db.prepare(`INSERT INTO project_storage_locations(id,project_id,location_key,layout_version,root_relative,object_identity_json,
        is_current,revision,created_at_ms,verified_at_ms) VALUES (?,?,?,?,?,?,1,?,?,?)`).run(id, observation.project_id,
        observation.location_key, observation.layout_version, observation.root_relative, encodedIdentity, revision + 1,
        observation.verified_at_ms, observation.verified_at_ms);
      return mapLocation(db.prepare<[string], StoredLocation>(`SELECT id,project_id,location_key,layout_version,root_relative,
        object_identity_json,is_current,revision,created_at_ms,verified_at_ms FROM project_storage_locations WHERE id=?`).get(id)!);
    }).immediate();
    return result;
  }
  function assertCurrent(observation: ProjectStorageRootObservationValue): void {
    if (!Value.Check(ProjectStorageRootObservation, observation)) {
      throw new OperationError(400, 'PROJECT_STORAGE_OBSERVATION_INVALID', 'A localização verificada tem formato inválido.');
    }
    const row = db.prepare<[string, string], StoredLocation>(`SELECT id,project_id,location_key,layout_version,root_relative,
      object_identity_json,is_current,revision,created_at_ms,verified_at_ms FROM project_storage_locations
      WHERE project_id=? AND location_key=? AND is_current=1`).get(observation.project_id, observation.location_key);
    if (!row || row.layout_version !== observation.layout_version || row.root_relative !== observation.root_relative ||
      row.object_identity_json !== identityJson(observation)) {
      throw new OperationError(409, 'PROJECT_STORAGE_IDENTITY_CHANGED', 'A identidade da pasta gerenciada mudou.');
    }
  }
  return { locations, view, record, assertCurrent };
}
