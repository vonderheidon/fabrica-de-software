import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { MCPManager, callTool } from '@oh-my-pi/pi-coding-agent/mcp';

const [runId, mode = 'inherited'] = Bun.argv.slice(2);
if (!/^\d{8}T\d{9}Z$/.test(runId ?? '')) throw new Error('Expected fresh runId');
if (!['inherited', 'sanitized'].includes(mode)) throw new Error('Expected inherited|sanitized');
const root = resolve(import.meta.dir, '../..');
const evidence = join(root, 'evidencias', runId, 'MCP-ENV-01');
const fixture = join(root, 'casos', runId, 'MCP Configuracao');
if (existsSync(evidence)) throw new Error('Run already exists');
mkdirSync(evidence, { recursive: true });
mkdirSync(fixture, { recursive: true });
const save = (name: string, value: unknown) => writeFileSync(join(evidence, name), JSON.stringify(value, null, 2), { flag: 'wx' });
const secret = randomBytes(32).toString('hex');
const digest = createHash('sha256').update(secret).digest('hex');
const previous = process.env.ENSAIO_PARENT_ONLY;
if (mode === 'inherited') process.env.ENSAIO_PARENT_ONLY = randomBytes(32).toString('hex');
const audit = join(evidence, 'server.jsonl');
const config = { type: 'stdio' as const, command: Bun.which('node')!, args: [join(root, 'controle', 'env-probe-server.mjs'), audit, digest], cwd: fixture, envPolicy: 'literal' as const, env: { ENSAIO_CONFIGURED_SECRET: secret } };
const manager = new MCPManager(fixture, null, async () => ({ configs: { 'ensaio-env': config }, sources: { 'ensaio-env': { level: 'project', path: 'in-memory-synthetic-secret', provider: 'ensaio', providerName: 'Ensaio' } }, exaApiKeys: [] }));
const calls = [];
try {
  await manager.discoverAndConnect({ startupTimeoutMs: 10000, filterExa: false });
  const connection = manager.getConnection('ensaio-env');
  if (!connection) throw new Error('MCP did not connect');
  for (const args of [{ name: 12 }, { name: 'corrigido' }]) {
    calls.push({ arguments: args, result: await callTool(connection, 'inspect', args) });
  }
  save('result.json', { at: new Date().toISOString(), runId, mode, hostContext: { unconfiguredParentMarkerPresent: !!process.env.ENSAIO_PARENT_ONLY, maestriPipePresent: !!process.env.MAESTRI_PIPE }, ompVersion: '18.10.3', modality: 'SDK MCPManager with real stdio server; no model/TUI', connectedServers: manager.getConnectedServers(), schemas: manager.getTools().map(t => ({ name: t.name, parameters: t.parameters })), calls, limits: ['Synthetic secrets only; no production credential inspected', 'Direct protocol calls, not agent recovery', 'No general configuration resolver or process containment proved'] });
} finally {
  await manager.disconnectAll();
  if (previous === undefined) delete process.env.ENSAIO_PARENT_ONLY;
  else process.env.ENSAIO_PARENT_ONLY = previous;
  save('cleanup.json', { at: new Date().toISOString(), connectedServers: manager.getConnectedServers(), ownedStarts: readFileSync(audit, 'utf8').trim().split('\n').map(s => JSON.parse(s)) });
}
console.log(JSON.stringify({ runId, evidence, calls }));
