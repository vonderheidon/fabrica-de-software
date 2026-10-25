import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '../../dist/web');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const installation = id(99), attempt = id(1), streams = new Set(), claims = new Map(), receipts = [], events = [];
let sequence = 0;
const settings = { settings: { id: 'local', installation_id: installation, account_id: 'account', projects_root: 'projects', automation_enabled: false, revision: 1,
  time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } },
  profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '0', onboarding: { suppressed: true, completed_at_ms: 1, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: {}, tool_preferences: { format_version: 1 } };
settings.selection_capabilities.projects_root = { available: false, reason: 'CONTROLLED' };
for (const tool of ['git', 'maestri', 'omp', 'powershell']) settings.tool_preferences[tool] = { preferred_path: null, last_validated_at_ms: null };
const page = () => ({ items: [], has_more: false, next_cursor: null, event_cursor: String(sequence) });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4310');
  const reply = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', ETag: '"controlled"' }); res.end(JSON.stringify(data)); };
  const body = async () => { let text = ''; for await (const chunk of req) text += chunk; return JSON.parse(text); };
  if (url.pathname === '/proof/state') return reply({ installation, attempt, claims: [...claims.values()], receipts });
  if (url.pathname === '/proof/event') {
    const event = { seq: String(++sequence), event_type: url.searchParams.get('kind') ?? 'question-raised', entity_type: 'attempt', entity_id: attempt, entity_revision: 1, operation_id: id(8), attempt_id: attempt, occurred_at_ms: Date.now(), facts: {} };
    events.unshift(event);
    for (const stream of streams) stream.write(`id: ${event.seq}\nevent: controller-event\ndata: ${JSON.stringify({ entity: { type: 'attempt', id: attempt }, revision: 1, operation_id: id(8), event_type: event.event_type, attempt_id: attempt, facts: {} })}\n\n`);
    return reply(event);
  }
  if (url.pathname === '/api/v1/events/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': connected\n\n'); streams.add(res); req.on('close', () => streams.delete(res)); return;
  }
  if (url.pathname === '/api/v1/session') return reply({ csrf_token: 'c'.repeat(43), instance_id: id(98) });
  if (url.pathname === '/api/v1/settings') return reply(settings);
  if (url.pathname === '/api/v1/events') return reply({ ...page(), items: events });
  if (url.pathname === '/api/v1/notifications/claims') {
    const command = await body(), key = `${command.consumer_id}:${command.event_seq}`, previous = claims.get(key);
    if (previous) return reply({ ...previous, operation_id: req.headers['idempotency-key'], send_allowed: false });
    const kind = events.find(e => e.seq === command.event_seq)?.event_type;
    const claim = { ...command, dispatch_id: id(100 + Number(command.event_seq)), revision: 1, state: 'reserved', send_allowed: true, operation_id: req.headers['idempotency-key'],
      notification: { title: 'Nova fábrica de software', event_kind: kind === 'question-raised' ? 'question_pending' : kind === 'attempt.icr-completed' ? 'completion' : 'failure', target_hash: `#principal/tentativas?attemptId=${attempt}&dialog=detail` } };
    claims.set(key, claim); return reply(claim);
  }
  if (url.pathname === '/api/v1/notifications/receipts') { const receipt = await body(); receipts.push(receipt); return reply({ ...receipt, revision: 2, operation_id: req.headers['idempotency-key'] }); }
  if (url.pathname === '/api/v1/attempts/' + attempt) return reply({ code: 'NOT_FOUND', message: 'Detalhe controlado indisponível' }, 404);
  if (['/api/v1/projects', '/api/v1/attempts'].includes(url.pathname)) return reply(page());
  if (url.pathname.startsWith('/api/')) return reply({ code: 'CONTROLLED_UNAVAILABLE', message: 'Superfície fora da fixture de notificações' }, 503);
  try {
    const path = resolve(root, url.pathname === '/' ? 'index.html' : `.${url.pathname}`);
    if (!path.startsWith(root + sep)) throw new Error('path');
    res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] ?? 'application/octet-stream' }); res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
server.listen(4310, '127.0.0.1', () => console.log('Controlled notification fixture listening on 4310'));
