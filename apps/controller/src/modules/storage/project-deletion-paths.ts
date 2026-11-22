import type Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { OperationId, passageBootstrapDirectoryReference } from '#contracts';
import { digest, readProject } from './configuration-reads.js';
import { projectDeletionInventory } from './project-deletion-inventory.js';
import { readSettings } from './settings.js';
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
  const blockers: { reason: string; recovery: string; advisory?: boolean }[] = inventory.blockers.map(({ reason, recovery }) => ({ reason, recovery }));
  const targets: { key: string; kind: 'original_directory' | 'exclusive_workspace';
    path: string; ownerKind: 'project' | 'attempt'; ownerId: string }[] = [];
  if (project.source.kind === 'local') targets.push({ key: `original:${projectId}`, kind: 'original_directory',
    path: project.source.location, ownerKind: 'project', ownerId: projectId });
  const installationRoot = resolve(dataDirectory, '..', '..');
  const storageLocations = db.prepare<[string], { id: string; location_key: string; root_relative: string }>(`SELECT id,location_key,root_relative
    FROM project_storage_locations WHERE project_id=? ORDER BY location_key,revision,id`).all(projectId);
  const knownStoragePaths = new Set(storageLocations.map(location => location.root_relative));
  for (const location of storageLocations) {
    const expectedPrefix = `var/factory/projects/${projectId}/`;
    if (!location.root_relative.startsWith(expectedPrefix) || location.root_relative.includes('\\') ||
      location.root_relative.split('/').some(part => part === '' || part === '.' || part === '..')) {
      blockers.push({ reason: 'Uma localização gerenciada não corresponde à identidade do projeto.', recovery: 'Confira a localização registrada antes de tentar excluir o projeto.', advisory: true });
      continue;
    }
    targets.push({ key: `managed:${location.location_key}:${location.id}`, kind: 'exclusive_workspace',
      path: resolve(installationRoot, ...location.root_relative.split('/')), ownerKind: 'project', ownerId: projectId });
  }
  const transitions = db.prepare<[string], { operation_id: string; source_relative: string; destination_relative: string }>(
    `SELECT operation_id,source_relative,destination_relative FROM project_storage_transitions WHERE project_id=? ORDER BY created_at_ms,operation_id`).all(projectId);
  for (const transition of transitions) {
    for (const [label, relativePath] of [['source', transition.source_relative], ['destination', transition.destination_relative]] as const) {
      if (!relativePath.startsWith(`var/factory/projects/${projectId}/`) || relativePath.includes('\\') ||
          relativePath.split('/').some(part => part === '' || part === '.' || part === '..')) {
        blockers.push({ reason: 'Uma localização do diário de transição não pôde ser protegida.', recovery: 'Reconcilie a transição antes de tentar excluir este projeto.', advisory: true });
        continue;
      }
      if (knownStoragePaths.has(relativePath)) continue;
      knownStoragePaths.add(relativePath);
      targets.push({ key: `storage-transition:${transition.operation_id}:${label}`, kind: 'exclusive_workspace',
        path: resolve(installationRoot, ...relativePath.split('/')), ownerKind: 'project', ownerId: projectId });
    }
  }
  const attempts = db.prepare<[string], { id: string }>('SELECT id FROM attempts WHERE project_id=? ORDER BY id').all(projectId);
  const passages = db.prepare<[string], { id: string; attempt_id: string }>(
    'SELECT id,attempt_id FROM passages WHERE attempt_id IN (SELECT id FROM attempts WHERE project_id=?) ORDER BY id',
  ).all(projectId);
  const bootstrapRoot = resolve(dataDirectory, 'runtime', 'bootstrap');
  for (const passage of passages) {
    if (!Value.Check(OperationId, passage.id) || !Value.Check(OperationId, passage.attempt_id)) {
      blockers.push({ reason: 'Uma passagem não tem identidade segura para localizar seu bootstrap.', recovery: 'Reconcilie o registro da passagem antes de tentar excluir o projeto.', advisory: true });
      continue;
    }
    targets.push({ key: `bootstrap:${passage.id}`, kind: 'exclusive_workspace',
      path: resolve(dataDirectory, ...passageBootstrapDirectoryReference(passage.id).split('/')), ownerKind: 'attempt', ownerId: passage.attempt_id });
  }
  const otherPassages = db.prepare<[string], { id: string }>(`SELECT p.id FROM passages p JOIN attempts a ON a.id=p.attempt_id
    WHERE a.project_id<>? ORDER BY p.id`).all(projectId);
  const otherBootstraps: string[] = [];
  for (const passage of otherPassages) {
    if (!Value.Check(OperationId, passage.id)) {
      blockers.push({ reason: 'Uma passagem de outro projeto não pode ser protegida com segurança.', recovery: 'Reconcilie o inventário de passagens antes de tentar excluir este projeto.' });
      continue;
    }
    otherBootstraps.push(resolve(dataDirectory, ...passageBootstrapDirectoryReference(passage.id).split('/')));
  }
  const issueWorkspacePrefix = `projects/${projectId}/v1/managed/issues/`;
  const isManagedIssueWorkspace = (reference: string) => reference.startsWith(issueWorkspacePrefix) && reference.endsWith('/workspace') &&
    /^[1-9][0-9]*$/.test(reference.slice(issueWorkspacePrefix.length, -'/workspace'.length));
  for (const passage of passages) {
    const workspace = db.prepare<[string], { reference: string }>("SELECT reference FROM resources WHERE attempt_id=? AND kind='implementation'").get(passage.attempt_id);
    if (!workspace) {
      blockers.push({ reason: 'O recurso de implementação da passagem está ausente.', recovery: 'Confira o inventário de recursos da tentativa antes de excluir o projeto.', advisory: true });
    } else if (isManagedIssueWorkspace(workspace.reference)) {
      // Bootstrap directories are separate targets keyed by the passage identity above.
    } else blockers.push({ reason: 'Uma passagem não tem identidade válida.', recovery: 'Corrija o inventário antes de tentar excluir o projeto.', advisory: true });
  }
  const resources = db.prepare<[string], { id: string; owned: number; reference: string; attempt_id: string; kind: string; launch_state: string }>(
    'SELECT id,owned,reference,attempt_id,kind,launch_state FROM resources WHERE attempt_id IN (SELECT id FROM attempts WHERE project_id=?) ORDER BY id',
  ).all(projectId);
  const deliveryTargets = db.prepare<[string], { operation_id: string; attempt_id: string; local_path: string }>(`SELECT t.operation_id,t.attempt_id,t.local_path
    FROM delivery_targets t JOIN attempts a ON a.id=t.attempt_id WHERE a.project_id=? ORDER BY t.operation_id`).all(projectId);
  for (const target of deliveryTargets) {
    if (!Value.Check(OperationId,target.operation_id) || !Value.Check(OperationId,target.attempt_id) || !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(target.local_path)) {
      blockers.push({ reason: 'Um clone de entrega não tem identidade de caminho válida.', recovery: 'Confira o destino registrado antes de tentar excluir o projeto.', advisory: true });
      continue;
    }
    const original = project.source.kind === 'local' && resolve(project.source.location).toLowerCase() === resolve(target.local_path).toLowerCase();
    if (!original) targets.push({ key: `delivery-target:${target.operation_id}`,kind: 'exclusive_workspace',path: target.local_path,ownerKind: 'attempt',ownerId: target.attempt_id });
  }
  for (const resource of resources) {
    if (!resource.owned && resource.launch_state === 'planned') continue;
    if (!resource.owned || (resource.kind === 'implementation' && !isManagedIssueWorkspace(resource.reference))) {
      blockers.push({ reason: 'O pertencimento de um ambiente não pôde ser comprovado.',
        recovery: 'Confira os recursos registrados antes de tentar excluir este projeto.', advisory: true });
    }
  }
  // Protect current origins only; never turn historical revisions into targets.
  const otherOrigins = db.prepare<[string], { path: string }>(`SELECT r.source_location AS path FROM projects p
    JOIN project_revisions r ON r.id=p.current_revision_id AND r.project_id=p.id
    WHERE p.id<>? AND r.source_kind='local' ORDER BY p.id`).all(projectId);
  const creations = db.prepare<[], { id: string; project_id: string | null; destination: string }>(
    'SELECT id,project_id,destination FROM project_creations ORDER BY id',
  ).all();
  const otherStorageLocations = db.prepare<[string], { project_id: string; root_relative: string }>(`SELECT project_id,root_relative FROM project_storage_locations
    WHERE project_id<>? ORDER BY project_id,location_key,revision`).all(projectId);
  const validOtherStorageLocations = otherStorageLocations.filter(location => {
    const prefix = `var/factory/projects/${location.project_id}/`;
    const valid = location.root_relative.startsWith(prefix) && !location.root_relative.includes('\\') &&
      location.root_relative.split('/').every(part => part !== '' && part !== '.' && part !== '..');
    if (!valid) blockers.push({ reason: 'Uma localização de outro projeto não pôde ser protegida.', recovery: 'Confira as localizações gerenciadas antes de tentar excluir este projeto.' });
    return valid;
  });
  const selectedTargets = db.prepare<[string], { local_path: string }>(`SELECT t.local_path FROM publication_target_selections t
    JOIN attempts a ON a.id=t.attempt_id WHERE a.project_id<>? ORDER BY t.operation_id`).all(projectId);
  const otherDeliveryTargets = db.prepare<[string],{ local_path: string }>(`SELECT t.local_path FROM delivery_targets t JOIN attempts a ON a.id=t.attempt_id
    WHERE a.project_id<>? ORDER BY t.operation_id`).all(projectId);
  const protectedPaths = [...otherOrigins.map(o => o.path), ...selectedTargets.map(t => t.local_path), ...otherDeliveryTargets.map(t => t.local_path),
    ...creations.filter(c => c.project_id !== projectId || project.source.kind !== 'local' || c.destination !== project.source.location).map(c => c.destination),
    ...otherBootstraps,
    ...validOtherStorageLocations.map(location => resolve(installationRoot, ...location.root_relative.split('/'))),
    resolve(dataDirectory, 'factory.sqlite'), resolve(dataDirectory, 'controller-lock.sqlite')];
  const settings = readSettings(db);
  const schema = db.prepare<[], { version: number; checksum: string }>('SELECT version,checksum FROM schema_migrations ORDER BY version').all();
  // Data and install containers cannot themselves be removed.
  const containers = [resolve(dataDirectory), resolve(dataDirectory, '..'), resolve(dataDirectory, '../..'),
    resolve(dataDirectory, 'projects'), bootstrapRoot,
    ...(settings.projects_root ? [settings.projects_root] : [])];
  const inventoryVersion = digest({ version: 2, schema, project, keys: inventory.keys, storageLocations, otherStorageLocations,
    resources, passages, otherPassages, attempts, otherOrigins, selectedTargets, otherDeliveryTargets, deliveryTargets, creations,
    installation: settings.installation_id, account: settings.account_id, containers });
  const originalProtectedPaths = [resolve(dataDirectory), resolve(dataDirectory, '../..')];
  return { projectId, projectName: project.name, projectRevision: project.revision, sourceKind: project.source.kind,
    inventoryVersion, targets, protectedPaths, originalProtectedPaths, containers, blockers };
}
