import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createAgentSession, discoverAuthStorage, ModelRegistry, SessionManager,
  Settings, InteractiveMode, submitInteractiveInput,
} from '@oh-my-pi/pi-coding-agent';
import { MCPManager } from '@oh-my-pi/pi-coding-agent/mcp';

const [runId, scenario] = Bun.argv.slice(2);
if (!runId || !['control', 'isolated', 'manual'].includes(scenario)) throw new Error('Expected runId and control|isolated|manual');
const root = join(import.meta.dir, '..', '..');
const cwd = join(root, 'casos', runId, 'SDK Isolamento');
const caseRoot = join(root, 'evidencias', runId, 'MCP-ISO-04');
const evidence = join(caseRoot, scenario);
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('This test requires a real terminal');
const log = (event: object) => appendFileSync(join(evidence, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
const settings = await Settings.init({
  cwd, agentDir: process.env.PI_CODING_AGENT_DIR, readOnly: true,
  overrides: { 'retry.modelFallback': false, 'autoResume': false, 'prewalk.enabled': false, 'startup.setupWizard': false },
});
const authStorage = await discoverAuthStorage(process.env.ENSAIO_AUTH_DIR!, { cwd });
const modelRegistry = new ModelRegistry(authStorage, undefined, { settings });
await modelRegistry.refresh();
const model = modelRegistry.find('openai-codex', 'gpt-6-luna');
if (!model || !modelRegistry.hasConfiguredAuth(model)) throw new Error('Requested model or authentication unavailable');
const selected = JSON.parse(readFileSync(join(caseRoot, 'selected-mcp.json'), 'utf8'));
const selectedLoader = async () => {
  log({ event: 'explicit-config-loader', servers: Object.keys(selected.configs) });
  return { ...selected, exaApiKeys: [] };
};
const manager = scenario !== 'control'
  ? new MCPManager(cwd, null, selectedLoader)
  : new MCPManager(cwd, null);
manager.setAuthStorage(authStorage);
manager.addConnectionStatusListener(event => log({ event: 'mcp-status', status: event }));
let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
let closed = false;
async function cleanup() {
  if (closed) return;
  closed = true;
  await manager.disconnectAll();
  writeFileSync(join(evidence, 'shutdown.json'), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, connectedServers: manager.getConnectedServers() }, null, 2));
}
try {
  await manager.discoverAndConnect({ enableProjectConfig: true, filterExa: false, startupTimeoutMs: 0 });
  const created = await createAgentSession({
    cwd, agentDir: process.env.PI_CODING_AGENT_DIR, settings, authStorage, modelRegistry,
    model, thinkingLevel: 'high', cacheWarming: false, hasUI: true,
    sessionManager: SessionManager.create(cwd, join(evidence, 'sessoes')),
    disableExtensionDiscovery: true,
    mcpManager: manager, mcpTools: manager.getTools(),
    extensions: [pi => { pi.on('session_shutdown', cleanup); }],
  });
  session = created.session;
  manager.setOnToolsChanged(async tools => { await session!.refreshMCPTools(tools); });
  session.subscribe(event => {
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const m = event.message;
      log({ event: 'assistant-message', provider: m.provider, model: m.model, thinkingLevel: session!.thinkingLevel, stopReason: m.stopReason, text: m.content.filter(c => c.type === 'text').map(c => c.text) });
    }
  });
  const mode = new InteractiveMode(session, '18.10.3-sdk-ensaio', undefined, created.setToolUIContext, created.lspServers, manager);
  await mode.init();
  function capture(stage: string) {
    const state = {
      stage, pid: process.pid, parentPid: process.ppid, scenario,
      tty: { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY },
      provider: session!.model?.provider, model: session!.model?.id, thinkingLevel: session!.thinkingLevel,
      connectedServers: manager.getConnectedServers(), nativeMcpTools: manager.getTools().map(t => ({ name: t.name, parameters: t.parameters })),
      tools: session!.getAllToolNames(), sessionId: session!.sessionManager.getSessionId(),
      privateAgentDir: process.env.PI_CODING_AGENT_DIR,
    };
    writeFileSync(join(evidence, stage + '.json'), JSON.stringify(state, null, 2));
    log({ event: stage, provider: state.provider, model: state.model, thinkingLevel: state.thinkingLevel, connectedServers: state.connectedServers });
  }
  capture('ready');
  if (scenario === 'isolated') {
    await session.prompt(readFileSync(join(evidence, 'tarefa.txt'), 'utf8'));
    capture('after-task');
  }
  while (true) {
    const input = await mode.getUserInput();
    await submitInteractiveInput(mode, session, input);
    capture('after-input');
  }
} finally {
  await cleanup();
  await session?.dispose();
}
