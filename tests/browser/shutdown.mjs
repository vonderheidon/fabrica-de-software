import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, '.playwright-mcp/sprint042');
await mkdir(output, { recursive: true });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const aid = id(1), pid = id(2), epoch = Date.now();
let mode = 'implementing', fail = false, allowStream = true, hold = false, sequence = 1;
const pending = [], streams = new Set(), requests = [], errors = [], captures = [];
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
let paused = false, draining = false, committed = false, lost = false, refuse = false, revoked = false;
let revision = 1, commands = [], operations = new Map(), instance = id(99);
const shutdown = (cursor = false) => ({ revision, generation: revision, starts_paused: paused, automation_enabled: false, closing_committed: committed,
 state: committed ? 'closing' : draining ? 'draining' : paused ? 'paused' : 'running', remaining_work_count: 21, has_more: !cursor, next_cursor: cursor ? null : 'next', operation_id: null,
 active_work: [{type:'execution',id:cursor ? 'executor-21' : 'executor-1',attempt_id:aid,project_id:id(2),state:'unknown',cause:'Parada física não confirmada.',recovery:'Confira os recursos no detalhe da tentativa.'}],
 pause_capability:{available:!paused && !committed}, close_when_idle_capability:{available:paused && !committed}, resume_starts_capability:{available:paused && !committed,reason:committed ? 'Fechamento já comprometido. Aguarde e reabra o controlador.' : undefined},event_cursor:String(revision) });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4310'); requests.push({ method: req.method, path: url.pathname });
  const reply = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', ETag: '"controlled"' }); res.end(JSON.stringify(data)); };
  if (url.pathname === '/api/v1/events/stream') {
    if (!allowStream) return reply({}, 503);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); res.write('retry: 250\n: connected\n\n'); streams.add(res);
    req.on('close', () => streams.delete(res)); return;
  }
  if (url.pathname === '/api/v1/shutdown') {
    if(req.method === 'GET') return reply(shutdown(url.searchParams.has('cursor')));
    let raw=''; for await(const chunk of req) raw+=chunk;
    const body=JSON.parse(raw); commands.push(body.action);
    if(refuse) { refuse=false; committed=true; return reply({code:'SHUTDOWN_COMMITTED',message:'Fechamento já comprometido.',request_id:'controlled',recovery:'Aguarde e reabra o controlador.'},409); }
    assert.equal(req.headers['if-match'],'"controlled"');
    paused=body.action!=='resume_starts'; draining=body.action==='close_when_idle'; revision++;
    const oid=req.headers['idempotency-key'];
    operations.set(oid,{operation_id:oid,kind:'shutdown.'+body.action,state:draining?'running':'succeeded',resource:{type:'controller',id:'local'},request_id:'controlled',progress:{kind:'shutdown',state:revoked?'revoked':shutdown().state,shutdown:shutdown()}});
    if(lost){lost=false;res.writeHead(202,{'Content-Type':'application/json'});res.end('{');return;}
    return reply({operation_id:oid,resource:{type:'controller',id:'local'},status_url:'/api/v1/operations/'+oid,request_id:'controlled'},202);
  }
  if(url.pathname.startsWith('/api/v1/operations/')) { const op=operations.get(url.pathname.split('/').at(-1)); if(revoked && op?.progress) op.progress.state='revoked'; return reply(op); }
  if (url.pathname === '/api/v1/session') return reply({ csrf_token: 'c'.repeat(43), instance_id: instance });
  if (url.pathname === '/api/v1/health') return reply({ status: 'ok' });
  if (url.pathname === '/api/v1/settings') return reply(settings);
  if (url.pathname === '/api/v1/projects') return reply(pageData);
  if (url.pathname === '/api/v1/events') return reply({ ...pageData, event_cursor: String(sequence) });
  if (url.pathname === '/api/v1/operation') {
    if (hold) { pending.push(() => reply(operation())); return; }
    return fail ? reply({ code: 'UNAVAILABLE', message: 'Consulta controlada indisponível', request_id: 'controlled' }, 503) : reply(operation());
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
 await dialog.getByRole('heading',{name:'Novos inícios liberados',exact:true}).waitFor();
 assert.equal(commands.length,0);
 await dialog.getByRole('button',{name:'Pausar novos inícios',exact:true}).click();
 await dialog.getByText('Pausa confirmada.',{exact:false}).waitFor();
 await dialog.getByRole('button',{name:'Próxima página'}).click();
 await dialog.getByText('executor-21',{exact:true}).waitFor();
 assert((await dialog.innerText()).includes('21 trabalho(s)'));
 await page.screenshot({path:resolve(output,'01-paused.png'),fullPage:true});
 await dialog.getByRole('button',{name:'Fechar diálogo',exact:true}).last().click();
 const count=commands.length;
 await page.getByRole('button',{name:'Encerrar controlador',exact:true}).click();
 await dialog.getByText('Pausa confirmada.',{exact:false}).waitFor(); assert.equal(commands.length,count);
 await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
 assert.equal(commands.length,count);
 assert.equal(await page.getByRole('button',{name:'Encerrar controlador',exact:true}).evaluate(button=>button===document.activeElement),true);
 await page.getByRole('button',{name:'Encerrar controlador',exact:true}).click();
 await dialog.getByText('Pausa confirmada.',{exact:false}).waitFor();
 lost=true;
 await dialog.getByRole('button',{name:'Retomar novos inícios',exact:true}).click();
 await dialog.getByText('Resposta não confirmada.',{exact:false}).waitFor();
 assert(!(await dialog.innerText()).includes('Novos inícios liberados. Automação permanece desligada.'));
 instance = id(98); await page.reload();
 await dialog.getByRole('button',{name:'Consultar operação',exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Consultar operação',exact:true}).click();
 await dialog.getByText('Novos inícios liberados. Automação permanece desligada.',{exact:true}).waitFor();
 assert.equal(commands.filter(x=>x==='resume_starts').length,1);
 await dialog.getByRole('button',{name:'Pausar novos inícios',exact:true}).click();
 await dialog.getByText('Pausa confirmada.',{exact:false}).waitFor();
 refuse=true;
 await dialog.getByRole('button',{name:'Retomar novos inícios',exact:true}).click();
 await dialog.getByRole('heading',{name:'Fechamento comprometido',exact:true}).waitFor();
 assert(await dialog.getByRole('button',{name:'Retomar novos inícios',exact:true}).isDisabled());
 await page.screenshot({path:resolve(output,'02-race.png'),fullPage:true});
 committed=false;paused=true;draining=true;revoked=true;lost=true;
 await dialog.getByRole('button',{name:'Atualizar estado',exact:true}).click();
 await dialog.getByRole('button',{name:'Fechar quando ocioso',exact:true}).click();
 await dialog.getByText('Resposta não confirmada.',{exact:false}).waitFor();
 await dialog.getByRole('button',{name:'Consultar operação',exact:true}).click();
 await dialog.getByText('Pedido de fechamento revogado.',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:640});
 await page.screenshot({path:resolve(output,'03-mobile.png'),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const footer=await dialog.locator('.dialog-actions').boundingBox(); assert(footer.y+footer.height<=640);
 await page.setViewportSize({width:312,height:512});
 await page.screenshot({path:resolve(output,'04-zoom.png')});
 assert(await dialog.locator('.dialog-actions button').evaluateAll(buttons => buttons.every(button => { const box=button.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; })));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,commands,errors,controlled:true},null,2));
 console.log(JSON.stringify({passed:true,commands,errors}));
}catch(error){console.log(await page.locator('body').innerText());await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});throw error;}finally{await browser.close();for(const stream of streams)stream.destroy();server.closeAllConnections();await new Promise(done=>server.close(done));}
