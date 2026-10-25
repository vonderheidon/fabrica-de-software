import { mkdir, mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { defineDeletionTarget } from '../../scripts/deletion-baseline-target.mjs';
import { afterEach, expect, it } from 'vitest';

const roots:string[]=[];
afterEach(async()=>{for(const path of roots.splice(0)){if(!path.startsWith(resolve('.cache')+sep+'baseline-target-test-'))throw new Error('UNSAFE_TEST_CLEANUP');await rm(path,{recursive:true,force:true});}});
function scenario(layout:string) {
  return {layout,conditions:{targets:4},oracle:{authorized_targets_absent:4,sibling_sql_unchanged:true,no_selected_inventory:true,foreign_key_check_clean:true,minimal_receipts:1},
    execution_stages:{native_observe_many:{total_ms:20,calls:4,min_ms:3},sql_finalize:{total_ms:1,calls:1,min_ms:1}},
    http_responses:[{stage:'accept',duration_ms:4}],accepted_to_completion_ms:60,
    ui:{click_to_submitting_raf_ms:6,raf_p95_ms:17,click_to_accepted_dom_ms:5}};
}
async function fixture(complete=true) {
  await mkdir(resolve('.cache'),{recursive:true});
  const root=await mkdtemp(resolve('.cache','baseline-target-test-'));roots.push(root);
  const file=join(root,'baseline.json');await writeFile(file,JSON.stringify({format_version:1,captured_at:'2026-10-24T00:00:00Z',scenarios:complete?[scenario('legacy'),scenario('managed')]:[scenario('legacy')]}));
  return {file,target:join(root,'target.json'),run:async()=>{try{await defineDeletionTarget(file);return {status:0};}catch{return {status:1};}}};
}
it('refuses a target before both baseline scenarios and independent oracles complete',async()=>{
  const f=await fixture(false);expect((await f.run()).status).not.toBe(0);await expect(access(f.target)).rejects.toThrow();
});
it('derives stage, total-server and UI budgets from measured values and preserves the pending gate',async()=>{
  const f=await fixture();expect((await f.run()).status).toBe(0);
  const result=JSON.parse(await readFile(f.target,'utf8'));
  expect(result.rf_73).toBe('pending_implementation_and_comparison');
  expect(result.targets[0]).toMatchObject({primary:{target_max_ms:12},total_server:{baseline_ms:64,target_max_ms:56},ui_feedback:{target_max_ms:23}});
  const saved=await readFile(f.target,'utf8');expect((await f.run()).status).not.toBe(0);expect(await readFile(f.target,'utf8')).toBe(saved);
});
it('rejects a successful duration when the independent physical-removal oracle fails',async()=>{
  const f=await fixture();const data=JSON.parse(await readFile(f.file,'utf8'));data.scenarios[1].oracle.authorized_targets_absent=3;await writeFile(f.file,JSON.stringify(data));
  expect((await f.run()).status).not.toBe(0);await expect(access(f.target)).rejects.toThrow();
});
