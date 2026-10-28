import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import { attemptFixture } from '../fixtures/attempt.js';
import { withWindowsTerminalJobs } from '../../dist/apps/controller/src/modules/execution/index.js';
import { createMaestriOmp } from '../../dist/apps/controller/src/modules/execution/adapters/maestri-omp/adapter.js';
import { openChannel } from '../../dist/apps/controller/src/modules/execution/adapters/maestri-omp/channel.js';
import { loadRoleResources } from '../../dist/apps/controller/src/modules/execution/roles.js';
import { createGitReader } from '../../dist/apps/controller/src/modules/workspaces/git.js';
import { createWorkspacePreparer } from '../../dist/apps/controller/src/modules/workspaces/prepare.js';
import { createCapturer } from '../../dist/apps/controller/src/modules/workspaces/capture.js';
import { createAttemptMaterializer } from '../../dist/apps/controller/src/modules/workspaces/materialize.js';
import { createDeliveryDiff } from '../../dist/apps/controller/src/modules/workspaces/diff.js';

function recordEvidence(evidence: string, db: Database.Database, attemptId: string, directory: string) {
  const progress = JSON.parse(readFileSync(join(evidence, 'progress.json'), 'utf8')) as { phase: string; round: number };
  expect(progress).toMatchObject({ phase: 'publishing', round: 3 });
  const sessions = db.prepare('SELECT s.role,s.omp_session_id,t.terminal_id,t.workspace_id FROM attempt_sessions s JOIN managed_terminals t ON t.id=s.managed_terminal_id WHERE s.attempt_id=?').all(attemptId);
  const passages = db.prepare('SELECT role,round_number,attempt_session_id,session_source_id FROM passages WHERE attempt_id=? ORDER BY role,round_number').all(attemptId);
  expect(sessions).toHaveLength(2); expect(passages).toHaveLength(6);
  expect(db.prepare('SELECT count(*) AS n FROM passage_results r JOIN passages p ON p.id=r.passage_id WHERE p.attempt_id=?').get(attemptId)).toEqual({ n: 6 });
  expect(db.prepare("SELECT count(*) AS n FROM reviews WHERE attempt_id=? AND state='approved'").get(attemptId)).toEqual({ n: 1 });
  const trace = JSON.parse(readFileSync(join(evidence, 'bridge-trace.json'), 'utf8')) as { name: string; identity?: { cwd: string; sessionId: string; roleDigest: string; provider: string; model: string; effort: string } }[];
  const identities = trace.filter(item => item.name === 'hello').map(item => item.identity!);
  expect(identities).toHaveLength(6); expect(new Set(identities.map(item => item.cwd)).size).toBe(1);
  for (const role of new Set(identities.map(item => item.roleDigest))) expect(new Set(identities.filter(item => item.roleDigest === role).map(item => item.sessionId)).size).toBe(1);
  for (const item of identities) expect(item).toMatchObject({ provider: 'openai-codex', model: 'gpt-6-luna', effort: 'high' });
  expect(existsSync(join(directory, 'work', attemptId, 'reviews'))).toBe(false);
  expect(readFileSync(join(directory, 'work', attemptId, 'implementation', 'value.txt'), 'utf8').trim()).toBe('3');
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({ ok: true, profile: 'openai-codex/gpt-6-luna/high', sessions, passages, singleCheckout: true,
    limits: ['GitHub authority is a controlled fixture port; Git clone/capture/diff/integrity, OMP, Maestri, SQLite, shared cwd and Windows process jobs are real.'], dataDirectory: directory }, null, 2));
}

it('continues both real OMP conversations over three versions with native process termination', async () => {
  if (process.env.FACTORY_REAL_SESSION_RECHECK) {
    const evidence = resolve(process.env.FACTORY_REAL_SESSION_RECHECK);
    if (!evidence.startsWith(resolve('.cache') + sep)) throw new Error('PROOF_PATH_INVALID');
    const directory = join(evidence, readdirSync(evidence).find(name => name.startsWith('factory-attempt-'))!);
    const db = new Database(join(directory, 'factory.sqlite'), { readonly: true });
    try { const row = db.prepare('SELECT id FROM attempts').get() as { id: string }; recordEvidence(evidence, db, row.id, directory); }
    finally { db.close(); }
    return;
  }
  if (process.env.FACTORY_REAL_SESSION_PROOF !== 'authorized') throw new Error('REAL_SESSION_PROOF_NOT_AUTHORIZED');
  const evidence = resolve('.cache', `session-real-${Date.now()}`); mkdirSync(evidence, { recursive: true });
  const seed = join(evidence, 'seed'); mkdirSync(seed);
  const gitExe = process.env.FACTORY_GIT_EXE!;
  const setupGit = (args: string[]) => {
    const result = spawnSync(gitExe, args, { cwd: seed, shell: false, windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('PROOF_GIT_SETUP_FAILED'); return result.stdout.trim();
  };
  setupGit(['init', '-b', 'main']); writeFileSync(join(seed, 'value.txt'), '0'); writeFileSync(join(seed, '.gitignore'), '.factory-evidence/\n.cache/\nnode_modules/\n.omp/\n');
  setupGit(['add', '--', 'value.txt', '.gitignore']); setupGit(['-c', 'user.name=Factory proof', '-c', 'user.email=proof@factory.invalid', 'commit', '-m', 'Proof baseline']);
  const f = await attemptFixture(evidence, setupGit(['rev-parse', 'HEAD']));
  const git = createGitReader({ kind: 'windows_keyring', executable: gitExe });
  const shared = createAttemptMaterializer(f.directory, git);
  const profileChanges = f.storage.getGlobalConfiguration().view.profiles.map(profile => ({ action: 'update' as const, id: profile.id,
    changes: { provider: 'openai-codex', model: 'gpt-6-luna', effort: 'high',
      guidance: `This is an authorized tiny runtime proof. Stay in the assigned cwd. Use native tools only. Do not use network, Git, MCPs or subagents. Do not change model or session. ${profile.profile_type === 'implementer'
        ? 'Write value.txt with 1 initially, then increment its integer by one for each correction. Read it back. Report execution_complete with formatVersion 1, writesStopped true, both ac-1 and ac-2 passed, checks [], and findingResponses for every supplied finding id on corrections. Do not do anything after completing.'
        : 'Read value.txt using a native tool, never edit files. This is a deliberately staged transport proof, driven by task.delivery.round. In round 1 reject with both ac-1/ac-2 failed and one blocking finding key stage-one, category correctness, asking the producer to write integer 2. In round 2 reject with both criteria failed and one blocking finding key stage-two asking integer 3, even if it is already 3: two correction exchanges are required by this proof. In round 3 approve only if the integer is 3, both criteria passed and findings []. Always resolve every supplied previous finding id via resolutions as resolved when its expected integer was reached. Use formatVersion 1 and execution_complete. Do not do anything after completing.'}` } }));
  f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: f.storage.getGlobalConfiguration().etag, changes: {}, body: { changes: {}, profile_changes: profileChanges } });
  const host = withWindowsTerminalJobs({ maestriExecutable: process.env.FACTORY_MAESTRI_EXE!, ompExecutable: process.env.FACTORY_OMP_EXE!,
    powershellExecutable: join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), inheritedEnvironment: process.env }, f.directory);
  const trace: unknown[] = [];
  for (const name of ['prepareTerminalLaunch', 'stopTerminal', 'confirmStoppedTerminal'] as const) {
    const original = host[name]!;
    Object.assign(host, { [name]: async (...args: unknown[]) => {
      trace.push({ name, stage: 'start', at: Date.now() });
      try {
        const value = await Reflect.apply(original, host, args);
        trace.push({ name, stage: 'done', value: typeof value === 'boolean' ? value : null, at: Date.now() }); return value;
      } catch (error) { trace.push({ name, stage: 'failed', code: (error as { code?: string }).code, at: Date.now() }); throw error; }
      finally { writeFileSync(join(evidence, 'bridge-trace.json'), JSON.stringify(trace)); }
    } });
  }
  const execution = createMaestriOmp({ dataDirectory: f.directory, persistence: f.persistence, host,
    validateReviewerResult: async binding => {
      const review = f.storage.getReview(binding.deliveryVersion)!;
      await shared(f.storage.getDelivery(binding.deliveryVersion).delivery, review.id);
      f.storage.recordReviewIntegrity(binding, true);
    } }, loadRoleResources(), {
    channel: callbacks => openChannel({ ...callbacks, hello: async hello => {
      const { token: _token, ...identity } = hello;
      trace.push({ name: 'hello', identity }); writeFileSync(join(evidence, 'bridge-trace.json'), JSON.stringify(trace));
      await callbacks.hello(hello);
    } }),
  });
  const preflight = await execution.preflight(); expect(preflight.ready).toBe(true);
  for (const tool of f.tools) if (tool.tool === 'omp') tool.version = preflight.ompVersion!;
  const deadline = Date.now() + 540_000;
  let authorizedPassages = 0;
  const authorizePassage = () => {
    if (authorizedPassages >= 6 || Date.now() >= deadline) throw new Error('REAL_SESSION_AUTHORIZATION_LIMIT');
    authorizedPassages++;
  };
  const startPassage = execution.startPassage.bind(execution);
  const continuePassage = execution.continuePassage.bind(execution);
  execution.startPassage = (...args) => { authorizePassage(); return startPassage(...args); };
  execution.continuePassage = (...args) => { authorizePassage(); return continuePassage(...args); };
  Object.assign(f.execution, execution);
  const prepare = createWorkspacePreparer(f.directory, git);
  f.workspaces.prepareAttempt.mockImplementation(input => prepare({ ...input, source: { ...input.source, kind: 'local', location: seed } }));
  Object.assign(f.workspaces, {
    captureDelivery: createCapturer(f.directory, git),
    materializeReview: shared,
    getDeliveryDiff: createDeliveryDiff(f.directory, git),
  });
  const watchdog = setTimeout(() => { void f.pipeline.close(); }, Math.max(0, deadline - Date.now()));
  let attemptId: string | undefined;
  try {
    const prepared = await f.prepare();
    const op = await f.pipeline.startAttempt(prepared.body, prepared.context); attemptId = op.resource.id;
    while (Date.now() < deadline) {
      await f.pipeline.drain();
      const status = f.storage.getAttempt(attemptId);
      const rows = f.db.prepare('SELECT role,round_number,state,tracking_state,diagnostic FROM passages WHERE attempt_id=? ORDER BY role,round_number').all(attemptId);
      writeFileSync(join(evidence, 'progress.json'), JSON.stringify({ phase: status.phase, round: status.round, diagnostic: status.diagnostic, passages: rows }));
      if (status.phase === 'publishing') break;
      if (status.result || status.suspension || rows.some(row => (row as { state: string }).state === 'interrupted' || (row as { state: string }).state === 'partial')) throw new Error('REAL_SESSION_INTERRUPTED');
      await new Promise(r => setTimeout(r, 1000));
    }
    const status = f.storage.getAttempt(attemptId); expect(status.phase).toBe('publishing'); expect(status.round).toBe(3);
    expect(authorizedPassages).toBe(6);
    recordEvidence(evidence, f.db, attemptId, f.directory);
  } finally {
    clearTimeout(watchdog);
    await f.pipeline.close(); f.storage.close(); f.db.close();
  }
});
