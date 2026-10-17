import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runCheck, sanitizeCheckOutput } from '../dist/apps/controller/src/modules/verification/runner.js';
import { createArtifacts } from '../dist/apps/controller/src/modules/verification/artifacts.js';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(resolve(root, '.cache'), { recursive: true });
const data = await mkdtemp(resolve(root, '.cache/verification-smoke-'));
try {
  const cwd = resolve(data, 'check ç space'); await mkdir(cwd);
  const script = resolve(cwd, 'check.mjs');
  await writeFile(script, "process.stdout.write(JSON.stringify({cwd:process.cwd(),text:'ação 😀'}));process.exitCode=Number(process.argv[2]);", 'utf8');
  const quote = value => {
    if (/["%!\r\n]/.test(value)) throw new Error('SMOKE_PATH_UNSUPPORTED');
    return `"${value}"`;
  };
  const command = `${quote(process.execPath)} ${quote(script)}`;
  const passed = await runCheck(`${command} 0`, cwd, 15_000, new AbortController().signal);
  assert.equal(passed.state, 'passed'); assert.equal(passed.exitCode, 0);
  assert.deepEqual(JSON.parse(passed.output.toString('utf8')), { cwd, text: 'ação 😀' });
  const failed = await runCheck(`${command} 7`, cwd, 15_000, new AbortController().signal);
  assert.equal(failed.state, 'failed'); assert.equal(failed.exitCode, 7);
  let canonicalization = 'real';
  let canonicalize = realpath;
  try { await realpath(data); } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EPERM')) throw error;
    canonicalization = 'controlled_after_EPERM'; canonicalize = async path => path;
  }
  const files = createArtifacts(data, canonicalize);
  const artifact = await files.write({ attemptId: randomUUID(), deliveryId: randomUUID(), checkId: randomUUID() }, sanitizeCheckOutput(passed.output));
  assert.deepEqual(await files.read(artifact), passed.output);
  const path = resolve(data, 'artifacts', artifact.pathRelative); const bytes = await readFile(path);
  await writeFile(path, Buffer.alloc(bytes.length, 65));
  await assert.rejects(files.read(artifact), { code: 'ARTIFACT_INTEGRITY_FAILED' });
  await rm(path); await assert.rejects(files.read(artifact), { code: 'ARTIFACT_MISSING' });
  console.log(JSON.stringify({ evidence: 'VERIFICATION_COMPILED', nativeChecks: ['passed', 'failed'], unicodeCwd: true,
    artifactRenameSyncChecksum: 'real', canonicalization, gitMaterialization: 'not_executed', maestriOmpIntegration: 'not_executed' }));
} finally { await rm(data, { recursive: true }); }
