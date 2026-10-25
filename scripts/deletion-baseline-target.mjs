import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function defineDeletionTarget(input) {
if (!input) throw new Error('Provide the completed baseline.json path.');
const baselinePath = resolve(input);
const baseline = JSON.parse(await readFile(baselinePath,'utf8'));
if (baseline.format_version !== 1 || baseline.scenarios?.length !== 2 || !baseline.scenarios.every(s =>
  s.oracle?.authorized_targets_absent === s.conditions.targets && s.oracle.sibling_sql_unchanged && s.oracle.foreign_key_check_clean &&
  (s.oracle.no_selected_inventory && s.oracle.minimal_receipts === 1 || s.product_state === 'pending' && s.finalization_failure && s.oracle.minimal_receipts === 0))) {
  throw new Error('Both measured scenarios and independent physical/sibling oracles are required; a finalization failure must be explicit.');
}
const targets = baseline.scenarios.map(s => {
  const spans = Object.entries(s.execution_stages).filter(([name]) => name.startsWith('native_') || name.startsWith('sql_'));
  const [dominant, cost] = spans.sort((a,b)=>b[1].total_ms-a[1].total_ms)[0];
  if (!cost.calls || cost.min_ms <= 0) throw new Error('The dominant stage has no measured lower envelope.');
  const accept = s.http_responses.find(r=>r.stage === 'accept');
  const completed = s.accepted_to_completion_ms !== null;
  const stop = s.accepted_to_completion_ms ?? s.accepted_to_worker_stop_ms;
  if (!accept || stop <= 0) throw new Error('The server observation interval was not measured.');
  const total = stop + accept.duration_ms;
  // The target comes from this run's lower per-call envelope, never an invented percentage.
  const envelope = cost.calls * cost.min_ms;
  const recoverable = cost.total_ms - envelope;
  if (recoverable <= 0) throw new Error('No observed excess above the lower envelope; another baseline is needed.');
  return { layout:s.layout,conditions:s.conditions,
    primary:{metric:`execution_stages.${dominant}.total_ms`,baseline_ms:cost.total_ms,baseline_calls:cost.calls,
      observed_min_per_call_ms:cost.min_ms,target_max_ms:envelope,
      rationale:'Reduce the dominant measured cost to the aggregate of its already observed lower per-call envelope. This does not prescribe fewer safety checks, root deletion, caching or any particular implementation.'},
    total_server:{baseline_ms:completed?total:null,target_max_ms:completed?total-recoverable:null,
      request_to_worker_stop_ms:total,
      formula:completed?'accepted_to_completion_ms + HTTP accept duration; adjacent intervals on the same server monotonic clock. The target removes only the measured excess of the dominant stage.'
        :'No completed-deletion duration exists: this interval ends in pending. Fix correctness and capture a successful baseline before setting/comparing the total-completion target.'},
    ui_feedback:{metric:'click_to_submitting_raf_ms',baseline_ms:s.ui.click_to_submitting_raf_ms,
      target_max_ms:s.ui.click_to_submitting_raf_ms+s.ui.raf_p95_ms,
      rationale:'Allow at most one additional observed display frame for immediate feedback. rAF is a rendering opportunity, not an exact paint timestamp.'},
    acceptance:{baseline_ms:s.ui.click_to_accepted_dom_ms,report_separately:true},
    baseline_correctness:s.correctness_gate ?? 'passed',baseline_finalization_failure:s.finalization_failure ?? null,
    correctness:'All authorized targets absent, protected sentinels and sibling SQL unchanged, no owned inventory, clean foreign keys, exactly one minimal receipt. Any failure invalidates performance acceptance.' };
});
const result = {format_version:1,defined_at:new Date().toISOString(),baseline_captured_at:baseline.captured_at,baseline_file:baselinePath,
  state:targets.some(t=>t.baseline_correctness==='failed')?'targets_defined_with_correctness_blocker':'target_defined_before_optimization',rf_73:'pending_implementation_and_comparison',targets,
  reexecution:{command:'npm.cmd run proof:deletion-baseline',ui_driver:'tests/browser/deletion-baseline.playwright.js',
    steps:['Run the command on an unused port 4310.','Read .cache/deletion-baseline/current.json for each ready scenario.','Open its origin with #principal/projetos?dialog=project-configuration&projectId=<project_id>&baselineLayout=<layout>.','Run the UI driver with Playwright MCP. It confirms deletion only of paths under this benchmark fixture.','Save the returned JSON at ui_response_file, then wait for coordinator completion and repeat for the next layout.','Compare every primary, total-server and UI-feedback metric to this fixed target while independently checking the oracles.'],
    conditions:'Same selected-attempt count, rounds, files, dense cache bytes, layouts, Windows adapter, SQLite settings and host. Serial scenarios, normal host load documented, no cache-flush claim. Record changed conditions instead of treating them as equivalent.',
    repeatability:'This baseline has one full removal per layout. Per-call distributions and per-frame distributions are not population distributions of total deletion. Repetitions improve confidence; no statistical significance is claimed.'},
  guardrail:'Do not revise an established target after seeing optimized results. Fix any baseline correctness blocker before optimizing; capture the missing completed-total baseline at that point. A failed target remains pending; measuring alone does not complete RF-73.'};
const path=resolve(dirname(baselinePath),'target.json');
await writeFile(path,JSON.stringify(result,null,2),{flag:'wx'});
return {target:path,targets:targets.map(t=>({layout:t.layout,stage:t.primary.metric,baseline_ms:t.primary.baseline_ms,target_ms:t.primary.target_max_ms,total_baseline_ms:t.total_server.baseline_ms,total_target_ms:t.total_server.target_max_ms}))};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(JSON.stringify(await defineDeletionTarget(process.argv[2]))+'\n');
}
