import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const [audit, expectedDigest] = process.argv.slice(2);
appendFileSync(audit, JSON.stringify({ event: 'start', pid: process.pid, parentPid: process.ppid }) + '\n');
const tools = [{ name: 'inspect', description: 'Verifica marcadores sinteticos de ambiente, sem retornar seus valores.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }];
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const m = JSON.parse(line);
  if (!Object.hasOwn(m, 'id')) continue;
  let result;
  if (m.method === 'initialize') result = { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'env-probe', version: '1.0.0' } };
  else if (m.method === 'tools/list') result = { tools };
  else if (m.method === 'tools/call') {
    if (typeof m.params.arguments?.name !== 'string') result = { isError: true, content: [{ type: 'text', text: 'INVALID_ARGUMENT: name must be string' }] };
    else result = { content: [{ type: 'text', text: JSON.stringify({ name: m.params.arguments.name, configuredSecretCorrect: createHash('sha256').update(process.env.ENSAIO_CONFIGURED_SECRET ?? '').digest('hex') === expectedDigest, unconfiguredParentMarkerInherited: !!process.env.ENSAIO_PARENT_ONLY, maestriControlContextInherited: !!process.env.MAESTRI_PIPE }) }] };
  } else if (m.method === 'ping') result = {};
  else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not supported' } }) + '\n'); continue; }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\n');
}
