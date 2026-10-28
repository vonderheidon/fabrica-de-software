import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { expect, it } from 'vitest';
import { attemptFixture } from '../fixtures/attempt.js';
import { projectDeletionHistory } from '../fixtures/project-deletion-history.js';
import { createProjectStorageInspector, projectStorageRootRelative } from '../../apps/controller/src/modules/workspaces/project-storage.js';
import { randomUUID } from 'node:crypto';
import { deletionTables } from '../../apps/controller/src/modules/storage/project-deletion-inventory.js';
import { createProjectDeletionPersistence } from '../../apps/controller/src/modules/storage/project-deletions.js';

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
