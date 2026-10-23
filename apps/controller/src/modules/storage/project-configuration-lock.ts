import type Database from 'better-sqlite3';
import { OperationError } from './operations.js';

export const configurationLockMessage = 'Este projeto tem uma tentativa ou publicação em andamento. Aguarde a conclusão ou cancele a tentativa e aguarde a confirmação da parada para alterar as configurações.';

export function projectConfigurationLock(db: Database.Database, projectId: string): { attempt_id: string } | null {
  // Migration fixtures can save configuration before execution tables exist.
  const tables = new Set(db.prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name));
  if (!tables.has('attempts')) return null;
  const conditions = ['a.result IS NULL'];
  if (tables.has('publication_requests')) conditions.push("EXISTS (SELECT 1 FROM publication_requests p WHERE p.attempt_id=a.id AND p.state IN ('accepted','running'))");
  if (tables.has('effects')) conditions.push("EXISTS (SELECT 1 FROM effects e WHERE e.attempt_id=a.id AND e.state IN ('running','unknown'))");
  if (tables.has('resources')) conditions.push("EXISTS (SELECT 1 FROM resources r WHERE r.attempt_id=a.id AND r.launch_state='starting')");
  if (tables.has('terminal_occupancies')) conditions.push("EXISTS (SELECT 1 FROM terminal_occupancies t WHERE t.attempt_id=a.id AND t.state IN ('occupied','uncertain'))");
  return db.prepare<[string], { attempt_id: string }>(`SELECT a.id AS attempt_id FROM attempts a WHERE a.project_id=? AND (${conditions.join(' OR ')}) ORDER BY a.created_at_ms DESC, a.id LIMIT 1`).get(projectId) ?? null;
}

export function assertProjectConfigurationEditable(db: Database.Database, projectId: string): void {
  if (projectConfigurationLock(db, projectId)) throw new OperationError(409, 'PROJECT_CONFIGURATION_LOCKED', configurationLockMessage);
}
