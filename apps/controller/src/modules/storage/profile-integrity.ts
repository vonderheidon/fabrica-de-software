import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import {
  ProfileType, type PreparationChoices, type ProfileType as ProfileRole, type ProjectConfiguration,
} from '#contracts';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';

interface ProfileRow { profile_type: string; revision: number }

function requireLiveProfile(db: Database.Database, id: string, role?: ProfileRole): ProfileRow {
  const profile = db.prepare<[string], ProfileRow & { deleted_at_ms: number | null }>(
    'SELECT profile_type, revision, deleted_at_ms FROM execution_profiles WHERE id = ?',
  ).get(id);
  if (!profile || profile.deleted_at_ms !== null) {
    throw new OperationError(404, 'PROFILE_NOT_FOUND', 'O perfil de execução selecionado não está mais disponível.', {
      facts: { profile_id: id, ...(role ? { expected_profile_type: role } : {}) },
      affected_requirements: ['RF-77', 'RF-88'],
      recovery: role
        ? 'Abra Configuração > Perfis, selecione um perfil ativo para este papel e salve novamente.'
        : 'Abra Configuração > Perfis, selecione um perfil ativo e salve novamente.',
    });
  }
  if (!Value.Check(ProfileType, profile.profile_type)) throw new StorageError('PROFILE_DATA_INVALID');
  return profile;
}

function requireProfileRole(db: Database.Database, id: string, role: ProfileRole): ProfileRow {
  const profile = requireLiveProfile(db, id, role);
  if (profile.profile_type !== role) {
    throw new OperationError(409, 'PROFILE_TYPE_MISMATCH', 'O tipo do perfil selecionado não corresponde ao papel exigido.', {
      facts: { profile_id: id, expected_profile_type: role, actual_profile_type: profile.profile_type },
      affected_requirements: ['RF-77', 'RF-88'],
      recovery: 'Abra Configuração > Perfis, escolha um perfil do papel exigido e salve novamente.',
    });
  }
  return profile;
}

export function assertProjectProfileRoles(db: Database.Database, configuration: ProjectConfiguration): void {
  const implementerId = configuration.implementer_profile_id;
  const reviewerId = configuration.reviewer_profile_id;
  if (implementerId !== null && implementerId === reviewerId) {
    requireLiveProfile(db, implementerId);
    return;
  }
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
  const selectedId = (role: ProfileRole): string | null => {
    const choice = choices.overrides[`${role}_profile`];
    if (choice?.kind === 'value') return null;
    return choice?.kind === 'reference' ? choice.id : configuration[`${role}_profile_id`];
  };
  const implementerId = selectedId('implementer');
  const reviewerId = selectedId('reviewer');
  if (implementerId !== null && implementerId === reviewerId) {
    const profile = requireLiveProfile(db, implementerId);
    for (const role of ['implementer', 'reviewer'] as const) {
      const choice = choices.overrides[`${role}_profile`];
      if (choice?.kind === 'reference' && choice.revision !== profile.revision) {
        throw new OperationError(409, 'PROFILE_REFERENCE_CHANGED', 'A revisão exata do perfil selecionado não está mais atual.', {
          facts: { profile_id: choice.id, expected_revision: choice.revision, actual_revision: profile.revision },
          affected_requirements: ['RF-78', 'RF-88'],
          recovery: 'Atualize as opções de Perfis, selecione a revisão atual e salve a preparação novamente.',
        });
      }
    }
    return;
  }
  for (const role of ['implementer', 'reviewer'] as const) {
    const choice = choices.overrides[`${role}_profile`];
    if (choice?.kind === 'value') continue;
    if (choice?.kind === 'reference') {
      const profile = requireProfileRole(db, choice.id, role);
      if (profile.revision !== choice.revision) {
        throw new OperationError(409, 'PROFILE_REFERENCE_CHANGED', 'A revisão exata do perfil selecionado não está mais atual.', {
          facts: { profile_id: choice.id, expected_revision: choice.revision, actual_revision: profile.revision },
          affected_requirements: ['RF-78', 'RF-88'],
          recovery: 'Atualize as opções de Perfis, selecione a revisão atual e salve a preparação novamente.',
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
  throw new OperationError(409, 'PROFILE_TYPES_REQUIRED', 'É necessário manter ao menos um perfil ativo de cada papel para iniciar uma tentativa.', {
    facts: { missing_profile_types: missing.join(',') },
    affected_requirements: ['RF-88', 'RF-89'],
    recovery: 'Abra Configuração > Perfis, crie um perfil ativo de Implementador e outro de Revisor e tente iniciar novamente.',
  });
}
