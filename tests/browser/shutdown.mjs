import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, '.playwright-mcp/shutdown-immediate');
await mkdir(output, { recursive: true });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const aid = id(1), pid = id(2), epoch = Date.now();
let mode = 'implementing', allowStream = true, sequence = 1;
const streams = new Set(), errors = [], shutdownRequests = [];
const pageData = { items: [], has_more: false, next_cursor: null, event_cursor: '1' };
const unavailable = { available: false };
const measured = { state: 'unavailable', reason: 'CONTROLLED', affected_requirements: [] };
const stage = () => ({ stage: mode, started_at_ms: epoch - 90_000, elapsed_ms: 90_000 + Date.now() - epoch,
  last_activity_at_ms: epoch - 80_000, observed_at_ms: Date.now(), deadline_at_ms: mode === 'waiting_decision' ? epoch + 60_000 : null,
  remaining_ms: mode === 'waiting_decision' ? Math.max(0, epoch + 60_000 - Date.now()) : null,
  tracking_state: mode === 'tracking_lost' ? 'lost' : 'tracked', availability: 'known', reason: null });
const attempt = () => ({ id: aid, project_id: pid, issue_id: 'issue', issue_number: 42, issue_title: 'Acompanhamento verificável', phase: 'implementing', result: null,
  suspension: mode === 'waiting_decision' ? 'HUMAN_DECISION' : mode === 'tracking_lost' ? 'TRACKING_LOST' : null, revision: sequence, created_at_ms: epoch - 90_000, updated_at_ms: epoch });
const settings = { settings: { id: 'local', installation_id: 'sprint042', account_id: 'account', projects_root: 'projects', automation_enabled: false, revision: 1,
  time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } },
  profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1', onboarding: { suppressed: true, completed_at_ms: 1, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: {}, tool_preferences: { format_version: 1 } };
const operation = () => ({ stage_activity: stage(), account: { id: 'account', login: 'Conta controlada', observed_id: 'account', observed_at_ms: epoch }, host: { designated: 'host', current: 'host', matches: true },
  automation: { enabled: false, dispatch_paused: false, project_enabled: null }, active_attempt: attempt(), active_attempt_count: 1,
  next_candidates: [], candidate_observation: { state: 'not_observed', requires_revalidation: true, order: 'observed_queue_order', has_more: false }, recent_results: [], impediments: [],
  integration_status: { kind: 'maestri_native', state: 'not_checked', observation: null, proves_provider_execution: false }, event_cursor: String(sequence) });
const detail = section => ({ ...attempt(), operation_id: id(3), passage_id: id(4), round: 1, tracking: stage().tracking_state, diagnostic: null, result_receipt_id: null, delivery_id: null,
  pending_question_id: null, event_cursor: String(sequence), expected_account_id: 'account', issue: { id: 'issue', number: 42, title: 'Acompanhamento verificável', url: 'https://github.com/example/project/issues/42' },
  selected_delivery_id: null, selected_round: 1, delivery_summary: null, publication_target: null, publication_target_hash: null, stage_activity: stage(), block: null, v3_details: null,
  publication: { mode: 'icr', review_state: null, local_state: 'pending', confirmed_effects: 0, pending_effects: 0, unknown_effects: 0, complete_capability: unavailable, reconcile_capability: unavailable,
    commit: { state: 'not_requested', sha: null, reason: 'MODE_ICR', operation_id: null, branch_ref: null, task_type: null, task_description: null }, upgrades: [], push: { state: 'not_requested', receipt: null, reason: null }, pull_request: { state: 'not_requested', receipt: null, reason: null } },
  measurements: { stage_activity: stage(), active_time: measured, human_wait: measured, cost: measured, active_limit: { state: 'not_configured' }, question_ttl: { state: 'not_configured' }, active_limit_state: 'unavailable', active_expired_at_ms: null, passages: [], pending_requirements: [] },
  cleanup: 'complete', authority: null, capabilities: { cancel: unavailable, complete_publication: unavailable, reconcile_publication: unavailable, revalidate: unavailable }, details: section ? { section, ...pageData } : null });
let instance = id(99);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4310');
  const reply = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', ETag: '"controlled"' }); res.end(JSON.stringify(data)); };
  if (url.pathname === '/api/v1/events/stream') {
    if (!allowStream) return reply({}, 503);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); res.write('retry: 250\n: connected\n\n'); streams.add(res);
    req.on('close', () => streams.delete(res)); return;
  }
  if (url.pathname === '/api/v1/shutdown') {
    let raw=''; for await(const chunk of req) raw+=chunk;
    const body=JSON.parse(raw); assert.deepEqual(body,{authorized:true}); shutdownRequests.push(body);
    return reply({state:'closing'},202);
  }
  if (url.pathname === '/api/v1/session') return reply({ csrf_token: 'c'.repeat(43), instance_id: instance });
  if (url.pathname === '/api/v1/health') return reply({ status: 'ok' });
  if (url.pathname === '/api/v1/settings') return reply(settings);
  if (url.pathname === '/api/v1/projects') return reply(pageData);
  if (url.pathname === '/api/v1/events') return reply({ ...pageData, event_cursor: String(sequence) });
  if (url.pathname === '/api/v1/operation') {
    return reply(operation());
  }
  if (url.pathname === '/api/v1/attempts') return reply({ ...pageData, items: [attempt()] });
  if (url.pathname === `/api/v1/attempts/${aid}`) return reply(detail(url.searchParams.get('section')));
  if (url.pathname.endsWith('/resources')) return reply({ entries: [], cleanup: 'complete' });
  if (url.pathname.endsWith('/producer-result')) return reply(null);
  if (url.pathname.endsWith('/diagnostics')) return reply({ context: { scope: 'attempt', id: aid }, supported_checks: [], diagnostics: [], reports: [], event_cursor: '1' });
  if (url.pathname === '/api/v1/queue') return reply({ scope: { kind: 'account', project_ids: [] }, enabled: false, valid: true, complete: true, observation_id: id(5), summary_hash: 'a'.repeat(64), observed_at_ms: epoch,
    eligible_total: 0, modes_by_project: [], account: { id: 'account', login: 'Conta controlada' }, host: { expected: 'host', observed: 'host', matches: true }, order: { criterion: 'issue-number', description: 'Controlada' }, diagnostics: [], event_cursor: '1',
    polling: { interval_ms: 15000, backoff_max_ms: 60000, retry_at_ms: null, next_poll_at_ms: Date.now() + 15000 }, page: pageData });
  if (url.pathname.startsWith('/api/v1/')) return reply({ deletion: null, ...pageData });
  try {
    const path = resolve(root, 'dist/web', url.pathname === '/' ? 'index.html' : `.${url.pathname}`);
    if (!path.startsWith(resolve(root, 'dist/web') + sep)) throw new Error('path');
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(done => server.listen(4310, '127.0.0.1', done));
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message));
await mkdir(output,{recursive:true});
try {
 await page.goto('http://127.0.0.1:4310/#principal/dashboard?dialog=shutdown');
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('heading',{name:'Encerrar controlador',exact:true}).waitFor();
 assert.deepEqual(await dialog.locator('button').allTextContents(),['Cancelar','Encerrar controlador']);
 assert((await dialog.innerText()).includes('encerra o controlador agora'));
 await page.screenshot({path:resolve(output,'01-confirmation.png'),fullPage:true});
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 assert.equal(shutdownRequests.length,0);
 await page.getByRole('button',{name:'Encerrar controlador',exact:true}).click();
 await dialog.getByRole('button',{name:'Encerrar controlador',exact:true}).click();
 await dialog.getByText('Encerrando o controlador…',{exact:true}).waitFor();
 assert.deepEqual(shutdownRequests,[{authorized:true}]);
 assert.deepEqual(await dialog.locator('button').allTextContents(),['Cancelar','Encerrar controlador']);
 assert(await dialog.locator('button').evaluateAll(buttons=>buttons.every(button=>button.disabled)));
 await page.setViewportSize({width:390,height:640});
 await page.screenshot({path:resolve(output,'02-mobile.png'),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const footer=await dialog.locator('.dialog-actions').boundingBox(); assert(footer.y+footer.height<=640);
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,shutdownRequests,errors,controlled:true},null,2));
 console.log(JSON.stringify({passed:true,shutdownRequests,errors}));
}catch(error){console.log(await page.locator('body').innerText());await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});throw error;}finally{await browser.close();for(const stream of streams)stream.destroy();server.closeAllConnections();await new Promise(done=>server.close(done));}
