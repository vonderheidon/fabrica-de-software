import { expect, it } from 'vitest';
import { compareDeletionBaseline } from '../../scripts/deletion-baseline-compare.mjs';

function fixture() {
  const scenarios=['legacy','managed'].map(layout=>({layout,product_state:'succeeded',correctness_gate:'passed',finalization_failure:null,
    conditions:{attempts:8,rounds:24,passages:40,files_per_attempt:256,cache_mib_per_attempt:64,cache_bytes:536870912,targets:25,protected_sentinels:10,volume:{files:2086,bytes:542398669}},
    oracle:{authorized_targets_absent:25,protected_sentinels_unchanged:10,sibling_sql_unchanged:true,no_selected_inventory:true,foreign_key_check_clean:true,minimal_receipts:1},
    execution_stages:{native_observe_many:{total_ms:40,calls:114}},http_responses:[{stage:'accept',duration_ms:2}],accepted_to_completion_ms:60,
    ui:{click_to_submitting_raf_ms:5,click_to_accepted_dom_ms:10}}));
  const baseline={format_version:1,environment:{platform:'win32'},scenarios};
  const measured={...structuredClone(baseline),captured_at:'2026-10-24T12:00:00Z'};
  const target={format_version:1,defined_at:'2026-10-24T11:00:00Z',targets:scenarios.map(s=>({layout:s.layout,
    primary:{metric:'execution_stages.native_observe_many.total_ms',baseline_ms:100,target_max_ms:50},total_server:{baseline_ms:120,target_max_ms:80},
    ui_feedback:{metric:'click_to_submitting_raf_ms',baseline_ms:6,target_max_ms:20}}))};
  return {baseline,measured,target,run:()=>compareDeletionBaseline(baseline,target,measured)};
}
it('compares complete time, native stage and UI separately against the prior target',()=>{
  const f=fixture();expect(f.run().state).toBe('passed');
  f.measured.scenarios[0]!.execution_stages.native_observe_many.total_ms=51;
  expect(f.run().state).toBe('pending');
});
it('rejects apparent speed with missing sentinels, incomplete SQL or changed cache volume',()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.measured.scenarios[0]!.oracle.protected_sentinels_unchanged=9;},
    (f:ReturnType<typeof fixture>)=>{f.measured.scenarios[0]!.oracle.no_selected_inventory=false;},
    (f:ReturnType<typeof fixture>)=>{f.measured.scenarios[0]!.conditions.cache_bytes=1;},
    (f:ReturnType<typeof fixture>)=>{f.measured.captured_at='2026-10-24T10:00:00Z';},
  ]) {const f=fixture();mutate(f);expect(f.run().state).toBe('pending');}
});
