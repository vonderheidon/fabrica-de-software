import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createAgentSession, discoverAuthStorage, ModelRegistry, SessionManager, Settings, InteractiveMode, submitInteractiveInput } from '@oh-my-pi/pi-coding-agent';
import { MCPManager } from '@oh-my-pi/pi-coding-agent/mcp';

const [runId] = Bun.argv.slice(2);
if (!/^\d{8}T\d{9}Z$/.test(runId ?? '')) throw new Error('Expected runId');
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Real TUI required');
const root = resolve(import.meta.dir, '../..');
const cwd = join(root, 'casos', runId, 'TUI Ambiente Minimo');
const evidence = join(root, 'evidencias', runId, 'TUI-ENV-01');
if (existsSync(join(evidence, 'started.json'))) throw new Error('Run already started');
writeFileSync(join(evidence, 'started.json'), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, parentPid: process.ppid }), { flag: 'wx' });
const log = (event: object) => appendFileSync(join(evidence, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
const previousMarker = process.env.ENSAIO_PARENT_ONLY;
process.env.ENSAIO_PARENT_ONLY = randomBytes(32).toString('hex');
const settings = await Settings.init({ cwd, readOnly: true, overrides: { 'retry.modelFallback': false, autoResume: false, 'prewalk.enabled': false, 'startup.setupWizard': false } });
const authStorage = await discoverAuthStorage(process.env.PI_CODING_AGENT_DIR, { cwd });
const modelRegistry = new ModelRegistry(authStorage, undefined, { settings });
await modelRegistry.refresh();
const model = modelRegistry.find('openai-codex', 'gpt-6-luna');
if (!model || !modelRegistry.hasConfiguredAuth(model)) throw new Error('Exact model/auth unavailable');
const config = { type: 'stdio' as const, command: Bun.which('node')!, args: [join(root, 'controle', 'mcp-minimal-launcher.mjs'), join(evidence, 'server.jsonl'), cwd], cwd };
const manager = new MCPManager(cwd, null, async () => ({ configs: { 'ensaio-minimo': config }, sources: { 'ensaio-minimo': { level: 'project', path: 'explicit-study-launcher', provider: 'ensaio', providerName: 'Minimal server environment study' } }, exaApiKeys: [] }));
manager.setAuthStorage(authStorage);
let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
let inputCount = 0;
let closed = false;
async function cleanup() {
  if (closed) return;
  closed = true;
  await manager.disconnectAll();
  writeFileSync(join(evidence, 'shutdown.json'), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, connectedServers: manager.getConnectedServers() }, null, 2), { flag: 'wx' });
}
try {
  await manager.discoverAndConnect({ startupTimeoutMs: 10000, filterExa: false });
  if (manager.getConnectedServers().length !== 1) throw new Error('Required MCP unavailable');
  const created = await createAgentSession({ cwd, settings, authStorage, modelRegistry, model, thinkingLevel: 'high', cacheWarming: false, hasUI: true, sessionManager: SessionManager.create(cwd, join(evidence, 'sessions')), disableExtensionDiscovery: true, mcpManager: manager, mcpTools: manager.getTools(), extensions: [pi => { pi.on('session_shutdown', cleanup); }] });
  session = created.session;
  manager.setOnToolsChanged(async tools => { await session!.refreshMCPTools(tools); });
  session.subscribe(event => {
    if (event.type === 'message_end' && event.message.role === 'assistant') log({ event: 'assistant-message', provider: event.message.provider, model: event.message.model, thinkingLevel: session!.thinkingLevel, stopReason: event.message.stopReason, text: event.message.content.filter(c => c.type === 'text').map(c => c.text) });
  });
  const mode = new InteractiveMode(session, '18.10.3-tui-env-study', undefined, created.setToolUIContext, created.lspServers, manager);
  await mode.init();
  function capture(name: string) {
    writeFileSync(join(evidence, `${name}.json`), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, cwd, sessionId: session!.sessionManager.getSessionId(), model: session!.model?.id, provider: session!.model?.provider, thinkingLevel: session!.thinkingLevel, tty: { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY }, parentMarkerPresent: !!process.env.ENSAIO_PARENT_ONLY, maestriContextPresent: !!process.env.MAESTRI_PIPE, connectedServers: manager.getConnectedServers(), tools: session!.getAllToolNames(), mcpSchemas: manager.getTools().map(t => ({ name: t.name, parameters: t.parameters })) }, null, 2), { flag: 'wx' });
  }
  capture('ready');
  await session.prompt(readFileSync(join(evidence, 'task.txt'), 'utf8'));
  capture('after-task');
  while (true) {
    const input = await mode.getUserInput();
    log({ event: 'interactive-input', input });
    if (input.text.trim() === 'ENSAIO_ENCERRAR') break;
    await submitInteractiveInput(mode, session, input);
    capture(`after-input-${++inputCount}`);
  }
} finally {
  await cleanup();
  await session?.dispose();
  if (previousMarker === undefined) delete process.env.ENSAIO_PARENT_ONLY;
  else process.env.ENSAIO_PARENT_ONLY = previousMarker;
}
