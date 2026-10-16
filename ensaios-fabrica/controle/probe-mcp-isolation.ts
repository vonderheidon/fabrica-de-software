import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export default async function (pi: any) {
  const evidence = process.env.ENSAIO_EVIDENCE!;
  const mode = process.env.ENSAIO_MODE!;
  const log = (event: object) => appendFileSync(join(evidence, 'bridge-events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
  if (mode === 'bridge') {
    const server = spawn(process.env.ENSAIO_NODE!, [join(process.cwd(), 'controle', 'hello-mcp-server.mjs')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    log({ event: 'server-start', pid: server.pid });
    let nextId = 0;
    const pending = new Map<number, { resolve: Function; reject: Function; timer: ReturnType<typeof setTimeout> }>();
    const lines = createInterface({ input: server.stdout });
    lines.on('line', line => {
      const message = JSON.parse(line);
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    server.on('exit', (code, signal) => {
      log({ event: 'server-exit', pid: server.pid, code, signal });
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('MCP server exited')); }
      pending.clear();
    });
    server.stderr.on('data', data => log({ event: 'server-stderr', text: String(data).slice(0, 1000) }));
    function request(method: string, params: object = {}): Promise<any> {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP timeout: ' + method)); }, 10000);
        pending.set(id, { resolve, reject, timer });
        server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    }
    const initialized = await request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ensaio-bridge', version: '0.1' } });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const listed = await request('tools/list');
    log({ event: 'discovery', initialized, tools: listed.tools });
    for (const tool of listed.tools) {
      pi.registerTool({
        name: 'ensaio_local_' + tool.name,
        label: 'Ensaio local ' + tool.name,
        description: tool.description,
        parameters: pi.typebox.Type.Unsafe(tool.inputSchema),
        async execute(_id: string, params: object) {
          const result = await request('tools/call', { name: tool.name, arguments: params });
          log({ event: 'tool-call', name: tool.name, arguments: params, result });
          return { ...result, details: { server: 'ensaio-local', mcpIsError: result.isError === true } };
        },
      });
    }
    pi.on('session_shutdown', async () => {
      server.stdin.end();
      await new Promise<void>(resolve => {
        if (server.exitCode !== null) return resolve();
        const timer = setTimeout(() => server.kill(), 2000);
        server.once('exit', () => { clearTimeout(timer); resolve(); });
      });
      lines.close();
    });
  }
  pi.on('session_start', async () => {
    await new Promise(resolve => setTimeout(resolve, 2500));
    const tools = pi.getAllTools();
    writeFileSync(join(evidence, 'runtime-tools.json'), JSON.stringify({ mode, pid: process.pid, agentDir: pi.pi.getAgentDir(), active: pi.getActiveTools(), tools }, null, 2));
    log({ event: 'ready', tools: tools.map((t: any) => t.name) });
  });
}
