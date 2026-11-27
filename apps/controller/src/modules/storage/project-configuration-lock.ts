import type Database from 'better-sqlite3';
import { OperationError } from './operations.js';

export const configurationLockMessage = 'Este projeto tem uma tentativa ou publicação em andamento. Aguarde a conclusão ou cancele a tentativa e aguarde a confirmação da parada para alterar as configurações.';

export function projectConfigurationLock(db: Database.Database, projectId: string): { attempt_id: string } | null {
  const conditions = ['a.result IS NULL',
    "EXISTS (SELECT 1 FROM publication_requests p WHERE p.attempt_id=a.id AND p.state IN ('accepted','running'))",
    "EXISTS (SELECT 1 FROM effects e WHERE e.attempt_id=a.id AND e.state IN ('running','unknown'))",
    "EXISTS (SELECT 1 FROM resources r WHERE r.attempt_id=a.id AND r.launch_state='starting')",
    "EXISTS (SELECT 1 FROM terminal_occupancies t WHERE t.attempt_id=a.id AND t.state IN ('occupied','uncertain'))"];
  return db.prepare<[string], { attempt_id: string }>(`SELECT a.id AS attempt_id FROM attempts a WHERE a.project_id=? AND (${conditions.join(' OR ')}) ORDER BY a.created_at_ms DESC, a.id LIMIT 1`).get(projectId) ?? null;
}

export function assertProjectConfigurationEditable(db: Database.Database, projectId: string): void {
  if (projectConfigurationLock(db, projectId)) throw new OperationError(409, 'PROJECT_CONFIGURATION_LOCKED', configurationLockMessage);
}
