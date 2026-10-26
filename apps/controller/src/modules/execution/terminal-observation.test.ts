import { EventEmitter } from 'node:events';
import { request, type IncomingMessage, type RequestOptions } from 'node:http';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { withWindowsTerminalJobs, type ExecutionHost } from './index.js';
import { observeStoppedTerminal } from './terminal-observation.js';

vi.mock('node:http', () => ({ request: vi.fn() }));

async function fixture() {
  const anchorId = randomUUID(); const workspaceId = randomUUID(); const terminalId = randomUUID();
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\factory-observation-${randomUUID()}` : `/tmp/factory-observation-${randomUUID()}`;
  const reference = { workspaceId, terminalId, terminalName: `factory-${randomUUID()}`, generation: 2 };
  const terminal = { id: terminalId, name: reference.terminalName, running: false };
  let response: unknown = { terminals: [terminal] };
  let status = 200; let observations = 0;
  const invoke = (options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    expect(options).toEqual({ socketPath: pipe, path: '/list', agent: false, headers: { 'X-Terminal-ID': anchorId } });
    const call = Object.assign(new EventEmitter(), {
      destroy: (error: Error) => { call.emit('error', error); call.emit('close'); },
      end: () => queueMicrotask(() => {
        observations++;
        const incoming = Object.assign(new EventEmitter(), { statusCode: status, resume: () => {} });
        callback(incoming as IncomingMessage);
        incoming.emit('data', Buffer.from(typeof response === 'string' ? response : JSON.stringify(response)));
        incoming.emit('end'); call.emit('close');
      }),
    });
    return call as ReturnType<typeof request>;
  };
  vi.mocked(request).mockImplementation(invoke as typeof request);
  const host: ExecutionHost = { maestriExecutable: process.execPath, ompExecutable: process.execPath, powershellExecutable: process.execPath,
    inheritedEnvironment: { MAESTRI_PIPE: pipe, MAESTRI_TERMINAL_ID: anchorId, MAESTRI_WORKSPACE_ID: workspaceId } };
  return { host, reference, terminal, observe: () => observeStoppedTerminal(host, reference), observations: () => observations,
    reply: (value: unknown, code = 200) => { response = value; status = code; } };
}

describe.skipIf(process.platform !== 'win32')('terminal availability after controller restart', () => {
  it('confirms the persisted terminal with a fresh host wrapper that has no prior job map', async () => {
    const f = await fixture();
    const restarted = withWindowsTerminalJobs(f.host, process.cwd());
    expect(await restarted.confirmStoppedTerminal!(f.reference)).toBe(true);
    f.terminal.running = true;
    expect(await restarted.confirmStoppedTerminal!(f.reference)).toBe(false);
    expect(f.observations()).toBe(2);
  });
  it('requires exact identity and name, a unique entry and an explicit stopped state', async () => {
    const f = await fixture();
    for (const terminals of [[], [{ ...f.terminal, id: randomUUID() }], [{ ...f.terminal, name: 'manual' }],
      [{ id: f.terminal.id, name: f.terminal.name }], [{ ...f.terminal, running: null }],
      [f.terminal, f.terminal], [f.terminal, { ...f.terminal, id: randomUUID() }]]) {
      f.reply({ terminals });
      expect(await f.observe()).toBe(false);
    }
  });
  it('preserves uncertainty on host refusal, malformed data or an unrelated anchor', async () => {
    const f = await fixture();
    for (const [body, status] of [['locked', 403], ['{', 200], [{ error: 'unavailable' }, 200],
      [{ terminals: null }, 200]] as const) {
      f.reply(body, status); expect(await f.observe()).toBe(false);
    }
    expect(await observeStoppedTerminal(f.host, { ...f.reference, workspaceId: randomUUID() })).toBe(false);
    expect(await observeStoppedTerminal(f.host, { ...f.reference, terminalName: 'manual' })).toBe(false);
    expect(f.observations()).toBe(4);
  });
  it('keeps unavailable, oversized and timed out observations uncertain', async () => {
    const f = await fixture();
    f.reply('x'.repeat(262145)); expect(await f.observe()).toBe(false);
    vi.mocked(request).mockImplementationOnce(() => { throw new Error('HOST_UNAVAILABLE'); });
    expect(await f.observe()).toBe(false);
    vi.useFakeTimers();
    try {
      const call = Object.assign(new EventEmitter(), {
        end: () => {}, destroy: (error: Error) => { call.emit('error', error); call.emit('close'); },
      });
      vi.mocked(request).mockReturnValueOnce(call as ReturnType<typeof request>);
      const pending = f.observe();
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
