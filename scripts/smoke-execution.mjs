import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { connect } from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { loadRoleResources } from '../dist/apps/controller/src/modules/execution/roles.js';
import { openChannel } from '../dist/apps/controller/src/modules/execution/adapters/maestri-omp/channel.js';
import { launchCommand } from '../dist/apps/controller/src/modules/execution/adapters/maestri-omp/native.js';
import { JsonLines, executionLimits } from '../dist/apps/controller/src/modules/execution/adapters/maestri-omp/wire.js';

// Opt-in local sockets and a Node argv recorder in PowerShell. No OMP/provider,
// Maestri recruitment, Git/GH, ACL change or external service is exercised here.
const directory = mkdtempSync(join(tmpdir(), 'factory-execution-'));
const previousCwd = process.cwd();
let channel;
let socket;
let child;
const deadline = (promise, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Local smoke deadline exceeded')), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
try {
  process.chdir(directory);
  const roles = loadRoleResources();
  assert.equal(roles.size, 2);
  const seen = [];
  let finishFrame;
  const received = new Promise(resolve => { finishFrame = resolve; });
  const losses = [];
  channel = await openChannel({
    hello: async frame => { assert.equal(frame.cwd, directory); seen.push('hello'); await channel.send({ type: 'run' }); },
    frame: async frame => { seen.push(frame); finishFrame(); },
    lost: code => losses.push(code),
  });
  assert(channel.port > 0);
  socket = connect({ host: '127.0.0.1', port: channel.port });
  const lines = new JsonLines();
  let finishRun;
  const run = new Promise(resolve => { finishRun = resolve; });
  socket.on('data', bytes => { for (const frame of lines.feed(bytes)) { assert.deepEqual(frame, { type: 'run' }); finishRun(); } });
  await deadline(new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); }));
  const hello = { type: 'hello', protocolVersion: 1, token: channel.token, sessionId: randomUUID(), terminalId: randomUUID(), workspaceId: randomUUID(),
    cwd: directory, provider: 'fixture', model: 'argv-recorder', effort: 'high', tui: true, roleDigest: roles.get('implementer').reference.sha256, ompVersion: '18.11.1' };
  socket.write(JSON.stringify(hello) + '\n');
  await deadline(run);
  const payload = { type: 'fixture', text: 'Implementação, revisão e ação 😀🧪' };
  const bytes = Buffer.from(JSON.stringify(payload) + '\n');
  for (let i = 0; i < bytes.length; i += 3) socket.write(bytes.subarray(i, i + 3));
  await deadline(received);
  assert.deepEqual(seen, ['hello', payload]);
  socket.end();
  await deadline(new Promise(resolve => socket.once('close', resolve)));
  assert.deepEqual(losses, ['CHANNEL_EOF']);
  await channel.close(); channel = undefined;

  // Exercise terminal diagnostics over authenticated real loopback sockets.
  // No provider/runtime capability is exported or written into evidence.
  const transportDiagnostics = {};
  for (const kind of ['malformed', 'invalidUtf8', 'oversize', 'incompleteEof']) {
    let finishHello; let finishLoss;
    const authenticated = new Promise(resolve => { finishHello = resolve; });
    const lost = new Promise(resolve => { finishLoss = resolve; });
    const codes = [];
    let unexpectedFrames = 0;
    channel = await openChannel({
      hello: async () => { finishHello(); },
      frame: async () => { unexpectedFrames += 1; },
      lost: code => { codes.push(code); finishLoss(code); },
    });
    socket = connect({ host: '127.0.0.1', port: channel.port });
    let socketError = null;
    socket.on('error', error => { socketError = error.code; });
    const closed = new Promise(resolve => socket.once('close', resolve));
    await deadline(new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); }));
    socket.write(JSON.stringify({ ...hello, token: channel.token }) + '\n');
    await deadline(authenticated);
    if (kind === 'malformed') socket.write('{invalid}\n');
    else if (kind === 'invalidUtf8') socket.write(Buffer.from([0xff, 10]));
    else if (kind === 'oversize') socket.write(Buffer.alloc(executionLimits.frameBytes + 1, 65));
    else socket.end('{"incomplete":');
    const expected = kind === 'oversize' ? 'FRAME_OVERSIZE' : kind === 'incompleteEof' ? 'CHANNEL_EOF' : 'FRAME_INVALID';
    assert.equal(await deadline(lost), expected);
    await deadline(closed);
    assert.deepEqual(codes, [expected]);
    assert.equal(unexpectedFrames, 0);
    assert(socketError === null || socketError === 'ECONNRESET');
    await assert.rejects(channel.send({ type: 'probe-after-close' }), { code: 'CHANNEL_EOF' });
    transportDiagnostics[kind] = expected;
    await channel.close(); channel = undefined;
  }

  let windowsLaunch = 'not_applicable';
  if (process.platform === 'win32') {
    const cwd = join(directory, "Ambiente ç 😀 O'Brien"); mkdirSync(cwd);
    const recorder = join(cwd, 'argv recorder.cjs');
    const output = join(cwd, 'observed.json');
    const argv = [recorder, 'espaço e ação 😀', 'valor&literal', '$(literal)', output];
    writeFileSync(recorder, "require('node:fs').writeFileSync(process.argv.at(-1),JSON.stringify({argv:process.argv.slice(1),cwd:process.cwd(),bootstrap:process.env.FACTORY_PASSAGE_BOOTSTRAP}),'utf8');", 'utf8');
    const bootstrapPath = join(cwd, 'launch.json');
    writeFileSync(bootstrapPath, JSON.stringify({ cwd, ompExecutable: process.execPath, args: argv }), { encoding: 'utf8', mode: 0o600 });
    const powershell = resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const command = launchCommand(powershell, bootstrapPath);
    // Execute the complete terminal command so quoting and invocation are exercised too.
    child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { cwd: directory, windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'ignore'] });
    const exit = await deadline(new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); }), 15_000);
    assert.equal(exit, 0);
    const observed = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(observed.argv, argv);
    assert.equal(observed.cwd, cwd);
    assert.equal(observed.bootstrap, bootstrapPath);
    windowsLaunch = 'passed_with_node_fixture';
  }
  console.log(JSON.stringify({ roles: 'distributed_from_unrelated_cwd', loopbackUtf8: 'passed', eof: 'diagnosed', transportDiagnostics, windowsLaunch,
    maestriOmpIntegration: 'not_executed' }));
} finally {
  socket?.destroy();
  await channel?.close();
  if (child && child.exitCode === null) child.kill();
  process.chdir(previousCwd);
  rmSync(directory, { recursive: true });
}
