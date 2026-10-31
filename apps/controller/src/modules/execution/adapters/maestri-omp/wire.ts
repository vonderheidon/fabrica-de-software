import type { Socket } from 'node:net';
import { ExecutionError, type ExecutionCode } from '../../errors.js';

export const executionLimits = Object.freeze({
  frameBytes: 1_048_576, queuedFrames: 16, socketBufferBytes: 2_097_152,
  handshakeMs: 30_000, requestMs: 15_000, cancelMs: 30_000, cliMs: 15_000, cliBytes: 1_048_576,
  connections: 4, pendingCalls: 8, passages: 128,
});

/** Byte framing precedes fatal UTF-8 decoding, including split multi-byte characters. */
export class JsonLines {
  private buffer = Buffer.alloc(0);
  private ended = false;
  feed(chunk: Uint8Array): unknown[] {
    if (this.ended) throw new ExecutionError('CHANNEL_EOF');
    if (chunk.length > executionLimits.socketBufferBytes) throw new ExecutionError('FRAME_OVERSIZE');
    const data = Buffer.concat([this.buffer, chunk]);
    const frames: unknown[] = [];
    let offset = 0;
    for (;;) {
      const end = data.indexOf(10, offset);
      if (end < 0) break;
      if (end - offset > executionLimits.frameBytes) throw new ExecutionError('FRAME_OVERSIZE');
      if (frames.length >= executionLimits.queuedFrames) throw new ExecutionError('FRAME_OVERSIZE');
      try {
        const json = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(offset, end));
        frames.push(JSON.parse(json));
      } catch { throw new ExecutionError('FRAME_INVALID'); }
      offset = end + 1;
    }
    if (data.length - offset > executionLimits.frameBytes) throw new ExecutionError('FRAME_OVERSIZE');
    this.buffer = Buffer.from(data.subarray(offset));
    return frames;
  }
  end(): void {
    this.ended = true;
    const incomplete = this.buffer.length !== 0;
    this.buffer = Buffer.alloc(0);
    if (incomplete) throw new ExecutionError('CHANNEL_EOF');
  }
}
export interface Wire {
  send(value: unknown): Promise<void>;
  close(code?: ExecutionCode): void;
}
export function connectWire(socket: Socket, onFrame: (value: unknown) => Promise<void>, onClose: (code: ExecutionCode) => void): Wire {
  const decoder = new JsonLines();
  let closed = false;
  let reading = false;
  const fail = (code: ExecutionCode) => {
    if (closed) return;
    closed = true;
    socket.destroy();
    onClose(code);
  };
  socket.on('data', (chunk: Buffer) => {
    if (closed) return;
    if (reading) { fail('FRAME_OVERSIZE'); return; }
    socket.pause(); reading = true;
    void (async () => {
      try {
        const frames = decoder.feed(chunk);
        for (const value of frames) { if (!closed) await onFrame(value); }
      } catch (error) { fail(error instanceof ExecutionError ? error.code : 'FRAME_INVALID'); }
      finally { reading = false; if (!closed) socket.resume(); }
    })();
  });
  socket.on('end', () => { try { decoder.end(); } catch { /* Incomplete EOF is the same terminal channel diagnostic. */ } fail('CHANNEL_EOF'); });
  socket.on('error', () => fail('CHANNEL_EOF'));
  socket.on('close', () => fail('CHANNEL_EOF'));
  return {
    close: (code = 'CHANNEL_EOF') => fail(code),
    send: async (value) => {
      const data = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
      if (closed || socket.destroyed) throw new ExecutionError('CHANNEL_EOF');
      if (data.length - 1 > executionLimits.frameBytes || socket.writableLength + data.length > executionLimits.socketBufferBytes) {
        fail('FRAME_OVERSIZE'); throw new ExecutionError('FRAME_OVERSIZE');
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { fail('CHANNEL_TIMEOUT'); done(new ExecutionError('CHANNEL_TIMEOUT')); }, executionLimits.requestMs);
        const onClosed = () => done(new ExecutionError('CHANNEL_EOF'));
        const done = (error?: Error | null) => {
          clearTimeout(timer); socket.off('close', onClosed);
          if (error) reject(new ExecutionError('CHANNEL_EOF')); else resolve();
        };
        socket.once('close', onClosed);
        socket.write(data, done);
      });
    },
  };
}
