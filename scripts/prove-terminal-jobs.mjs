import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { withWindowsTerminalJobs } from '../dist/apps/controller/src/modules/execution/index.js';

const directory = resolve('.cache', `terminal-jobs-${Date.now()}`);
await mkdir(directory, { recursive: true });
const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const bridge = withWindowsTerminalJobs({ maestriExecutable: 'unused.exe', ompExecutable: process.execPath, powershellExecutable: powershell, inheritedEnvironment: process.env }, directory);
const reference = { workspaceId: randomUUID(), terminalName: `factory-${randomUUID()}`, terminalId: randomUUID(), generation: 1 };
const quote = value => `'${value.replaceAll("'", "''")}'`;
const worker = join(directory, 'worker.cjs');
await writeFile(worker, `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[2],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`);
const waitFor = async action => {
  const until = Date.now() + 10000;
  while (Date.now() < until) { try { const result = await action(); if (result) return result; } catch {} await new Promise(r => setTimeout(r, 50)); }
  throw new Error('PROOF_TIMEOUT');
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
try {
  for (let round = 1; round <= 2; round++) {
    reference.generation = round;
    const record = join(directory, `pids-${round}.json`);
    const command = await bridge.prepareTerminalLaunch(reference, `& ${quote(process.execPath)} ${quote(worker)} ${quote(record)}`);
    const shell = spawn(powershell, ['-NoLogo', '-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { cwd: directory, windowsHide: true, stdio: 'ignore' });
    const pids = await waitFor(async () => JSON.parse(await readFile(record, 'utf8')));
    bridge.bindTerminalProcess(reference);
    assert.equal(await bridge.confirmStoppedTerminal(reference), false);
    assert.equal(await bridge.confirmStoppedTerminal({ ...reference, terminalId: randomUUID() }), false);
    assert(pids.every(alive));
    await assert.rejects(bridge.prepareTerminalLaunch(reference, 'must not replace active processes'));
    assert(pids.every(alive));
    if (round === 2) {
      await assert.rejects(bridge.stopTerminal({ ...reference, generation: 1 }));
      assert(pids.every(alive));
    }
    await bridge.stopTerminal(reference);
    await waitFor(() => bridge.confirmStoppedTerminal(reference));
    await waitFor(() => !alive(shell.pid) && pids.every(pid => !alive(pid)));
    console.log(JSON.stringify({ round, stopped: true, parentAndChildStopped: true }));
  }
  const pendingReference = { ...reference, generation: 3 };
  const pendingFile = join(directory, 'pending-pids.json');
  const pendingCommand = await bridge.prepareTerminalLaunch(pendingReference, `& ${quote(process.execPath)} ${quote(worker)} ${quote(pendingFile)}`);
  const pendingShell = spawn(powershell, ['-NoLogo', '-NoProfile', '-EncodedCommand', Buffer.from(pendingCommand, 'utf16le').toString('base64')], { cwd: directory, windowsHide: true, stdio: 'ignore' });
  const pendingPids = await waitFor(async () => JSON.parse(await readFile(pendingFile, 'utf8')));
  assert.equal(await bridge.stopPendingTerminal(pendingReference), true);
  await waitFor(() => !alive(pendingShell.pid) && pendingPids.every(pid => !alive(pid)));
  const lateReference = { workspaceId: randomUUID(), terminalName: `factory-${randomUUID()}`, generation: 1 };
  const lateFile = join(directory, 'late-pids.json');
  const lateCommand = await bridge.prepareTerminalLaunch(lateReference, `& ${quote(process.execPath)} ${quote(worker)} ${quote(lateFile)}`);
  assert.equal(await bridge.stopPendingTerminal(lateReference), false);
  const lateShell = spawn(powershell, ['-NoLogo', '-NoProfile', '-EncodedCommand', Buffer.from(lateCommand, 'utf16le').toString('base64')], { cwd: directory, windowsHide: true, stdio: 'ignore' });
  const lateExit = await new Promise((resolve, reject) => { lateShell.once('exit', resolve); lateShell.once('error', reject); });
  assert.notEqual(lateExit, 0);
  await assert.rejects(readFile(lateFile, 'utf8'), { code: 'ENOENT' });
  await writeFile(join(directory, 'result.json'), JSON.stringify({ ok: true, rounds: 2, activeReplacementRejected: true, foreignIdentityRejected: true, processTreeStopped: true, beforeHandshakeStop: true, lateLaunchRejected: true, historicalStopRejected: true }));
  console.log(JSON.stringify({ evidence: directory }));
} finally { await bridge.closeTerminalProcesses(); }
