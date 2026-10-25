import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, lstat, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep, basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { cpus, release, freemem, totalmem } from 'node:os';
import { expect, it } from 'vitest';
import type { Storage } from '../../apps/controller/src/modules/storage/index.js';
import { createDeletionInspector, windowsReferenceDeletionPlatform } from '../../apps/controller/src/modules/workspaces/deletion.js';
import { createProjectStorageInspector, projectStorageRootRelative } from '../../apps/controller/src/modules/workspaces/project-storage.js';
import { createDeletionCoordinator } from '../../apps/controller/src/modules/projects/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { installAssets } from '../../apps/controller/src/http/assets.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { deletionTables, identifier, primaryKey, projectDeletionInventory, type ProjectDeletionInventory } from '../../apps/controller/src/modules/storage/project-deletion-inventory.js';
import { attemptFixture } from '../fixtures/attempt.js';
import { projectDeletionHistory } from '../fixtures/project-deletion-history.js';

const evidenceRoot = resolve('.cache/deletion-baseline');
const marker = 'SYNTHETIC_DELETION_BASELINE_CACHE';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function inside(root: string, path: string) {
  const rest = relative(root,resolve(path));
  if (!rest || isAbsolute(rest) || rest === '..' || rest.startsWith('..'+sep)) throw new Error('BASELINE_PATH_OUTSIDE_FIXTURE');
}
async function absent(path: string) {
  try { await lstat(path); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
}
function stats(values: number[]) {
  const ordered = [...values].sort((a,b)=>a-b);
  return { calls:values.length,total_ms:values.reduce((a,b)=>a+b,0),min_ms:ordered[0] ?? 0,
    median_ms:ordered.length ? ordered[Math.floor(ordered.length/2)]! : 0,p95_ms:ordered[Math.ceil(ordered.length*.95)-1] ?? 0,max_ms:ordered.at(-1) ?? 0 };
}
function protectedRows(db: Parameters<typeof projectDeletionInventory>[0], inventory: ProjectDeletionInventory) {
  return digest(deletionTables.map(table => {
    const keys = new Set(inventory.keys[table]), pk = primaryKey(db,table);
    const rows = db.prepare(`SELECT * FROM ${identifier(table)} ORDER BY rowid`).all() as Record<string,unknown>[];
    return [table,rows.filter(row=>keys.has(JSON.stringify(pk.map(column=>row[column]))))];
  }));
}
async function treeVolume(root: string): Promise<{ files:number; bytes:number }> {
  let files=0,bytes=0;
  for(const entry of await readdir(root,{withFileTypes:true})) {
    const path=join(root,entry.name);
    if(entry.isSymbolicLink()) continue;
    if(entry.isDirectory()) {const nested=await treeVolume(path);files+=nested.files;bytes+=nested.bytes;}
    else {files++;bytes+=(await lstat(path)).size;}
  }
  return {files,bytes};
}

it.skipIf(process.platform !== 'win32')('records unoptimized Windows deletion stages and an independent removal oracle',async () => {
  const attempts=Number(process.env.DELETION_BASELINE_ATTEMPTS ?? 8);
  const filesPerAttempt=Number(process.env.DELETION_BASELINE_FILES ?? 256);
  const cacheMiB=Number(process.env.DELETION_BASELINE_CACHE_MIB ?? 64);
  if(!Number.isInteger(attempts)||attempts<2||attempts>100||!Number.isInteger(filesPerAttempt)||filesPerAttempt<1||filesPerAttempt>10000||!Number.isInteger(cacheMiB)||cacheMiB<1||cacheMiB>256) throw new Error('BASELINE_VOLUME_INVALID');
  await mkdir(join(evidenceRoot,'fixtures'),{recursive:true});
  const root=await mkdtemp(join(evidenceRoot,'fixtures','run-'));
  const output=join(evidenceRoot,'evidence',basename(root));await mkdir(output,{recursive:true});
  const scenarios: unknown[]=[];
  const priorScenario = process.env.DELETION_BASELINE_PRIOR_SCENARIO;
  if(priorScenario) {
    const prior=JSON.parse(await readFile(resolve(priorScenario),'utf8'));
    if(prior.layout!=='legacy'||prior.conditions.attempts!==attempts||prior.conditions.files_per_attempt!==filesPerAttempt||prior.conditions.cache_mib_per_attempt!==cacheMiB||
      prior.oracle.authorized_targets_absent!==prior.conditions.targets||!prior.oracle.sibling_sql_unchanged||!prior.oracle.no_selected_inventory||!prior.oracle.foreign_key_check_clean) throw new Error('BASELINE_PRIOR_SCENARIO_INVALID');
    scenarios.push({...prior,prior_scenario_file:resolve(priorScenario)});
  }
  const environment={platform:process.platform,release:release(),arch:process.arch,node:process.version,cpu:cpus()[0]?.model,cpu_count:cpus().length,
    ram_bytes:totalmem(),free_ram_before_bytes:freemem(),sqlite_journal:'wal',sqlite_synchronous:'FULL',execution:'serial, current host load uncontrolled, no cache flush, dense synthetic cache files',native_adapter:'production PowerShell/Win32 handle-relative adapter, no substitution'};
  await writeFile(join(output,'environment.json'),JSON.stringify(environment,null,2));
  for(const layout of ['legacy','managed'] as const) {
    if(priorScenario&&layout==='legacy') continue;
    const scenarioRoot=join(root,layout);await mkdir(join(scenarioRoot,'var'),{recursive:true});
    const f=await attemptFixture(join(scenarioRoot,'var'),'a'.repeat(40),'high',layout==='managed'?'factory':undefined);const data=resolve(f.directory);
    const measurements: Record<string,number[]>={};
    let finalizationFailure: { name:string;message:string } | null = null;
    let active=false;
    function timed<T>(name: string,task:()=>T): T {const start=performance.now();try{return task();}finally{if(active)(measurements[name]??=[]).push(performance.now()-start);}}
    async function timedAsync<T>(name:string,task:()=>Promise<T>) {const start=performance.now();try{return await task();}finally{if(active)(measurements[name]??=[]).push(performance.now()-start);}}
    const history=projectDeletionHistory(f.db,()=>{},false,false,data,layout==='managed');
    for(let i=1;i<attempts;i++) history.addAttempt(history.selected.projectId);
    const selected=history.selected.projectId,other=history.other.projectId;
    f.db.prepare('UPDATE factory_settings SET onboarding_suppressed=1').run();
    const selectedAttempts=f.db.prepare<[string],{id:string}>('SELECT id FROM attempts WHERE project_id=? ORDER BY id').all(selected);
    const otherSentinel=join(data,'work',history.other.attemptId,'preserve.txt');await mkdir(resolve(otherSentinel,'..'),{recursive:true});await writeFile(otherSentinel,'protected sibling fixture');
    const protectedSentinels=[otherSentinel];
    if(layout==='managed') {
      const managed=resolve(scenarioRoot,...projectStorageRootRelative(selected,'managed').split('/'));
      await mkdir(managed,{recursive:true});
      f.storage.recordProjectStorageLocation(await createProjectStorageInspector(data).inspectProjectStorageRoot(selected,'managed'));
    }
    const input=f.storage.getProjectDeletionPaths(selected);expect(input.blockers).toEqual([]);
    for(const target of input.targets) inside(root,target.path);
    for(const container of input.containers) if(resolve(container).startsWith(root+sep)) await mkdir(container,{recursive:true});
    for(const target of input.targets) {
      if(layout==='managed'&&!target.key.startsWith('managed:')) continue;
      await mkdir(target.path,{recursive:true});await writeFile(join(target.path,'owned.bin'),'synthetic owned data');
    }
    for(const creation of f.db.prepare<[],{destination:string}>('SELECT destination FROM project_creations').all()) {
      inside(root,creation.destination);await mkdir(creation.destination,{recursive:true});const sentinel=join(creation.destination,'protected.txt');await writeFile(sentinel,'protected historical destination');protectedSentinels.push(sentinel);
    }
    for(const attempt of selectedAttempts) {
      const implementation=layout==='legacy'?join(data,'work',attempt.id,'implementation'):resolve(scenarioRoot,...projectStorageRootRelative(selected,'managed').split('/'),'work',attempt.id,'implementation');
      await mkdir(join(implementation,'node_modules','.cache'),{recursive:true});await mkdir(join(implementation,'.git'),{recursive:true});
      await writeFile(join(implementation,'.gitignore'),'/node_modules/\n');await writeFile(join(implementation,'.git','fixture'),'synthetic git metadata');
      for(let i=0;i<filesPerAttempt;i++) await writeFile(join(implementation,'node_modules','.cache',`entry-${i}.bin`),'synthetic cache entry');
      const cache=await open(join(implementation,'node_modules','.cache','dense.bin'),'w');
      try {const chunk=Buffer.alloc(1_048_576,marker);for(let i=0;i<cacheMiB;i++) await cache.writeFile(chunk);await cache.sync();} finally{await cache.close();}
    }
    const volume=await treeVolume(scenarioRoot);
    const protectedHashes=await Promise.all(protectedSentinels.map(async path=>digest(await readFile(path))));
    const otherInventory=f.storage.getProjectDeletionInventory(other),otherHash=protectedRows(f.db,otherInventory);
    const beforeInventory=f.storage.getProjectDeletionInventory(selected);
    const beforeCounts=Object.fromEntries(deletionTables.map(table=>[table,beforeInventory.keys[table].length]));
    const inventorySamples:number[]=[],pathSamples:number[]=[];
    for(let i=0;i<10;i++){let start=performance.now();f.storage.getProjectDeletionInventory(selected);inventorySamples.push(performance.now()-start);start=performance.now();f.storage.getProjectDeletionPaths(selected);pathSamples.push(performance.now()-start);}
    const platform=windowsReferenceDeletionPlatform();
    const inspector=createDeletionInspector({...platform,
      observe:path=>timedAsync('native_observe_single',()=>platform.observe(path)),
      observeMany:paths=>timedAsync('native_observe_many',()=>platform.observeMany!(paths)),
      removeReference:expected=>timedAsync('native_remove_reference',()=>platform.removeReference!(expected)),
    });
    const storage={...f.storage,getProjectDeletionPaths:(id:string)=>timed('sql_paths_inventory',()=>f.storage.getProjectDeletionPaths(id)),
      finalizeProjectDeletion:(command:Parameters<Storage['finalizeProjectDeletion']>[0])=>timed('sql_finalize',()=>{
        try{return f.storage.finalizeProjectDeletion(command);}catch(error){finalizationFailure={name:error instanceof Error?error.name:'Error',message:error instanceof Error?error.message:'Unknown finalization failure'};throw error;}
      }),
      deletionWorker:Object.fromEntries(Object.entries(f.storage.deletionWorker).map(([name,fn])=>[name,(...args:unknown[])=>timed(`sql_worker_${name}`,()=>Reflect.apply(fn,f.storage.deletionWorker,args))])) as Storage['deletionWorker']};
    const workspaces={...inspector,
      inspectProjectDeletion:(value:Parameters<typeof inspector.inspectProjectDeletion>[0])=>timedAsync('inspection_inclusive',()=>inspector.inspectProjectDeletion(value)),
      reconcileProjectDeletion:(...args:Parameters<typeof inspector.reconcileProjectDeletion>)=>timedAsync('coordinator_reconformance_inclusive',()=>inspector.reconcileProjectDeletion(...args)),
      removeProjectDeletion:(...args:Parameters<typeof inspector.removeProjectDeletion>)=>timedAsync('removal_orchestration_inclusive',()=>inspector.removeProjectDeletion(...args))};
    const coordinator=createDeletionCoordinator({storage,workspaces,logFailure:f.logFailure});
    const config=loadConfiguration({FACTORY_DATA_DIR:data,FACTORY_PORT:'4310',FACTORY_LOG_LEVEL:'silent'},process.cwd());
    const app=createApp(config,storage,undefined,{github:{...createGitHub(),...f.github},workspaces:f.workspaces},{github:f.github,workspaces:f.workspaces},f.pipeline,undefined,undefined,{workspaces,coordinator});
    installAssets(app,resolve('dist/web'));
    let acceptedAt=0,completedAt=0;
    const responses: {method:string;stage:string;duration_ms:number}[]=[];
    const starts=new WeakMap<object,number>();
    app.addHook('onRequest',async request=>{starts.set(request,performance.now());});
    app.addHook('onResponse',async(request,reply)=>{
      const stage=request.url.includes('/deletion-preview')?'preview':request.method==='POST'&&request.url.endsWith('/deletion')?'accept':request.url.includes('/project-deletions/')?'poll':null;
      if(stage){responses.push({method:request.method,stage,duration_ms:performance.now()-(starts.get(request)??performance.now())});if(stage==='accept'&&reply.statusCode===202)acceptedAt=performance.now();}
    });
    await app.listen({host:'127.0.0.1',port:4310});
    const readyAt=Date.now();active=true;
    await writeFile(join(evidenceRoot,'current.json'),JSON.stringify({phase:'ready',layout,origin:config.browserOrigin,project_id:selected,output,ui_response_file:join(output,`${layout}-ui.json`),attempts,files:volume.files,bytes:volume.bytes,targets:input.targets.length,ready_at:readyAt}));
    console.log(JSON.stringify({baseline:layout,phase:'ready',attempts,targets:input.targets.length,files:volume.files,bytes:volume.bytes}));
    const uiFile=join(output,`${layout}-ui.json`);
    try {
      const deadline=Date.now()+180_000;
      while(await absent(uiFile)){if(Date.now()>deadline)throw new Error('BASELINE_UI_DRIVER_REQUIRED');await new Promise(done=>setTimeout(done,100));}
      const ui=JSON.parse(await readFile(uiFile,'utf8')) as {operation_id:string};
      expect(ui.operation_id).toMatch(/^[0-9a-f-]{36}$/i);
      await coordinator.drain();completedAt=performance.now();active=false;
      const finalStatus=storage.getProjectDeletion(ui.operation_id);
      expect(acceptedAt).toBeGreaterThan(0);
      const absence=await Promise.all(input.targets.map(target=>absent(target.path)));expect(absence.every(Boolean)).toBe(true);
      expect(await Promise.all(protectedSentinels.map(async path=>digest(await readFile(path))))).toEqual(protectedHashes);
      expect(protectedRows(f.db,otherInventory)).toBe(otherHash);
      const residual=projectDeletionInventory(f.db,selected),noInventory=deletionTables.every(table=>residual.keys[table].length===0);
      const foreignKeyClean=(f.db.pragma('foreign_key_check') as unknown[]).length===0;expect(foreignKeyClean).toBe(true);
      const receipt=f.db.prepare<[string],{n:number}>('SELECT count(*) AS n FROM project_deletion_receipts WHERE operation_id=?').get(ui.operation_id)!.n;
      const succeeded=finalStatus?.state==='succeeded';
      const scenario={layout,product_state:finalStatus?.state,correctness_gate:succeeded&&noInventory&&receipt===1?'passed':'failed',finalization_failure:finalizationFailure,
        conditions:{attempts,rounds:attempts*3,passages:attempts*5,files_per_attempt:filesPerAttempt,cache_mib_per_attempt:cacheMiB,cache_bytes:attempts*cacheMiB*1_048_576,volume,targets:input.targets.length,protected_sentinels:protectedSentinels.length},before_counts:beforeCounts,
        probes:{inventory:stats(inventorySamples),paths_inventory:stats(pathSamples)},execution_stages:Object.fromEntries(Object.entries(measurements).map(([name,values])=>[name,stats(values)])),
        stage_semantics:'Inclusive spans overlap; do not sum inspection/orchestration with native/SQL spans. HTTP/paint are separate from total deletion.',
        http_responses:responses,accepted_to_completion_ms:succeeded?completedAt-acceptedAt:null,accepted_to_worker_stop_ms:completedAt-acceptedAt,ui,
        oracle:{authorized_targets_absent:absence.length,protected_sentinels_unchanged:protectedSentinels.length,sibling_sql_unchanged:true,no_selected_inventory:noInventory,foreign_key_check_clean:foreignKeyClean,minimal_receipts:receipt},observed_at:new Date().toISOString()};
      scenarios.push(scenario);await writeFile(join(output,`${layout}-baseline.json`),JSON.stringify(scenario,null,2));
      console.log(JSON.stringify({baseline:layout,phase:'measurement_completed',product_state:finalStatus?.state,correctness_gate:scenario.correctness_gate,accepted_to_completion_ms:scenario.accepted_to_completion_ms,finalization_failure:finalizationFailure,stages:scenario.execution_stages}));
      if(succeeded){expect(noInventory).toBe(true);expect(receipt).toBe(1);expect(f.logFailure.mock.calls).toEqual([]);}
      else{expect(finalizationFailure).not.toBeNull();expect(receipt).toBe(0);}
    } finally {
      await coordinator.close();await app.close();await f.close();
    }
  }
  const report={format_version:1,captured_at:new Date().toISOString(),environment,scenarios,scope:'Baseline only. No optimization or RF-73 completion claim. UI measurements retain their own clock and observation limits.'};
  await writeFile(join(output,'baseline.json'),JSON.stringify(report,null,2));
  await writeFile(join(evidenceRoot,'current.json'),JSON.stringify({phase:'measurement_completed',output}));
  inside(join(evidenceRoot,'fixtures'),root);await rm(root,{recursive:true,force:true});
});
