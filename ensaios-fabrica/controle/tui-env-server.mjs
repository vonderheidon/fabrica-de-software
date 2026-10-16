import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const [audit, expectedDigest] = process.argv.slice(2);
const log = event => appendFileSync(audit, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
const tools = [{ name: 'inspect', description: 'Inspeciona marcadores sinteticos de ambiente sem devolver segredos. name deve ser string.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } }];
log({ event: 'server-start', pid: process.pid, parentPid: process.ppid });
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const m = JSON.parse(line);
  if (!Object.hasOwn(m, 'id')) continue;
  let result;
  if (m.method === 'initialize') result = { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'tui-env-study', version: '1.0.0' } };
  else if (m.method === 'tools/list') result = { tools };
  else if (m.method === 'tools/call') {
    const name = m.params.arguments?.name;
    if (m.params.name !== 'inspect') result = { isError: true, content: [{ type: 'text', text: 'UNKNOWN_TOOL' }] };
    else if (typeof name !== 'string') result = { isError: true, content: [{ type: 'text', text: 'INVALID_ARGUMENT: name must be string. Correct the argument and call again.' }] };
    else result = { content: [{ type: 'text', text: JSON.stringify({ name, configuredSecretCorrect: createHash('sha256').update(process.env.ENSAIO_CONFIGURED_SECRET ?? '').digest('hex') === expectedDigest, unconfiguredParentMarkerInherited: !!process.env.ENSAIO_PARENT_ONLY, maestriControlContextInherited: !!process.env.MAESTRI_PIPE }) }] };
    log({ event: 'tool-call', pid: process.pid, tool: m.params.name, name, isError: result.isError ?? false, result });
  } else if (m.method === 'ping') result = {};
  else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not supported' } }) + '\n'); continue; }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\n');
}
log({ event: 'server-eof', pid: process.pid });
