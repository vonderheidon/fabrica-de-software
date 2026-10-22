import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, process.argv[2] ?? '.cache/observation-baseline-runs');
await mkdir(output, { recursive: true });
const measuredFiles = [
  'apps/controller/src/modules/projects/queue.ts', 'apps/controller/src/modules/github/client.ts',
  'apps/controller/src/modules/github/transport.ts', 'apps/web/src/features/queue/useQueue.ts',
  'apps/controller/src/modules/github/queries.ts', 'apps/controller/src/modules/storage/index.ts',
  'tests/fixtures/observation-baseline.ts', 'tests/fixtures/backend-measurement.ts', 'tests/fixtures/observation-wire.ts',
  'tests/acceptance/persistence-maintenance.test.ts',
  'apps/web/src/features/operations/useOperation.ts', 'apps/web/src/features/operations/useActiveAttempt.ts',
  'apps/web/src/features/operations/observation-baseline.test.ts', 'tests/integration/observation-matrix.test.ts',
  'tests/integration/observation-regressions.test.ts', 'tests/integration/queue-scheduler.test.ts',
  'tests/integration/publication.test.ts',
];
const hashes = Object.fromEntries(await Promise.all(measuredFiles.map(async name => [name,
  createHash('sha256').update(await readFile(join(root, name))).digest('hex')])));
const head = (await readFile(join(root, '.git', 'HEAD'), 'utf8')).trim();
const revision = head.startsWith('ref: ') ? (await readFile(join(root, '.git', head.slice(5)), 'utf8')).trim() : head;
const runs = [];
for (const mode of ['disabled', 'enabled']) for (let repetition = 1; repetition <= 5; repetition++) {
  const name = `${mode}-${repetition}`;
  const files = [
    'tests/integration/observation-matrix.test.ts', 'tests/integration/observation-backend.test.ts',
    'tests/integration/backend-measurement.test.ts', 'tests/integration/observation-baseline.test.ts',
    'apps/web/src/features/operations/observation-baseline.test.ts',
    ...(mode === 'disabled' ? ['tests/acceptance/persistence-maintenance.test.ts'] : []),
  ];
  const args = [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...files, '--reporter=dot'];
  let stdout = '';
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, OBSERVATION_AUTOMATION: mode }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stdout += chunk; });
  const exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); });
  await writeFile(join(output, `${name}.log`), stdout);
  if (exitCode !== 0) throw new Error(`Baseline ${name} failed; inspect .cache/observation-baseline-runs/${name}.log`);
  const tags = ['BACKEND_MATRIX_REPORT', 'BACKEND_SCOPE_REPORT', 'WEB_WINDOW_REPORT', 'AC29_REPORT', 'GROUPED_COMPARISON'];
  const records = [];
  for (const line of stdout.split(/\r?\n/)) for (const tag of tags) {
    const index = line.indexOf(tag + ' ');
    if (index >= 0) records.push({ tag, value: JSON.parse(line.slice(index + tag.length + 1)) });
  }
  if (records.filter(row => row.tag === 'BACKEND_MATRIX_REPORT').length !== 3
    || records.filter(row => row.tag === 'WEB_WINDOW_REPORT').length !== 16
    || (mode === 'disabled' && !records.some(row => row.tag === 'AC29_REPORT'))) throw new Error(`Missing measurements: ${name}`);
  runs.push({ mode, repetition, exitCode, records });
  await writeFile(join(output, `${name}.json`), JSON.stringify(runs.at(-1), null, 2));
  console.log(`Baseline ${name}: passed; ${records.length} measurement records`);
}
const result = { formatVersion: 1, revision, node: process.version, platform: process.platform, arch: process.arch,
  capturedAt: new Date().toISOString(), hashes, runs };
await writeFile(resolve(output, 'results.json'), JSON.stringify(result, null, 2));
console.log(`Measurements complete: ${join(output, 'results.json')}`);
