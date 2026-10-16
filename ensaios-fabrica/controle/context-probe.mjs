import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [runId, mode] = process.argv.slice(2);
if (!/^\d{8}T\d{9}Z$/.test(runId ?? '') || !['outside', 'inside', 'maestro', 'child'].includes(mode)) throw new Error('Expected runId and outside|inside|maestro|child');
const evidence = resolve(root, 'evidencias', runId, 'CTX-01', mode);
if (existsSync(evidence)) throw new Error('Run scenario already exists');
mkdirSync(evidence, { recursive: true });
const cli = process.env.MAESTRI_CLI || 'maestri';
const launchedCwd = process.cwd();
process.chdir(root);
function invoke(name, args, env) {
  const before = Date.now();
  const result = spawnSync(cli, args, { env, encoding: 'utf8', timeout: 12000, windowsHide: true, shell: false });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const record = { name, args, exitCode: result.status, errorCode: result.error?.code ?? null, elapsedMs: Date.now() - before, output: text };
  writeFileSync(resolve(evidence, `${name}.json`), JSON.stringify(record, null, 2));
  return record;
}
const context = {
  mode, at: new Date().toISOString(), pid: process.pid, cwd: process.cwd(), launchedCwd, root,
  terminalId: process.env.MAESTRI_TERMINAL_ID ?? null,
  contextPresent: { cli: !!process.env.MAESTRI_CLI, pipe: !!process.env.MAESTRI_PIPE, terminal: !!process.env.MAESTRI_TERMINAL_ID },
};
writeFileSync(resolve(evidence, 'context.json'), JSON.stringify(context, null, 2));
invoke('version', ['--version'], process.env);
invoke('debug-valid', ['debug'], process.env);
invoke('help-recruit', ['recruit', '--help'], process.env);
const missing = { ...process.env };
delete missing.MAESTRI_PIPE;
invoke('missing-pipe', ['list'], missing);
invoke('debug-missing', ['debug'], missing);
if (['inside', 'maestro'].includes(mode)) {
  invoke('list-valid', ['list'], process.env);
  const stale = { ...process.env, MAESTRI_PIPE: `\\\\.\\pipe\\ensaio-inexistente-${runId}` };
  invoke('stale-pipe', ['list'], stale);
  invoke('debug-stale', ['debug'], stale);
  invoke('unknown-terminal', ['list'], { ...process.env, MAESTRI_TERMINAL_ID: '00000000-0000-0000-0000-000000000000' });
}
if (mode === 'maestro') {
  const command = `node "${fileURLToPath(import.meta.url)}" ${runId} child`;
  invoke('recruit-child', ['recruit', `Ensaio Filho ${runId}`, '--command', command, '--dir', root], process.env);
  invoke('list-after-recruit', ['list'], process.env);
}
console.log(`CTX-PROBE-COMPLETE ${mode} ${runId}`);
