import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRoleResources } from '../../roles.js';
import executionExtension from './extension.js';
import type { ExecutionCode } from '../../errors.js';

const seam = vi.hoisted(() => ({
  launch: '',
  frame: undefined as undefined | ((value: unknown) => Promise<void>),
  lost: undefined as undefined | ((code: ExecutionCode) => void),
  socket: undefined as undefined | EventEmitter,
  send: vi.fn(async (_value: unknown) => {}), close: vi.fn(),
}));
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs,
    statSync: (...args: Parameters<typeof fs.statSync>) => args[0] === 'private-launch-fixture' ? { size: Buffer.byteLength(seam.launch) } : fs.statSync(...args),
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) => args[0] === 'private-launch-fixture' ? Buffer.from(seam.launch) : fs.readFileSync(...args),
  };
});
vi.mock('node:net', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  return { connect: () => { seam.socket = new Emitter(); return seam.socket; } };
});
vi.mock('./wire.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./wire.js')>();
  return { ...actual, connectWire: (_socket: unknown, frame: typeof seam.frame, lost: typeof seam.lost) => {
    seam.frame = frame; seam.lost = lost; return { send: seam.send, close: seam.close };
  } };
});

type Api = Parameters<typeof executionExtension>[0];
type Context = Parameters<Parameters<Api['on']>[1]>[1];
const ttyIn = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const ttyOut = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
afterEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks();
  if (ttyIn) Object.defineProperty(process.stdin, 'isTTY', ttyIn); else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (ttyOut) Object.defineProperty(process.stdout, 'isTTY', ttyOut); else Reflect.deleteProperty(process.stdout, 'isTTY');
});
function fixture() {
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  vi.stubEnv('FACTORY_PASSAGE_BOOTSTRAP', 'private-launch-fixture');
  vi.stubEnv('MAESTRI_TERMINAL_ID', randomUUID()); vi.stubEnv('MAESTRI_WORKSPACE_ID', randomUUID());
  const role = loadRoleResources().get('implementer')!;
  seam.launch = JSON.stringify({ protocolVersion: 1, host: '127.0.0.1', port: 12345, token: 'x'.repeat(43),
    cwd: 'C:\\Clone ç 😀', ompVersion: '18.11.1', role, task: 'Long task '.repeat(15000), guidance: 'Exact guidance', gitNexusRequired: true });
  const handlers = new Map<string, Parameters<Api['on']>[1]>();
  const tools = new Map<string, Parameters<Api['registerTool']>[0]>();
  let effort = 'high';
  const api: Api = {
    typebox: { Type: {
      String: opts => ({ ...opts, type: 'string' }), Integer: opts => ({ ...opts, type: 'integer' }), Boolean: opts => ({ ...opts, type: 'boolean' }),
      Literal: value => ({ const: value }), Union: values => ({ anyOf: values }), Array: (items, opts) => ({ ...opts, type: 'array', items }), Object: (properties, opts) => ({ ...opts, type: 'object', properties }),
    } },
    on: (event, handler) => { handlers.set(event, handler); }, registerTool: def => { tools.set(def.name, def); },
    getThinkingLevel: () => effort, sendUserMessage: vi.fn(),
  };
  const context: Context = { mode: 'tui', hasUI: true, cwd: 'C:\\Clone ç 😀', model: { provider: 'provider', id: 'model' },
    sessionManager: { getSessionId: () => '00000000-0000-4000-8000-000000000010' }, ui: { notify: vi.fn() } };
  executionExtension(api);
  const start = async () => { await handlers.get('session_start')!(undefined, context); seam.socket!.emit('connect'); await Promise.resolve(); };
  const call = async (name: string, input: unknown) => tools.get(name)!.execute(randomUUID(), input, new AbortController().signal, undefined, context);
  return { api, context, handlers, tools, start, call, setEffort: (value: string) => { effort = value; } };
}

describe('supported OMP extension on the same TUI', () => {
  it('delivers one correction through the same supported follow-up API and acknowledges its passage', async () => {
    const f = fixture(); await f.start(); await seam.frame!({ type: 'run' });
    const frame = { type: 'continuation', passageId: randomUUID(), task: 'Correct the structured findings; stop writers and submit a new result.' };
    await seam.frame!(frame);
    expect(seam.send).toHaveBeenLastCalledWith({ type: 'continuation-receipt', passageId: frame.passageId });
    expect(f.api.sendUserMessage).toHaveBeenLastCalledWith(frame.task, { deliverAs: 'followUp' });
    expect(f.api.sendUserMessage).toHaveBeenCalledTimes(2);
    await expect(seam.frame!(frame)).rejects.toThrow('TRACKING_LOST');
    await f.handlers.get('session_shutdown')!(undefined, f.context);
  });
  it('refuses the official result while another native/MCP tool is still running, without disabling those tools', async () => {
    const f = fixture(); await f.start(); await seam.frame!({ type: 'run' });
    await f.handlers.get('tool_execution_start')!({ toolCallId: 'writer', toolName: 'bash' }, f.context);
    const frames = seam.send.mock.calls.length;
    expect(await f.call('execution_complete', {})).toMatchObject({ isError: true, details: { accepted: false, code: 'OWNED_TOOLS_RUNNING' } });
    expect(seam.send.mock.calls.length).toBe(frames);
    await f.handlers.get('tool_execution_end')!({ toolCallId: 'writer', toolName: 'bash' }, f.context);
    const pending = f.call('execution_complete', { corrected: true });
    const request = seam.send.mock.calls.at(-1)![0] as { id: string };
    await seam.frame!({ type: 'reply', id: request.id, ok: true, receiptId: randomUUID() });
    expect(await pending).toMatchObject({ details: { accepted: true } });
    await f.handlers.get('session_shutdown')!(undefined, f.context);
  });
  it('registers only the two role schemas, submits the task exactly once after run and preserves native API access', async () => {
    const f = fixture(); expect([...f.tools.keys()]).toEqual(['execution_complete', 'execution_question']);
    await f.start(); expect(f.api.sendUserMessage).not.toHaveBeenCalled();
    expect(seam.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'hello', provider: 'provider', model: 'model', effort: 'high', tui: true }));
    await seam.frame!({ type: 'run' }); expect(f.api.sendUserMessage).toHaveBeenCalledOnce();
    const task = vi.mocked(f.api.sendUserMessage).mock.calls[0]?.[0];
    expect(task).toContain('C:\\Clone ç 😀'); expect(task).toContain('Long task '.repeat(15000));
    await expect(seam.frame!({ type: 'run' })).rejects.toThrow('TRACKING_LOST');
    expect(f.api.sendUserMessage).toHaveBeenCalledOnce();
    await f.handlers.get('session_shutdown')!(undefined, f.context);
  });
  it('returns a correctable error, continues tool calls, and never lets the model set private correlation', async () => {
    const f = fixture(); await f.start(); await seam.frame!({ type: 'run' });
    const pending = f.call('execution_complete', { unexpected: 'payload' });
    const first = seam.send.mock.calls.at(-1)![0] as { id: string; tool: string; payload: unknown };
    expect(Object.keys(first).sort()).toEqual(['id', 'payload', 'tool', 'type']);
    await seam.frame!({ type: 'reply', id: first.id, ok: false, code: 'RESULT_INVALID' });
    expect(await pending).toMatchObject({ isError: true, details: { accepted: false } });
    const corrected = f.call('execution_complete', { corrected: true });
    const next = seam.send.mock.calls.at(-1)![0] as { id: string };
    await seam.frame!({ type: 'reply', id: next.id, ok: true, receiptId: randomUUID() });
    expect(await corrected).toMatchObject({ details: { accepted: true } });
    expect(seam.close).not.toHaveBeenCalled(); await f.handlers.get('session_shutdown')!(undefined, f.context);
  });
  it('routes answers through supported follow-up messages without blocking native TUI interaction', async () => {
    const f = fixture(); await f.start(); await seam.frame!({ type: 'run' });
    const answer = { type: 'answer', questionId: randomUUID(), operationId: randomUUID(), answer: 'Revisão e opção B 😀' };
    await seam.frame!(answer); await seam.frame!(answer);
    expect(f.api.sendUserMessage).toHaveBeenCalledTimes(2); // initial task plus one answer
    expect(f.api.sendUserMessage).toHaveBeenLastCalledWith(expect.stringContaining(answer.answer), { deliverAs: 'followUp' });
    expect(seam.send).toHaveBeenLastCalledWith({ type: 'answer-receipt', operationId: answer.operationId });
    await f.handlers.get('session_shutdown')!(undefined, f.context);
  });
  it('delivers the explicit captured-scope choice and rejects conflicting reuse of the answer identity', async () => {
    const f = fixture(); await f.start(); await seam.frame!({ type: 'run' });
    const answer = { type: 'answer', questionId: randomUUID(), operationId: randomUUID(), answer: 'Human guidance', scopeDigest: 'a'.repeat(64) };
    await seam.frame!(answer);
    expect(f.api.sendUserMessage).toHaveBeenLastCalledWith(expect.stringContaining(`keep exactly the captured criterion IDs and texts (digest ${answer.scopeDigest})`), { deliverAs: 'followUp' });
    await expect(seam.frame!({ ...answer, answer: 'Different guidance' })).rejects.toThrow('ANSWER_CONFLICT');
    expect(f.api.sendUserMessage).toHaveBeenCalledTimes(2); await f.handlers.get('session_shutdown')!(undefined, f.context);
  });
  it('ends pending tool waits on EOF and observes profile/session loss without filtering native commands', async () => {
    const f = fixture(); await f.start(); await seam.frame!({ type: 'run' });
    const pending = f.call('execution_question', {}); seam.lost!('CHANNEL_EOF');
    await expect(pending).rejects.toThrow('CHANNEL_EOF');
    await expect(f.call('execution_complete', {})).rejects.toThrow('TRACKING_LOST');
    await f.handlers.get('session_shutdown')!(undefined, f.context);
    const other = fixture(); await other.start(); await seam.frame!({ type: 'run' }); other.setEffort('low');
    await other.handlers.get('before_agent_start')!(undefined, other.context);
    expect(seam.send).toHaveBeenCalledWith({ type: 'tracking-lost' }); expect(seam.close).toHaveBeenCalled();
  });
  it('refuses a headless/decorative runtime without submitting any task', async () => {
    const f = fixture(); f.context.mode = 'rpc'; f.context.hasUI = false;
    await f.handlers.get('session_start')!(undefined, f.context);
    expect(f.api.sendUserMessage).not.toHaveBeenCalled(); expect(f.context.ui.notify).toHaveBeenCalled();
  });
});
