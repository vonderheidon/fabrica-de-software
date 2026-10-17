import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export const verificationLimits = Object.freeze({ timeoutMs: 300_000, outputBytes: 1_048_576, stopGraceMs: 1_000 });
export interface CheckProcessResult {
  state: 'passed' | 'failed' | 'error'; exitCode: number | null; diagnostic: string | null;
  endedAtMs: number; durationMs: number; output: Buffer;
}
export type CheckRunner = (command: string, cwd: string, timeoutMs: number, signal: AbortSignal) => Promise<CheckProcessResult>;

/** Output is check evidence only; never send raw output/errors/environment to application logs. */
export function sanitizeCheckOutput(bytes: Buffer, environment: NodeJS.ProcessEnv = process.env): Buffer {
  let text = bytes.toString('utf8');
  const secrets = Object.entries(environment).filter(([key, value]) => /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY|PRIVATE_KEY|COOKIE|AUTHORIZATION)/i.test(key) && value && value.length >= 4)
    .map(([, value]) => value!).sort((a, b) => b.length - a.length);
  for (const value of secrets) text = text.split(value).join('[REDACTED]');
  text = text.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED]')
    .replace(/(\b(?:authorization|cookie|set-cookie|x-csrf-token|password|secret|token|api[_-]?key)\b\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[REDACTED]');
  return Buffer.from(text, 'utf8');
}

export const runCheck: CheckRunner = (command, cwd, timeoutMs, signal) => new Promise(resolve => {
  const start = performance.now(); const chunks: Buffer[] = []; let size = 0; let diagnostic: string | null = null;
  let done = false; let grace: ReturnType<typeof setTimeout> | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
  const complete = (code: number | null) => {
    if (done) return; done = true; clearTimeout(timer); clearTimeout(grace); signal.removeEventListener('abort', cancel);
    child.stdout?.destroy(); child.stderr?.destroy();
    resolve({ state: diagnostic ? 'error' : code === 0 ? 'passed' : code === null ? 'error' : 'failed', exitCode: code,
      diagnostic: diagnostic ?? (code === null ? 'CHECK_SIGNALLED' : null), endedAtMs: Date.now(), durationMs: Math.max(0, Math.round(performance.now() - start)), output: Buffer.concat(chunks) });
  };
  const stop = (code: string) => {
    if (diagnostic || done) return; diagnostic = code;
    // This requests stop of the owned shell. Descendant termination is deliberately not inferred.
    const stopped = child.kill('SIGKILL');
    if (!stopped) diagnostic = 'CHECK_STOP_UNCONFIRMED';
    grace = setTimeout(() => complete(null), verificationLimits.stopGraceMs);
  };
  const cancel = () => stop('CHECK_CANCELLED_STOP_UNCONFIRMED');
  // The command is captured authorized project configuration, never a control endpoint parameter.
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) if (/^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(name)) environment[name] = value;
  environment.CI = 'true'; environment.NO_COLOR = '1';
  let child: ReturnType<typeof spawn>;
  try { child = spawn(command, { cwd, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: environment }); }
  catch { resolve({ state: 'error', exitCode: null, diagnostic: 'CHECK_LAUNCH_FAILED', endedAtMs: Date.now(), durationMs: 0, output: Buffer.alloc(0) }); return; }
  const collect = (bytes: Buffer) => {
    if (done) return;
    const available = Math.max(0, verificationLimits.outputBytes - size); chunks.push(bytes.subarray(0, available)); size += bytes.length;
    if (size > verificationLimits.outputBytes) stop('CHECK_OUTPUT_LIMIT_STOP_UNCONFIRMED');
  };
  child.stdout?.on('data', collect); child.stderr?.on('data', collect);
  child.on('error', () => { diagnostic = 'CHECK_LAUNCH_FAILED'; complete(null); });
  child.on('close', code => complete(code));
  timer = setTimeout(() => stop('CHECK_TIMEOUT_STOP_UNCONFIRMED'), timeoutMs);
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
});
