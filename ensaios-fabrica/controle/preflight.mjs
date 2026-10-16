import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(root, 'ensaio.example.json');
const configRoot = dirname(configPath);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const resolveConfiguredPath = value => resolve(configRoot, value);
const tools = {};
for (const [name, configured] of Object.entries(config.executables)) {
  const executable = isAbsolute(configured) || /[\\/]/.test(configured)
    ? resolveConfiguredPath(configured)
    : configured;
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8', timeout: 10000, windowsHide: true, shell: false,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const version = output.match(/\bv?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\b/)?.[1] ?? null;
  tools[name] = {
    launched: !result.error,
    exitCode: result.status,
    version,
    errorCode: result.error?.code ?? null,
  };
}
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceDir = resolve(resolveConfiguredPath(config.paths.evidence), runId);
await mkdir(evidenceDir, { recursive: true });
await mkdir(resolveConfiguredPath(config.paths.cases), { recursive: true });
const report = {
  runId, kind: 'local-preflight', tools,
  maestriContextPresent: {
    cli: Boolean(process.env.MAESTRI_CLI),
    pipe: Boolean(process.env.MAESTRI_PIPE),
    terminal: Boolean(process.env.MAESTRI_TERMINAL_ID),
  },
  liveAgentStarted: false,
  mcpCallVerified: false,
};
await writeFile(resolve(evidenceDir, 'preflight.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
