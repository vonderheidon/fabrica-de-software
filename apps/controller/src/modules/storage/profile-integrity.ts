import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import {
  ProfileType, type PreparationChoices, type ProfileType as ProfileRole, type ProjectConfiguration,
} from '#contracts';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';

interface ProfileRow { profile_type: string; revision: number }

function requireProfileRole(db: Database.Database, id: string, role: ProfileRole): ProfileRow {
  const profile = db.prepare<[string], ProfileRow & { deleted_at_ms: number | null }>(
    'SELECT profile_type, revision, deleted_at_ms FROM execution_profiles WHERE id = ?',
  ).get(id);
  if (!profile || profile.deleted_at_ms !== null) {
    throw new OperationError(404, 'PROFILE_NOT_FOUND', 'The selected execution profile is no longer available.', {
      facts: { profile_id: id, expected_profile_type: role },
      affected_requirements: ['RF-77', 'RF-88'],
      recovery: 'Open Configuration > Profiles, select a live profile for this role, and save again.',
    });
  }
  if (!Value.Check(ProfileType, profile.profile_type)) throw new StorageError('PROFILE_DATA_INVALID');
  if (profile.profile_type !== role) {
    throw new OperationError(409, 'PROFILE_TYPE_MISMATCH', 'The selected profile has a different role type.', {
      facts: { profile_id: id, expected_profile_type: role, actual_profile_type: profile.profile_type },
      affected_requirements: ['RF-77', 'RF-88'],
      recovery: 'Open Configuration > Profiles, choose a profile with the required role type, and save again.',
    });
  }
  return profile;
}

export function assertProjectProfileRoles(db: Database.Database, configuration: ProjectConfiguration): void {
  for (const role of ['implementer', 'reviewer'] as const) {
    const id = configuration[`${role}_profile_id`];
    if (id !== null) requireProfileRole(db, id, role);
  }
}

export function assertPreparationProfileRoles(
  db: Database.Database,
  configuration: ProjectConfiguration,
  choices: PreparationChoices,
): void {
  for (const role of ['implementer', 'reviewer'] as const) {
    const choice = choices.overrides[`${role}_profile`];
    if (choice?.kind === 'value') continue;
    if (choice?.kind === 'reference') {
      const profile = requireProfileRole(db, choice.id, role);
      if (profile.revision !== choice.revision) {
        throw new OperationError(409, 'PROFILE_REFERENCE_CHANGED', 'The exact selected profile revision is no longer current.', {
          facts: { profile_id: choice.id, expected_revision: choice.revision, actual_revision: profile.revision },
          affected_requirements: ['RF-78', 'RF-88'],
          recovery: 'Reload profile options, select the current profile revision, and save the preparation again.',
        });
      }
      continue;
    }
    const id = configuration[`${role}_profile_id`];
    if (id !== null) requireProfileRole(db, id, role);
  }
}

export function missingProfileTypes(db: Database.Database): ProfileRole[] {
  const rows = db.prepare<[], { profile_type: string }>(`SELECT DISTINCT profile_type FROM execution_profiles
    WHERE deleted_at_ms IS NULL`).all();
  const available = new Set<ProfileRole>();
  for (const row of rows) {
    if (!Value.Check(ProfileType, row.profile_type)) throw new StorageError('PROFILE_DATA_INVALID');
    available.add(row.profile_type);
  }
  return (['implementer', 'reviewer'] as const).filter((role) => !available.has(role));
}

export function assertProfileTypesAvailable(db: Database.Database): void {
  const missing = missingProfileTypes(db);
  if (missing.length === 0) return;
  throw new OperationError(409, 'PROFILE_TYPES_REQUIRED', 'At least one live profile of each role type is required to start an attempt.', {
    facts: { missing_profile_types: missing.join(',') },
    affected_requirements: ['RF-88', 'RF-89'],
    recovery: 'Open Configuration > Profiles, create a live Implementer and Reviewer profile, then retry the start.',
  });
}
