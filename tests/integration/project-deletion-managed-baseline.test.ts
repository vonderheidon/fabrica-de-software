import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { expect, it } from 'vitest';
import { attemptFixture } from '../fixtures/attempt.js';
import { projectDeletionHistory } from '../fixtures/project-deletion-history.js';
import { createProjectStorageInspector, projectStorageRootRelative } from '../../apps/controller/src/modules/workspaces/project-storage.js';
import { randomUUID } from 'node:crypto';
import { deletionTables } from '../../apps/controller/src/modules/storage/project-deletion-inventory.js';
import { createProjectDeletionPersistence } from '../../apps/controller/src/modules/storage/project-deletions.js';
import Database from 'better-sqlite3';
import { applyMigrations, loadMigrations } from '../../apps/controller/src/modules/storage/migrations.js';
import { seedSettings } from '../../apps/controller/src/modules/storage/settings.js';

it('finalizes an authorized managed project and emits its minimal receipt',async()=>{
  await mkdir(resolve('.cache'),{recursive:true});const root=await mkdtemp(resolve('.cache','baseline-sql-test-'));
  await mkdir(join(root,'var'));const f=await attemptFixture(join(root,'var'),'a'.repeat(40),'high','factory');
  try {
    const history=projectDeletionHistory(f.db);
    await mkdir(resolve(root,...projectStorageRootRelative(history.selected.projectId,'managed').split('/')),{recursive:true});
    const location=f.storage.recordProjectStorageLocation(await createProjectStorageInspector(f.directory).inspectProjectStorageRoot(history.selected.projectId,'managed'));
    const row=f.db.prepare('SELECT * FROM project_storage_locations WHERE id=?').get(location.id) as Record<string,string>;
    const transition=history.operation('project',history.selected.projectId,'project.storage.transition');
    history.insert('project_storage_transitions',{operation_id:transition,project_id:history.selected.projectId,location_key:'managed',
      source_location_id:location.id,source_relative:row.root_relative!,destination_relative:row.root_relative!.replace('/v1/','/v2/'),
      source_identity_json:row.object_identity_json!,destination_identity_json:row.object_identity_json!,plan_hash:'a'.repeat(64),
      state:'verified',step:'publishing_location',generation:1,revision:1,created_at_ms:0,updated_at_ms:0});
    const terminals=f.db.prepare('SELECT * FROM managed_terminals ORDER BY id').all();
    const other=f.storage.getProjectDeletionInventory(history.other.projectId);
    createProjectDeletionPersistence(f.db);
    for(const table of ['project_storage_locations','project_storage_transitions']) {
      expect(()=>f.db.prepare(`DELETE FROM ${table}`).run()).toThrow('PROJECT_DELETION_AUTHORIZATION_REQUIRED');
    }
    for(const command of [{...history.command,workerGeneration:history.command.workerGeneration+1},
      {...history.command,workerToken:randomUUID()}]) expect(()=>f.storage.finalizeProjectDeletion(command)).toThrow();
    expect(()=>f.storage.finalizeProjectDeletion(history.command)).not.toThrow();
    expect(f.storage.getProjectDeletion(history.command.operationId)?.state).toBe('succeeded');
    expect(f.storage.getProjectDeletionInventory(history.selected.projectId).keys).toEqual(Object.fromEntries(deletionTables.map(table=>[table,[]])));
    expect(f.storage.getProjectDeletionInventory(history.other.projectId)).toEqual(other);
    expect(f.db.prepare('SELECT * FROM managed_terminals ORDER BY id').all()).toEqual(terminals);
    expect(f.db.prepare('SELECT * FROM project_deletion_receipts WHERE operation_id=?').all(history.command.operationId)).toHaveLength(1);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  } finally {
    await f.close();if(!root.startsWith(resolve('.cache')+sep+'baseline-sql-test-'))throw new Error('UNSAFE_TEST_CLEANUP');await rm(root,{recursive:true,force:true});
  }
});

it('upgrades schema 43 without rewriting history and repairs its managed deletion guards',()=>{
  const db=new Database(':memory:');db.pragma('foreign_keys=ON');
  try {
    const migrations=loadMigrations();applyMigrations(db,migrations.slice(0,43),()=>seedSettings(db));
    const history=projectDeletionHistory(db);
    history.insert('project_storage_locations',{id:randomUUID(),project_id:history.selected.projectId,location_key:'managed',layout_version:1,
      root_relative:projectStorageRootRelative(history.selected.projectId,'managed'),
      object_identity_json:JSON.stringify({format_version:1,volume_id:'fixture',object_id:'fixture',ancestors:[{path:'fixture',identity:'fixture',resolvedPath:'fixture'}]}),
      is_current:1,revision:1,created_at_ms:0,verified_at_ms:0});
    const tables=db.prepare<[],{name:string}>("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'").all();
    const snapshot=()=>tables.map(({name})=>[name,db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map(row=>{
      if(name==='project_revisions') { const {delivery_branch_json:_branch,...legacy}=row as Record<string,unknown>; return legacy; }
      if(name!=='attempts')return row;
      const {issue_number:_number,issue_title:_title,...legacyColumns}=row as Record<string,unknown>;
      return legacyColumns;
    })]);
    const before=snapshot(),ledger=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const persistence=createProjectDeletionPersistence(db);
    expect(()=>persistence.finalize(history.command)).toThrow();
    expect(snapshot()).toEqual(before);
    applyMigrations(db,migrations,()=>{throw new Error('UNEXPECTED_RESEED');});
    expect(snapshot()).toEqual(before);
    expect(db.prepare('SELECT count(*) AS n FROM attempts WHERE issue_number IS NOT NULL OR issue_title IS NOT NULL').get()).toEqual({n:0});
    expect(db.prepare('SELECT * FROM schema_migrations WHERE version<=43 ORDER BY version').all()).toEqual(ledger);
    expect(db.pragma('user_version',{simple:true})).toBe(50);
    expect(persistence.finalize(history.command)).toEqual({operation_id:history.command.operationId,state:'succeeded'});
    expect(db.pragma('foreign_key_check')).toEqual([]);
  } finally {db.close();}
});
