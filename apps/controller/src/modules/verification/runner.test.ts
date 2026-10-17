import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { runCheck, sanitizeCheckOutput, verificationLimits } from './runner.js';
import { checkDirectory } from './index.js';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
const paths: string[] = [];
afterEach(async () => { vi.useRealTimers(); vi.mocked(spawn).mockReset(); for (const path of paths.splice(0)) await rm(path, { recursive: true }); });
function processFixture() {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true) });
  vi.mocked(spawn).mockImplementation(() => child as unknown as ReturnType<typeof spawn>);
  return child;
}
describe('bounded configured check process', () => {
  it.each([0, 3])('records actual close with exit %s, keeps fragmented UTF-8 and does not propagate credentials', async code => {
    const child = processFixture(); const task = runCheck('npm run configured', process.cwd(), 1000, new AbortController().signal);
    const bytes = Buffer.from('ação 😀'); child.stdout.write(bytes.subarray(0, 4)); child.stdout.write(bytes.subarray(4)); child.emit('close', code);
    const result = await task; expect(result).toMatchObject({ state: code === 0 ? 'passed' : 'failed', exitCode: code, diagnostic: null });
    expect(result.output.toString()).toBe('ação 😀');
    const options = vi.mocked(spawn).mock.calls[0]?.[1];
    expect(options).toMatchObject({ cwd: process.cwd(), shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    // Compare names only; a failed assertion must never dump inherited values.
    expect(Object.keys(options && typeof options === 'object' && 'env' in options && options.env ? options.env : {}).some(key => /TOKEN|SECRET|PASSWORD|API_KEY|GIT_DIR/.test(key))).toBe(false);
  });
  it('distinguishes launch failure from an executed check rejection', async () => {
    const child = processFixture(); const task = runCheck('configured', process.cwd(), 1000, new AbortController().signal);
    child.emit('error', new Error('NATIVE_PRIVATE_DETAILS'));
    expect(await task).toMatchObject({ state: 'error', exitCode: null, diagnostic: 'CHECK_LAUNCH_FAILED', output: Buffer.alloc(0) });
  });
  it('bounds timeout even when a descendant keeps pipes open, without claiming its death', async () => {
    vi.useFakeTimers(); const child = processFixture(); const task = runCheck('configured', process.cwd(), 20, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(20 + verificationLimits.stopGraceMs);
    expect(await task).toMatchObject({ state: 'error', exitCode: null, diagnostic: 'CHECK_TIMEOUT_STOP_UNCONFIRMED' });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
  it('rejects output overflow rather than confirming truncated success', async () => {
    const child = processFixture(); const task = runCheck('configured', process.cwd(), 1000, new AbortController().signal);
    child.stdout.write(Buffer.alloc(verificationLimits.outputBytes + 1, 65)); child.emit('close', 0);
    const result = await task; expect(result.state).toBe('error'); expect(result.diagnostic).toBe('CHECK_OUTPUT_LIMIT_STOP_UNCONFIRMED'); expect(result.output.length).toBe(verificationLimits.outputBytes);
  });
  it('aborts owned execution and treats a missing exit code as technical error', async () => {
    const child = processFixture(); const abort = new AbortController(); const task = runCheck('configured', process.cwd(), 1000, abort.signal);
    abort.abort(); child.emit('close', null);
    expect(await task).toMatchObject({ state: 'error', diagnostic: 'CHECK_CANCELLED_STOP_UNCONFIRMED' });
  });
  it('redacts synthetic inherited secrets, header credentials, provider keys and PEM blocks before evidence', () => {
    const output = sanitizeCheckOutput(Buffer.from('SYNTHETIC_SECRET_123\nAuthorization: Bearer SYNTHETIC_BEARER\nhttps://user:synthetic@host/\n-----BEGIN PRIVATE KEY-----\nSYNTHETIC_PEM\n-----END PRIVATE KEY-----\nUseful evidence'), { API_KEY: 'SYNTHETIC_SECRET_123' }).toString();
    expect(output).not.toContain('SYNTHETIC'); expect(output).toContain('Useful evidence'); expect(output).toContain('[REDACTED]');
  });
});
describe('contained configured cwd', () => {
  it.each(['../outside', 'a/../../outside', '/absolute', 'C:/absolute', 'a:ads', 'a\\b', '.git', 'x\n'])('refuses %s', async path => {
    await expect(checkDirectory(process.cwd(), path, async p => p)).rejects.toMatchObject({ code: 'CHECK_CWD_INVALID' });
  });
  it('accepts only existing plain directories and rejects canonical redirection', async () => {
    await mkdir(join(process.cwd(), '.cache'), { recursive: true }); const path = await mkdtemp(join(process.cwd(), '.cache/cwd-')); paths.push(path);
    await mkdir(join(path, 'sub ç')); expect(await checkDirectory(path, 'sub ç', async p => p)).toBe(join(path, 'sub ç'));
    await expect(checkDirectory(path, 'missing', async p => p)).rejects.toMatchObject({ code: 'CHECK_CWD_UNAVAILABLE' });
    await expect(checkDirectory(path, 'sub ç', async p => p.endsWith('sub ç') ? join(path, 'elsewhere') : p)).rejects.toMatchObject({ code: 'CHECK_CWD_INVALID' });
  });
});
