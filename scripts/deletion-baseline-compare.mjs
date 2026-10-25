import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function compareDeletionBaseline(baseline, target, measured) {
  const checks = [];
  const require = (name, passed) => checks.push({ name, passed: passed === true });
  require('format', baseline.format_version === 1 && target.format_version === 1 && measured.format_version === 1);
  require('target_precedes_measurement', Date.parse(target.defined_at) < Date.parse(measured.captured_at));
  for (const key of ['platform','release','arch','node','cpu','cpu_count','ram_bytes','sqlite_journal','sqlite_synchronous','native_adapter']) {
    require(`environment.${key}`, baseline.environment[key] === measured.environment[key]);
  }
  require('two_layouts', measured.scenarios.length === 2 && new Set(measured.scenarios.map(s=>s.layout)).size === 2);
  const scenarios = target.targets.map(budget => {
    const before = baseline.scenarios.find(s=>s.layout === budget.layout);
    const after = measured.scenarios.find(s=>s.layout === budget.layout);
    require(`${budget.layout}.present`, Boolean(before && after));
    if (!before || !after) return { layout:budget.layout, state:'missing' };
    for (const key of ['attempts','rounds','passages','files_per_attempt','cache_mib_per_attempt','cache_bytes','targets','protected_sentinels']) {
      require(`${budget.layout}.conditions.${key}`, before.conditions[key] === after.conditions[key]);
    }
    require(`${budget.layout}.files`, before.conditions.volume.files === after.conditions.volume.files);
    const oracle = after.oracle;
    require(`${budget.layout}.correctness`, after.product_state === 'succeeded' && after.correctness_gate === 'passed' &&
      after.finalization_failure === null && oracle.authorized_targets_absent === after.conditions.targets &&
      oracle.protected_sentinels_unchanged === after.conditions.protected_sentinels && oracle.sibling_sql_unchanged &&
      oracle.no_selected_inventory && oracle.foreign_key_check_clean && oracle.minimal_receipts === 1);
    const stage = budget.primary.metric.split('.')[1];
    const stageMs = after.execution_stages[stage]?.total_ms;
    const accept = after.http_responses.find(r=>r.stage === 'accept');
    const totalMs = after.accepted_to_completion_ms === null || !accept ? null : after.accepted_to_completion_ms + accept.duration_ms;
    const uiMs = after.ui[budget.ui_feedback.metric];
    require(`${budget.layout}.primary`, Number.isFinite(stageMs) && stageMs > 0 && stageMs <= budget.primary.target_max_ms);
    require(`${budget.layout}.total`, Number.isFinite(totalMs) && totalMs > 0 && Number.isFinite(budget.total_server.target_max_ms) && totalMs <= budget.total_server.target_max_ms);
    require(`${budget.layout}.ui`, Number.isFinite(uiMs) && uiMs >= 0 && uiMs <= budget.ui_feedback.target_max_ms);
    return { layout:budget.layout, primary:{baseline_ms:budget.primary.baseline_ms,measured_ms:stageMs,target_ms:budget.primary.target_max_ms},
      total_server:{baseline_ms:budget.total_server.baseline_ms,measured_ms:totalMs,target_ms:budget.total_server.target_max_ms},
      ui_feedback:{baseline_ms:budget.ui_feedback.baseline_ms,measured_ms:uiMs,target_ms:budget.ui_feedback.target_max_ms},
      acceptance_dom_ms:after.ui.click_to_accepted_dom_ms,
      fixture_volume_bytes:{baseline:before.conditions.volume.bytes,measured:after.conditions.volume.bytes},
      native_observation_calls:{baseline:before.execution_stages[stage].calls,measured:after.execution_stages[stage].calls} };
  });
  return {format_version:1,state:checks.every(c=>c.passed)?'passed':'pending',checks,scenarios,
    limits:'One run per layout; host load uncontrolled, no statistical significance. Database metadata bytes can differ; file count and dense cache bytes must match. Inclusive stages overlap. UI feedback and acceptance are separate from completed server time.'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [baselineFile,targetFile,measuredFile,outputFile]=process.argv.slice(2);
  if(!outputFile) throw new Error('Provide baseline.json target.json measured.json output.json.');
  const [baseline,target,measured]=await Promise.all([baselineFile,targetFile,measuredFile].map(async path=>JSON.parse(await readFile(path,'utf8'))));
  const result=compareDeletionBaseline(baseline,target,measured);
  await writeFile(outputFile,JSON.stringify({...result,baseline_file:resolve(baselineFile),target_file:resolve(targetFile),measured_file:resolve(measuredFile)},null,2),{flag:'wx'});
  process.stdout.write(JSON.stringify(result)+'\n');
  if(result.state!=='passed') process.exitCode=1;
}
