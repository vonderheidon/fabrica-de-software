import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:net';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ExecutionError, type ExecutionCode } from '../../errors.js';
import { connectWire, executionLimits, type Wire } from './wire.js';

const text = Type.String({ minLength: 1, maxLength: 8192 });
const effort = Type.Union([text, Type.Null()]);
export const Hello = Type.Object({
  type: Type.Literal('hello'), protocolVersion: Type.Literal(1), token: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }),
  sessionId: text, terminalId: text, workspaceId: text, cwd: text, provider: text, model: text, effort,
  tui: Type.Literal(true), roleDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }), ompVersion: Type.String({ minLength: 1, maxLength: 128 }),
}, { additionalProperties: false });
export type Hello = Static<typeof Hello>;
export interface PassageChannel {
  port: number; token: string;
  send(frame: unknown): Promise<void>;
  close(): Promise<void>;
}
export interface ChannelCallbacks {
  hello(frame: Hello): Promise<void>;
  frame(frame: unknown): Promise<void>;
  lost(code: ExecutionCode): void;
}
export type ChannelFactory = (callbacks: ChannelCallbacks) => Promise<PassageChannel>;
export const openChannel: ChannelFactory = async (callbacks) => {
  const token = randomBytes(32).toString('base64url');
  let accepted: Wire | undefined;
  let closing = false;
  const peers = new Set<Wire>();
  const server = createServer((socket) => {
    if (peers.size >= executionLimits.connections || accepted) { socket.destroy(); return; }
    let authenticated = false;
    const timer = setTimeout(() => wire.close('CHANNEL_TIMEOUT'), executionLimits.handshakeMs);
    const wire = connectWire(socket, async (frame) => {
      if (!authenticated) {
        if (!Value.Check(Hello, frame) || !timingSafeEqual(Buffer.from(frame.token), Buffer.from(token))) {
          wire.close('FRAME_INVALID'); return;
        }
        if (accepted) { wire.close(); return; }
        authenticated = true; accepted = wire; clearTimeout(timer);
        for (const other of peers) if (other !== wire) other.close();
        await callbacks.hello(frame);
      } else await callbacks.frame(frame);
    }, (code) => {
      clearTimeout(timer); peers.delete(wire);
      if (authenticated && !closing) callbacks.lost(code);
    });
    peers.add(wire);
  });
  server.maxConnections = executionLimits.connections;
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => reject(new ExecutionError('CLI_UNAVAILABLE')));
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => resolve());
  });
  server.on('error', () => { if (!closing) callbacks.lost('CHANNEL_EOF'); });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new ExecutionError('CLI_UNAVAILABLE'); }
  return {
    port: address.port, token,
    send: async (frame) => { if (!accepted) throw new ExecutionError('CHANNEL_EOF'); await accepted.send(frame); },
    close: async () => {
      if (closing) return;
      closing = true;
      for (const wire of peers) wire.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};
