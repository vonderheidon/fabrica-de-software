import type Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { OperationId } from '#contracts';
import { digest, readProject } from './configuration-reads.js';
import { projectDeletionInventory } from './project-deletion-inventory.js';
import { readSettings } from './settings.js';
import { assertDeletionQuiescent } from './project-deletion-barrier.js';
import { OperationError } from './operations.js';

/** One read snapshot. No filesystem access or persistence of the inspection. */
export function readProjectDeletionPaths(db: Database.Database, projectId: string, dataDirectory: string,
  worker?: { operationId: string; token: string; generation: number }) {
  // Background recovery uses only the exact durable authorization, independently
  // of the currently selected account. Ordinary callers retain account scoping.
  const authorized = worker ? db.prepare<[string, string, string, number], {
    id: string; name: string; revision: number; source_kind: 'local' | 'github'; source_location: string;
  }>(`SELECT p.id,p.name,p.revision,r.source_kind,r.source_location FROM projects p
    JOIN project_revisions r ON r.id=p.current_revision_id AND r.project_id=p.id
    JOIN project_deletions d ON d.project_id=p.id
    WHERE p.id=? AND d.operation_id=? AND d.worker_token=? AND d.worker_generation=?
    `).get(projectId, worker.operationId, worker.token, worker.generation) : undefined;
  if (worker && !authorized) throw new OperationError(409, 'PROJECT_DELETION_OWNERSHIP_LOST', 'A posse da exclusão mudou.');
  const project = authorized ? { id: authorized.id, name: authorized.name, revision: authorized.revision,
    source: { kind: authorized.source_kind, location: authorized.source_location } } : readProject(db, projectId).project;
  const inventory = projectDeletionInventory(db, projectId);
  const blockers = inventory.blockers.map(({ reason, recovery }) => ({ reason, recovery }));
  try { assertDeletionQuiescent(db, projectId); }
  catch (error) {
    if (!(error instanceof OperationError) || error.code !== 'PROJECT_DELETION_ACTIVITY_BLOCKED') throw error;
    blockers.push({ reason: error.message, recovery: error.details?.recovery ?? 'Confira o encerramento dos recursos antes de excluir.' });
  }
  const targets: { key: string; kind: 'original_directory' | 'exclusive_workspace' | 'exclusive_artifact';
    path: string; ownerKind: 'project' | 'attempt'; ownerId: string }[] = [];
  const addAttempt = (id: string): void => {
    if (!Value.Check(OperationId, id)) {
      blockers.push({ reason: 'Um recurso não tem identidade válida.', recovery: 'Corrija o inventário antes de tentar excluir o projeto.' });
      return;
    }
    for (const [key, path, kind] of [
      ['work', resolve(dataDirectory, 'work', id), 'exclusive_workspace'],
      ['git', resolve(dataDirectory, 'git', `${id}.git`), 'exclusive_workspace'],
      ['artifacts', resolve(dataDirectory, 'artifacts', id), 'exclusive_artifact'],
    ] as const) targets.push({ key: `${key}:${id}`, kind, path, ownerKind: 'attempt', ownerId: id });
  };
  if (project.source.kind === 'local') targets.push({ key: `original:${projectId}`, kind: 'original_directory',
    path: project.source.location, ownerKind: 'project', ownerId: projectId });
  const attempts = db.prepare<[string], { id: string }>('SELECT id FROM attempts WHERE project_id=? ORDER BY id').all(projectId);
  for (const attempt of attempts) addAttempt(attempt.id);
  const passages = db.prepare<[string], { id: string; attempt_id: string }>(
    'SELECT id,attempt_id FROM passages WHERE attempt_id IN (SELECT id FROM attempts WHERE project_id=?) ORDER BY id',
  ).all(projectId);
  for (const passage of passages) {
    if (Value.Check(OperationId, passage.id)) targets.push({ key: `bootstrap:${passage.id}`, kind: 'exclusive_workspace',
      path: resolve(dataDirectory, 'execution-bootstrap', passage.id), ownerKind: 'attempt', ownerId: passage.attempt_id });
    else blockers.push({ reason: 'Uma passagem não tem identidade válida.', recovery: 'Corrija o inventário antes de tentar excluir o projeto.' });
  }
  const resources = db.prepare<[string], { id: string; owned: number; reference: string; attempt_id: string; kind: string }>(
    'SELECT id,owned,reference,attempt_id,kind FROM resources WHERE attempt_id IN (SELECT id FROM attempts WHERE project_id=?) ORDER BY id',
  ).all(projectId);
  const artifacts = db.prepare<[string], { id: string; attempt_id: string; check_id: string; path_relative: string }>(
    'SELECT id,attempt_id,check_id,path_relative FROM artifacts WHERE attempt_id IN (SELECT id FROM attempts WHERE project_id=?) ORDER BY id',
  ).all(projectId);
  if (artifacts.some(a => !Value.Check(OperationId, a.id) || !Value.Check(OperationId, a.check_id) ||
    a.path_relative !== `${a.attempt_id}/${a.check_id}/${a.id}.log`)) {
    blockers.push({ reason: 'O caminho de uma evidência diverge do inventário conhecido.',
      recovery: 'Corrija o vínculo da evidência antes de tentar excluir o projeto.' });
  }
  for (const resource of resources) {
    // Attempt registration stores this exact relative reference. Keep accepting
    // the absolute form, but never normalize arbitrary input into ownership.
    const implementationReferences = [
      `work/${resource.attempt_id}/implementation`,
      resolve(dataDirectory, 'work', resource.attempt_id, 'implementation'),
    ];
    if (!resource.owned || (resource.kind === 'implementation' && !implementationReferences.includes(resource.reference))) {
      blockers.push({ reason: 'O pertencimento de um ambiente não pôde ser comprovado.',
        recovery: 'Confira os recursos registrados antes de tentar excluir este projeto.' });
    }
  }
  // Protect current origins only; never turn historical revisions into targets.
  const otherOrigins = db.prepare<[string], { path: string }>(`SELECT r.source_location AS path FROM projects p
    JOIN project_revisions r ON r.id=p.current_revision_id AND r.project_id=p.id
    WHERE p.id<>? AND r.source_kind='local' ORDER BY p.id`).all(projectId);
  const creations = db.prepare<[], { id: string; project_id: string | null; destination: string }>(
    'SELECT id,project_id,destination FROM project_creations ORDER BY id',
  ).all();
  const others = db.prepare<[string], { id: string }>('SELECT id FROM attempts WHERE project_id<>? ORDER BY id').all(projectId);
  const otherPassages = db.prepare<[string], { id: string }>(
    'SELECT id FROM passages WHERE attempt_id IN (SELECT id FROM attempts WHERE project_id<>?) ORDER BY id',
  ).all(projectId);
  const otherResources = db.prepare<[string], { reference: string }>(`SELECT reference FROM resources
    WHERE kind='implementation' AND attempt_id IN (SELECT id FROM attempts WHERE project_id<>?) ORDER BY id`).all(projectId);
  const protectedPaths = [...otherOrigins.map(o => o.path),
    ...creations.filter(c => c.project_id !== projectId || project.source.kind !== 'local' || c.destination !== project.source.location).map(c => c.destination),
    ...others.flatMap(a => [resolve(dataDirectory, 'work', a.id), resolve(dataDirectory, 'git', `${a.id}.git`), resolve(dataDirectory, 'artifacts', a.id)]),
    ...otherPassages.map(p => resolve(dataDirectory, 'execution-bootstrap', p.id)),
    ...otherResources.map(r => resolve(dataDirectory, r.reference)),
    resolve(dataDirectory, 'factory.sqlite'), resolve(dataDirectory, 'controller-lock.sqlite')];
  const settings = readSettings(db);
  const schema = db.prepare<[], { version: number; checksum: string }>('SELECT version,checksum FROM schema_migrations ORDER BY version').all();
  if (schema.length !== 26 || schema.at(-1)?.version !== 26) blockers.push({
    reason: 'A versão do inventário de recursos não é suportada nesta conferência.',
    recovery: 'Atualize a política de conferência para o schema instalado.' });
  // Data and install containers cannot themselves be removed. Exclusive leaves
  // below work/git/artifacts remain eligible; no shared container is a target.
  const containers = [resolve(dataDirectory), resolve(dataDirectory, '..'), resolve(dataDirectory, '../..'),
    resolve(dataDirectory, 'work'), resolve(dataDirectory, 'git'), resolve(dataDirectory, 'artifacts'),
    resolve(dataDirectory, 'execution-bootstrap'),
    ...(settings.projects_root ? [settings.projects_root] : [])];
  const inventoryVersion = digest({ version: 1, schema, project, keys: inventory.keys, resources, artifacts, passages, otherPassages, otherResources, otherOrigins, creations, others,
    installation: settings.installation_id, account: settings.account_id, containers });
  const originalProtectedPaths = [resolve(dataDirectory), resolve(dataDirectory, '../..')];
  return { projectId, projectName: project.name, projectRevision: project.revision, sourceKind: project.source.kind,
    inventoryVersion, targets, protectedPaths, originalProtectedPaths, containers, blockers };
}
