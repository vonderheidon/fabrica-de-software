import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, isAbsolute } from 'node:path';
import { MCPManager, callTool } from '@oh-my-pi/pi-coding-agent/mcp';

const [runId] = Bun.argv.slice(2);
if (!/^\d{8}T\d{9}Z$/.test(runId ?? '')) throw new Error('Expected fresh runId');
const root = resolve(import.meta.dir, '../..');
const evidence = join(root, 'evidencias', runId, 'MCP-CFG-01');
const fixture = join(root, 'casos', runId, 'MCP Configuracao');
mkdirSync(evidence, { recursive: true });
mkdirSync(fixture, { recursive: true });
const base = { type: 'stdio', command: Bun.which('node')!, args: [join(root, 'controle', 'hello-mcp-server.mjs')], cwd: fixture };
type Entry = typeof base & { enabled?: boolean; disabled?: boolean };
// Resolver limitado ao estudo de precedencia STDIO; nao e o resolver do produto.
function selected(name: string, paths: string[]) {
  for (const path of paths) {
    let file;
    try { file = JSON.parse(readFileSync(path, 'utf8')); }
    catch { throw new Error(`invalid-json:${path}`); }
    if (!file || typeof file !== 'object' || Array.isArray(file) || !file.mcpServers || typeof file.mcpServers !== 'object' || Array.isArray(file.mcpServers)) throw new Error(`invalid-map:${path}`);
    if (!Object.hasOwn(file.mcpServers, name)) continue;
    const entry = file.mcpServers[name] as Entry;
    if (!entry || typeof entry !== 'object') throw new Error(`invalid-entry:${path}`);
    if (entry.disabled === true || entry.enabled === false) return { disabled: true, path };
    if (entry.type !== 'stdio' || typeof entry.command !== 'string' || !isAbsolute(entry.command) || !Array.isArray(entry.args) || entry.args.some(a => typeof a !== 'string')) throw new Error(`invalid-entry:${path}`);
    return { disabled: false, path, entry };
  }
  throw new Error(`missing-server:${name}`);
}
const cases = [
  { id: 'later-source', maps: [{}, { target: base }, { target: { ...base, command: 'must-not-launch' } }, {}], expected: 1 },
  { id: 'project-wins', maps: [{ target: base }, { target: { ...base, command: 'must-not-launch' } }, {}, {}], expected: 0 },
  { id: 'operator-source', maps: [{}, {}, { target: base }, {}], expected: 2 },
  { id: 'factory-source', maps: [{}, {}, {}, { target: base }], expected: 3 },
  { id: 'disabled-wins', maps: [{ target: { ...base, disabled: true } }, { target: base }, {}, {}], disabled: true },
  { id: 'enabled-false-wins', maps: [{ target: { ...base, enabled: false } }, { target: base }, {}, {}], disabled: true },
  { id: 'malformed-no-fallback', maps: ['{', { target: base }, {}, {}], error: 'invalid-json:' },
  { id: 'invalid-no-fallback', maps: [{ target: { command: 12 } }, { target: base }, {}, {}], error: 'invalid-entry:' },
];
const results = [];
for (const c of cases) {
  const dir = join(fixture, c.id);
  mkdirSync(dir, { recursive: true });
  const paths = c.maps.map((map, i) => {
    const path = join(dir, `${i}-mcp.json`);
    writeFileSync(path, typeof map === 'string' ? map : JSON.stringify({ mcpServers: map }, null, 2), { flag: 'wx' });
    return path;
  });
  const hashes = paths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }));
  let manager: MCPManager | undefined;
  try {
    const choice = selected('target', paths);
    let calls = 0;
    manager = new MCPManager(dir, null, async () => {
      calls++;
      const chosen = selected('target', paths);
      return { configs: chosen.disabled ? {} : { target: chosen.entry }, sources: chosen.disabled ? {} : { target: { level: 'project', path: chosen.path, provider: 'ensaio', providerName: 'Ordered fixture sources' } }, exaApiKeys: [] } as any;
    });
    await manager.discoverAndConnect({ startupTimeoutMs: 10000, filterExa: false });
    const connection = manager.getConnection('target');
    const response = connection ? await callTool(connection, 'greet', { name: c.id }) : null;
    const pass = c.disabled === true ? choice.disabled && !connection && manager.getTools().length === 0 : !choice.disabled && paths.indexOf(choice.path) === c.expected && !!connection && response?.content?.some(x => x.type === 'text' && x.text === `Olá, ${c.id}!`);
    results.push({ id: c.id, pass, choice: { path: choice.path, disabled: choice.disabled }, loaderCalls: calls, connectedServers: manager.getConnectedServers(), response, hashes });
  } catch (e) {
    const error = String((e as Error).message);
    results.push({ id: c.id, pass: !!c.error && error.startsWith(c.error), error, hashes });
  } finally { await manager?.disconnectAll(); }
}
const output = { runId, at: new Date().toISOString(), ompVersion: '18.10.3', modality: 'Study resolver feeding real MCPManager and STDIO calls; no agent', results, limits: ['Explicitly ordered fixture files stand for project/additional/operator/factory sources; real operator settings untouched', 'STDIO subset only; no complete production resolver', 'No model recovery, secret handling, or OS containment proved here'] };
writeFileSync(join(evidence, 'result.json'), JSON.stringify(output, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ runId, evidence, cases: results.map(r => ({ id: r.id, pass: r.pass })) }));
