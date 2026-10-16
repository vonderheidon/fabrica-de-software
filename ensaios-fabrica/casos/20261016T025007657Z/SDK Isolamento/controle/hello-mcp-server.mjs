import { createInterface } from 'node:readline';

const serverInfo = { name: 'ensaio-local', version: '1.0.0' };
const tool = {
  name: 'greet',
  description: 'Retorna uma saudação local para validar uma chamada MCP.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
};

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function fail(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    continue;
  }

  if (!Object.hasOwn(message, 'id')) continue;

  switch (message.method) {
    case 'initialize':
      respond(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2025-03-26',
        capabilities: { tools: {} },
        serverInfo,
      });
      break;
    case 'ping':
      respond(message.id, {});
      break;
    case 'tools/list':
      respond(message.id, { tools: [tool] });
      break;
    case 'tools/call':
      if (message.params?.name !== tool.name) {
        respond(message.id, {
          content: [{ type: 'text', text: `Ferramenta desconhecida: ${message.params?.name ?? ''}` }],
          isError: true,
        });
        break;
      }
      respond(message.id, {
        content: [{ type: 'text', text: `Olá, ${message.params.arguments?.name ?? 'visitante'}!` }],
      });
      break;
    default:
      fail(message.id, -32601, `Método desconhecido: ${message.method ?? ''}`);
  }
}
