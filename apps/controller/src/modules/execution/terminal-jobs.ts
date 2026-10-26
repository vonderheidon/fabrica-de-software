import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import type { ExecutionHost } from './index.js';
import { ExecutionError } from './errors.js';
import { observeStoppedTerminal } from './terminal-observation.js';

type Reference = { workspaceId: string; terminalName: string; terminalId?: string; generation?: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Stop authority remains process-local; reuse requires a fresh observation after restart. */
export function withWindowsTerminalJobs(host: ExecutionHost, cwd: string): ExecutionHost {
  if (process.platform !== 'win32' || host.prepareTerminalLaunch || host.stopTerminal || host.confirmStoppedTerminal) return host;
  const executable = fileURLToPath(new URL('../../../../../resources/execution/terminal-job.exe', import.meta.url));
  const jobs = new Map<string, { generation: number; terminalId?: string; ask: (command: string) => Promise<string>; close: () => void }>();
  const key = (reference: Reference) => `${reference.workspaceId.toLowerCase()}/${reference.terminalName}`;
  const find = (reference: Reference) => {
    if (!reference.terminalId || !uuid.test(reference.terminalId)) throw new ExecutionError('RESOURCE_INVALID');
    const job = jobs.get(key(reference));
    if (!job || job.generation !== reference.generation || job.terminalId !== reference.terminalId.toLowerCase()) throw new ExecutionError('TRACKING_LOST');
    return job;
  };
  const stop = async (job: NonNullable<ReturnType<typeof find>>) => {
    let reply = await job.ask('stop'); const deadline = Date.now() + 4000;
    while (reply !== 'stopped' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20)); reply = await job.ask('check');
    }
    return reply === 'stopped';
  };
  return {
    ...host,
    prepareTerminalLaunch: async (reference, command) => {
      if (!uuid.test(reference.workspaceId) || !/^factory-[0-9a-f-]{36}$/i.test(reference.terminalName) || !Number.isSafeInteger(reference.generation) || reference.generation! < 1) throw new ExecutionError('RESOURCE_INVALID');
      const previous = jobs.get(key(reference));
      if (previous && (previous.generation > reference.generation! || await previous.ask('check') !== 'stopped')) throw new ExecutionError('TRACKING_LOST');
      previous?.close(); jobs.delete(key(reference));
      const id = randomUUID();
      const child = spawn(executable, ['hold', id], { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = createInterface({ input: child.stdout });
      let pending: { resolve: (line: string) => void; reject: () => void } | undefined;
      let dead = false;
      const fail = () => { dead = true; pending?.reject(); pending = undefined; };
      child.on('error', fail); child.on('exit', fail);
      lines.on('line', line => { const current = pending; pending = undefined; current?.resolve(line); });
      child.stdin.on('error', fail);
      const receive = () => new Promise<string>((resolve, reject) => {
        if (dead || pending) { reject(new ExecutionError('TRACKING_LOST')); return; }
        const timer = setTimeout(() => { fail(); child.stdin.end(); }, 5000);
        pending = { resolve: line => { clearTimeout(timer); resolve(line); }, reject: () => { clearTimeout(timer); reject(new ExecutionError('TRACKING_LOST')); } };
      });
      try {
        if (await receive() !== 'ready') throw new ExecutionError('CLI_UNAVAILABLE');
      } catch (error) { child.stdin.end(); throw error; }
      let tail = Promise.resolve();
      const ask = (request: string) => {
        const result = tail.then(async () => { const reply = receive(); child.stdin.write(`${request}\n`); return reply; });
        tail = result.then(() => {}, () => {});
        return result;
      };
      jobs.set(key(reference), { generation: reference.generation!, ask, close: () => child.stdin.end() });
      const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
      return `& ${quote(executable)} attach ${quote(id)} $PID; if ($LASTEXITCODE -ne 0) { exit 1 }; ${command}`;
    },
    bindTerminalProcess: reference => {
      const job = jobs.get(key(reference));
      if (!job || job.generation !== reference.generation || !uuid.test(reference.terminalId) || (job.terminalId && job.terminalId !== reference.terminalId.toLowerCase())) throw new ExecutionError('TRACKING_LOST');
      job.terminalId = reference.terminalId.toLowerCase();
    },
    stopTerminal: async reference => { await stop(find(reference)); },
    stopPendingTerminal: async reference => {
      const job = jobs.get(key(reference));
      if (!job || job.generation !== reference.generation || job.terminalId) return false;
      return stop(job);
    },
    confirmStoppedTerminal: async reference => {
      try {
        const job = jobs.get(key(reference));
        // The prior owner's last Job Object handle closes on restart, stopping its writers.
        // The canvas identity may still be running a different process, so observe it now.
        if (!job) return observeStoppedTerminal(host, reference);
        if (!job || !reference.terminalId || job.terminalId !== reference.terminalId.toLowerCase() ||
          (reference.generation !== job.generation && reference.generation !== job.generation + 1)) return false;
        return await job.ask('check') === 'stopped';
      } catch { return false; }
    },
    closeTerminalProcesses: async () => { for (const job of jobs.values()) job.close(); jobs.clear(); },
  };
}
