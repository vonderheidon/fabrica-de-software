import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createAgentSession, discoverAuthStorage, ModelRegistry, SessionManager, Settings, InteractiveMode } from '@oh-my-pi/pi-coding-agent';
import { MCPManager } from '@oh-my-pi/pi-coding-agent/mcp';

const [runId] = Bun.argv.slice(2);
if (!/^\d{8}T\d{9}Z$/.test(runId ?? '')) throw new Error('Expected runId');
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Review requires real TUI');
const root = resolve(import.meta.dir, '../..');
const evidence = join(root, 'evidencias', runId);
const cwd = join(evidence, 'review-input');
const output = join(evidence, 'review');
mkdirSync(output, { recursive: false });
const settings = await Settings.init({ cwd, readOnly: true, overrides: { 'retry.modelFallback': false, autoResume: false, 'prewalk.enabled': false, 'startup.setupWizard': false } });
const authStorage = await discoverAuthStorage(process.env.PI_CODING_AGENT_DIR, { cwd });
const modelRegistry = new ModelRegistry(authStorage, undefined, { settings });
await modelRegistry.refresh();
const model = modelRegistry.find('openai-codex', 'gpt-6-luna');
if (!model || !modelRegistry.hasConfiguredAuth(model)) throw new Error('Requested model/auth unavailable');
const manager = new MCPManager(cwd, null, async () => ({ configs: {}, sources: {}, exaApiKeys: [] }));
const created = await createAgentSession({ cwd, settings, authStorage, modelRegistry, model, thinkingLevel: 'high', cacheWarming: false, hasUI: true, sessionManager: SessionManager.create(cwd, join(output, 'sessions')), disableExtensionDiscovery: true, mcpManager: manager, mcpTools: [] });
const session = created.session;
const messages: unknown[] = [];
session.subscribe(event => {
  if (event.type === 'message_end' && event.message.role === 'assistant') messages.push({ provider: event.message.provider, model: event.message.model, thinkingLevel: session.thinkingLevel, stopReason: event.message.stopReason, text: event.message.content.filter(c => c.type === 'text').map(c => c.text) });
});
try {
  const mode = new InteractiveMode(session, '18.10.3-study-review', undefined, created.setToolUIContext, created.lspServers, manager);
  await mode.init();
  writeFileSync(join(output, 'ready.json'), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, sessionId: session.sessionManager.getSessionId(), cwd, model: session.model?.id, provider: session.model?.provider, thinkingLevel: session.thinkingLevel, tools: session.getAllToolNames(), connectedServers: manager.getConnectedServers() }, null, 2), { flag: 'wx' });
  await session.prompt(readFileSync(join(evidence, 'review-task.txt'), 'utf8'));
  writeFileSync(join(output, 'result.json'), JSON.stringify({ at: new Date().toISOString(), messages, finalModel: session.model?.id, finalProvider: session.model?.provider, thinkingLevel: session.thinkingLevel }, null, 2), { flag: 'wx' });
} finally {
  await manager.disconnectAll();
  await session.dispose();
}
