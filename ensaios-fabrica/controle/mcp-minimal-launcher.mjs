import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [audit, cwd] = process.argv.slice(2);
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
env.PATH = dirname(process.execPath);
const secret = randomBytes(32).toString('hex');
env.ENSAIO_CONFIGURED_SECRET = secret;
const digest = createHash('sha256').update(secret).digest('hex');
const log = event => appendFileSync(audit, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
log({ event: 'launcher-start', pid: process.pid, parentPid: process.ppid, parentMarkerPresent: !!process.env.ENSAIO_PARENT_ONLY, maestriContextPresent: !!process.env.MAESTRI_PIPE, childEnvironmentNames: Object.keys(env) });
const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'tui-env-server.mjs'), audit, digest], { cwd, env, stdio: 'inherit', windowsHide: true, shell: false });
log({ event: 'server-spawn', pid: child.pid, parentPid: process.pid });
child.on('error', error => { log({ event: 'spawn-error', code: error.code }); process.exitCode = 1; });
child.on('exit', (code, signal) => { log({ event: 'server-exit', pid: child.pid, code, signal }); process.exitCode = code ?? 1; });
