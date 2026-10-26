import { expect, it, vi } from 'vitest';
import { attemptFixture } from '../fixtures/attempt.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';

async function interrupted() {
  const f = await attemptFixture();
  const command = await f.prepare();
  const accepted = await f.pipeline.startAttempt(command.body, command.context);
  await f.pipeline.drain();
  const handle = { passageId: f.storage.getAttempt(accepted.resource.id).passageId };
  const session = f.persistence.getAttemptSession(handle);
  f.storage.interruptAttempts();
  f.issue.id = 'I_after_restart'; f.issue.number = 18;
  return { f, handle, session };
}

it('rediscovers an uncertain terminal before allocation without restoring its session or cleanup authority', async () => {
  const { f, handle, session } = await interrupted();
  try {
    const observe = vi.fn(async () => 'stopped' as const);
    Object.assign(f.execution, { observeManagedTerminal: observe });
    const historicalResult = f.persistence.getResult(handle);
    const command = await f.prepare();
    const next = await f.pipeline.startAttempt(command.body, command.context);
    await f.pipeline.drain();
    const current = f.persistence.getAttemptSession({ passageId: f.storage.getAttempt(next.resource.id).passageId });
    expect(observe).toHaveBeenCalled();
    expect(current.managedTerminalId).toBe(session.managedTerminalId);
    expect(current.terminalId).toBe(session.terminalId);
    expect(current.generation).toBe(session.generation + 1);
    expect(current.ompSessionId).not.toBe(session.ompSessionId);
    expect(f.storage.getAttempt(session.attemptId).result).toBe('interrupted');
    expect(f.persistence.getResult(handle)).toEqual(historicalResult);
    expect(f.db.prepare('SELECT stop_state FROM resources WHERE passage_id=? AND kind=\'terminal\'').get(handle.passageId))
      .toEqual({ stop_state: 'uncertain' });
  } finally { await f.close(); }
});

it.each(['running', 'uncertain'] as const)('blocks a new attempt while a registered terminal is %s', async state => {
  const { f, session } = await interrupted();
  try {
    Object.assign(f.execution, { observeManagedTerminal: vi.fn(async () => state) });
    const command = await f.prepare();
    await expect(f.pipeline.startAttempt(command.body, command.context)).rejects.toMatchObject({ code: 'TERMINAL_AVAILABILITY_UNCONFIRMED' });
    expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 1 });
    expect(f.db.prepare('SELECT state FROM managed_terminals WHERE id=?').get(session.managedTerminalId)).toEqual({ state: 'uncertain' });
  } finally { await f.close(); }
});

it('blocks replacement when a registered terminal is omitted from the connection list', async () => {
  const { f, handle, session } = await interrupted();
  try {
    Object.assign(f.execution, { observeManagedTerminal: vi.fn(async () => 'missing' as const) });
    const command = await f.prepare();
    await expect(f.pipeline.startAttempt(command.body, command.context)).rejects.toMatchObject({ code: 'TERMINAL_AVAILABILITY_UNCONFIRMED' });
    expect(f.db.prepare('SELECT state FROM managed_terminals WHERE id=?').get(session.managedTerminalId)).toEqual({ state: 'uncertain' });
    expect(f.db.prepare("SELECT stop_state FROM resources WHERE passage_id=? AND kind='terminal'").get(handle.passageId)).toEqual({ stop_state: 'uncertain' });
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  } finally { await f.close(); }
});

it('blocks a launch interrupted before its physical identity handshake instead of creating another terminal', async () => {
  const f = await attemptFixture();
  try {
    vi.mocked(f.execution.startPassage).mockImplementation(async request => {
      const handle = { passageId: request.binding.passageId };
      f.persistence.reserve({ handle, binding: request.binding, requestHash: digest(request), state: 'starting',
        roleResource: request.roleResource, terminalName: `factory-${handle.passageId}`, diagnostic: null, effectiveProfile: null, executorVersion: null });
      return f.persistence.getPassage(handle);
    });
    const first = await f.prepare();
    await f.pipeline.startAttempt(first.body, first.context); await f.pipeline.drain();
    f.storage.interruptAttempts();
    f.issue.id = 'I_after_pending_launch'; f.issue.number = 19;
    const next = await f.prepare();
    await expect(f.pipeline.startAttempt(next.body, next.context)).rejects.toMatchObject({ code: 'TERMINAL_AVAILABILITY_UNCONFIRMED' });
    expect(f.db.prepare('SELECT count(*) AS n FROM managed_terminals').get()).toEqual({ n: 2 });
    expect(f.execution.observeManagedTerminal).not.toHaveBeenCalled();
  } finally { await f.close(); }
});

it('rejects a stale observation when the terminal changes during the native query', async () => {
  const { f, session } = await interrupted();
  try {
    Object.assign(f.execution, { observeManagedTerminal: vi.fn(async () => {
      f.db.prepare('UPDATE managed_terminals SET updated_at_ms=updated_at_ms+1 WHERE id=?').run(session.managedTerminalId);
      return 'stopped' as const;
    }) });
    const command = await f.prepare();
    await expect(f.pipeline.startAttempt(command.body, command.context)).rejects.toMatchObject({ code: 'TERMINAL_AVAILABILITY_UNCONFIRMED' });
    expect(f.db.prepare('SELECT state FROM managed_terminals WHERE id=?').get(session.managedTerminalId)).toEqual({ state: 'uncertain' });
  } finally { await f.close(); }
});
