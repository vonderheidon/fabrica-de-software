import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { GitHubMutationResult } from '#contracts';
import { attemptFixture, complete } from '../fixtures/attempt.js';
import { withPublicationIssueProjections } from '../fixtures/publication.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import type { GitHubEffectRequest } from '../../apps/controller/src/modules/github/index.js';
import { withWindowsTerminalJobs } from '../../dist/apps/controller/src/modules/execution/index.js';
import { createMaestriOmp } from '../../dist/apps/controller/src/modules/execution/adapters/maestri-omp/adapter.js';
import { openChannel } from '../../dist/apps/controller/src/modules/execution/adapters/maestri-omp/channel.js';
import type { ChannelCallbacks, PassageChannel } from '../../apps/controller/src/modules/execution/adapters/maestri-omp/channel.js';
import { loadRoleResources } from '../../dist/apps/controller/src/modules/execution/roles.js';
import { createGitReader } from '../../dist/apps/controller/src/modules/workspaces/git.js';
import { createWorkspacePreparer } from '../../dist/apps/controller/src/modules/workspaces/prepare.js';
import { createCapturer } from '../../dist/apps/controller/src/modules/workspaces/capture.js';
import { createAttemptMaterializer } from '../../dist/apps/controller/src/modules/workspaces/materialize.js';
import { createDeliveryDiff } from '../../dist/apps/controller/src/modules/workspaces/diff.js';
import { createRetainedVerifier } from '../../dist/apps/controller/src/modules/workspaces/retention.js';
import { createEnvironmentRecovery } from '../../dist/apps/controller/src/modules/workspaces/recovery.js';
import { createProjectStorageInspector } from '../../dist/apps/controller/src/modules/workspaces/project-storage.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createPreparations } from '../../apps/controller/src/modules/projects/index.js';

it('proves fresh sessions, terminal reuse, native cancellation and induced tracking loss within six passages', async () => {
  if (process.env.FACTORY_REAL_RECOVERY_PROOF !== 'authorized') throw new Error('REAL_RECOVERY_PROOF_NOT_AUTHORIZED');
  const sessionsOnly = process.env.FACTORY_REAL_RECOVERY_SCOPE === 'sessions_only';
  const stopsOnly = process.env.FACTORY_REAL_RECOVERY_SCOPE === 'stops_only';
  const restartOnly = process.env.FACTORY_REAL_RECOVERY_SCOPE === 'restart';
  const priorBudget = sessionsOnly && process.env.FACTORY_REAL_RECOVERY_PRIOR_BUDGET ? JSON.parse(readFileSync(resolve(process.env.FACTORY_REAL_RECOVERY_PRIOR_BUDGET), 'utf8')) as { passages: number; deadline: number } : null;
  if (priorBudget && (priorBudget.passages !== 2 || priorBudget.deadline <= Date.now())) throw new Error('PRIOR_AUTHORIZATION_EXHAUSTED');
  const maximumPassages = stopsOnly ? 2 : sessionsOnly ? 4 : 6;
  mkdirSync(resolve('.cache'), { recursive: true });
  // Keep disposable installation paths below Git for Windows' subprocess path limit.
  const evidence = mkdtempSync(join(resolve('.cache'), 'r-'));
  const seed = join(evidence, 'seed'); mkdirSync(seed);
  const gitExecutable = process.env.FACTORY_GIT_EXE!;
  const gitCommand = (...args: string[]) => {
    const result = spawnSync(gitExecutable, args, { cwd: seed, windowsHide: true, shell: false, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('PROOF_GIT_SETUP_FAILED');
    return result.stdout.trim();
  };
  gitCommand('init', '-b', 'main');
  writeFileSync(join(seed, 'value.txt'), '0');
  writeFileSync(join(seed, '.gitignore'), '.factory-evidence/\n.cache/\nnode_modules/\n.omp/\n');
  writeFileSync(join(seed, 'hold.cjs'), "const fs=require('node:fs');const {spawn}=require('node:child_process');fs.mkdirSync('.factory-evidence',{recursive:true});const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('.factory-evidence/active.json',JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);");
  gitCommand('add', '--', 'value.txt', '.gitignore', 'hold.cjs');
  gitCommand('-c', 'user.name=Factory proof', '-c', 'user.email=proof@factory.invalid', 'commit', '-m', 'Native recovery proof baseline');
  const f = await attemptFixture(evidence, gitCommand('rev-parse', 'HEAD'), 'high', 'var/factory');
  await f.pipeline.close();
  const git = createGitReader({ kind: 'windows_keyring', executable: gitExecutable });
  let projectStorage = createProjectStorageInspector(f.directory, undefined, f.storage);
  const resolveAttemptRoot = (id: string, allocate?: boolean) => projectStorage.resolveAttemptRoot(id, allocate);
  const resolveAttemptWorkspace = (id: string) => projectStorage.resolveAttemptWorkspace(id);
  const shared = createAttemptMaterializer(f.directory, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace);
  const prepare = createWorkspacePreparer(f.directory, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace);
  const rawHost = { maestriExecutable: process.env.FACTORY_MAESTRI_EXE!, ompExecutable: process.env.FACTORY_OMP_EXE!,
    powershellExecutable: join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), inheritedEnvironment: process.env };
  let host = withWindowsTerminalJobs(rawHost, f.directory);
  const handshakes: { sessionId: string; terminalId: string; workspaceId: string; cwd: string; provider: string; model: string; effort: string | null }[] = [];
  const channels: { callbacks: ChannelCallbacks; channel: PassageChannel }[] = [];
  const createAdapter = () => createMaestriOmp({ dataDirectory: f.directory, persistence: f.persistence, host,
    projectStorageRootForAttempt: resolveAttemptRoot,
    projectStorageAreaForAttempt: projectStorage.resolveAttemptArea,
    validateReviewerResult: async binding => {
      const review = f.storage.getReview(binding.deliveryVersion)!;
      await shared(f.storage.getDelivery(binding.deliveryVersion).delivery, review.id);
      f.storage.recordReviewIntegrity(binding, true);
    } }, loadRoleResources(), { channel: async callbacks => {
      const channel = await openChannel({ ...callbacks, hello: async hello => {
        const { token: _token, ...identity } = hello;
        handshakes.push(identity); writeFileSync(join(evidence, 'handshakes.json'), JSON.stringify(handshakes, null, 2));
        await callbacks.hello(hello);
      } });
      channels.push({ callbacks, channel }); return channel;
    } });
  let execution = createAdapter();
  const preflight = await execution.preflight(); expect(preflight.ready).toBe(true);
  for (const tool of f.tools) if (tool.tool === 'omp') tool.version = preflight.ompVersion!;
  const deadline = priorBudget?.deadline ?? Date.now() + 540_000;
  let passages = 0;
  const authorizePassage = () => {
    if (passages >= maximumPassages || Date.now() >= deadline) throw new Error('REAL_RECOVERY_AUTHORIZATION_LIMIT');
    passages++; writeFileSync(join(evidence, 'budget.json'), JSON.stringify({ passages, priorPassages: priorBudget?.passages ?? 0, maximum: maximumPassages, deadline }));
  };
  function guardPassages() {
    const start = execution.startPassage.bind(execution);
    const continuePassage = execution.continuePassage.bind(execution);
    execution.startPassage = (...args) => { authorizePassage(); return start(...args); };
    execution.continuePassage = (...args) => { authorizePassage(); return continuePassage(...args); };
  }
  guardPassages();
  Object.assign(f.execution, execution);
  const github = { ...f.github, getRepository: async () => complete(structuredClone(f.issue.repository)),
    mutateEffect: async ({ effect, body, authorize }: GitHubEffectRequest): Promise<GitHubMutationResult> => {
      const signal = new AbortController().signal;
      await authorize?.({ signal, deadlineMonotonicMs: 60_000, assertActive() { if (signal.aborted) throw new Error('AUTHORIZATION_REVOKED'); } });
      if (effect.kind === 'project_status') {
        f.issue.memberships[0]!.statusValues[0]!.optionId = effect.expectedIdentity.optionId!;
        return { state: 'unknown', receipt: null, reason: 'STATUS_READBACK_REQUIRED', retryAtMs: null };
      }
      if (effect.kind !== 'issue_comment') throw new Error('EXTERNAL_EFFECT_NOT_AUTHORIZED');
      const id = `COMMENT_${randomUUID()}`; const url = `${f.issue.url}#proof`;
      f.issue.comments.push({ id, url, body: body!, author: { id: 'ACCOUNT_test', login: 'test-user' }, updatedAt: new Date().toISOString() });
      return { state: 'confirmed', receipt: { id, url }, reason: null, retryAtMs: null };
    } };
  const workspaces = { ...f.workspaces,
    prepareAttempt: (input: Parameters<typeof prepare>[0]) => prepare({ ...input, source: { ...input.source, kind: 'local', location: seed } }),
    captureDelivery: createCapturer(f.directory, git, undefined, resolveAttemptRoot, resolveAttemptWorkspace), materializeReview: shared, getDeliveryDiff: createDeliveryDiff(f.directory, git, undefined, resolveAttemptRoot),
    verifyRetainedDelivery: createRetainedVerifier(f.directory, git, undefined, resolveAttemptRoot), folderCapability: createEnvironmentRecovery(f.directory, git, undefined, undefined, resolveAttemptRoot, resolveAttemptWorkspace).folderCapability };
  const { github: publicationGithub } = withPublicationIssueProjections(github);
  const createController = () => createPipeline({ ...f.dependencies, github, workspaces, publication: { github: publicationGithub, workspaces } });
  let pipeline = createController();
  const watchdog = setTimeout(() => { void pipeline.close(); }, Math.max(0, deadline - Date.now()));
  const attempts: string[] = [];
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  async function until<T>(label: string, observe: () => T | Promise<T>): Promise<NonNullable<T>> {
    while (Date.now() < deadline) {
      await pipeline.drain();
      const value = await observe();
      appendFileSync(join(evidence, 'progress.jsonl'), JSON.stringify({ at: Date.now(), label, passages, attempts: attempts.map(id => f.storage.getAttempt(id)) }) + '\n');
      if (value) return value as NonNullable<T>;
      const failed = f.db.prepare("SELECT diagnostic FROM publication_requests WHERE state='failed' LIMIT 1").get() as { diagnostic: string } | undefined;
      if (failed) throw new Error('PROOF_PUBLICATION_FAILED: ' + failed.diagnostic);
      await new Promise(done => setTimeout(done, 250));
    }
    throw new Error('REAL_RECOVERY_DEADLINE');
  }
  function setProfiles(hold: boolean) {
    const common = 'Authorized native proof. Stay in assigned cwd. No network, Git, MCPs, subagents or model/session changes. ';
    const profileChanges = f.storage.getGlobalConfiguration().view.profiles.map(profile => ({ action: 'update' as const, id: profile.id,
      changes: { provider: 'openai-codex', model: 'gpt-6-luna', effort: 'high', guidance: common + (profile.profile_type === 'implementer'
        ? hold ? 'Run node hold.cjs with a long shell timeout and wait. Do not complete while that command runs. Cancellation is expected; do not launch a detached replacement.'
          : 'Write value.txt with integer 1 and read it back. Report execution_complete formatVersion 1, writesStopped true, additionalChangesJustification null, ac-1 and ac-2 passed with observed evidence, checks []. Stop after the receipt.'
        : 'Independently read value.txt. Never edit. Approve only if it contains integer 1. Report execution_complete formatVersion 1, verdict approved, both ac-1/ac-2 passed with observed evidence, findings [], resolutions []. Stop after the receipt.') } }));
    f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: f.storage.getGlobalConfiguration().etag, changes: {}, body: { changes: {}, profile_changes: profileChanges } });
  }
  async function startAttempt() {
    f.issue.memberships[0]!.statusValues[0]!.optionId = f.project.singleSelectFields[0]!.options.find(option => option.name === 'Ready')!.id;
    const saved = await f.preparations.createPreparation(f.projectId, { issue_id: f.issue.id, delivery_mode: 'icr', guidance: '', overrides: {},
      ...(attempts.length ? { previous_attempt_id: attempts.at(-1)! } : {}) }, { operationId: randomUUID(), expectedRevision: undefined });
    const preparation = saved.view.preparation;
    const operation = await pipeline.startAttempt({ preparationId: preparation.id, preparationRevision: preparation.revision,
      authorizedSummaryHash: preparation.summary_hash, authorized: true }, { operationId: randomUUID(), expectedRevision: saved.etag });
    attempts.push(operation.resource.id); return operation.resource.id;
  }
  try {
    if (restartOnly) {
      setProfiles(false);
      const first = await startAttempt();
      await until('initial-delivered', () => f.storage.getAttempt(first).result === 'delivered');
      const firstHandles = f.db.prepare('SELECT id AS passageId FROM passages WHERE attempt_id=?').all(first) as { passageId: string }[];
      for (const handle of firstHandles) await execution.preparePassageHandoff(handle);
      setProfiles(true);
      const interrupted = await startAttempt();
      const marker = join(await resolveAttemptWorkspace(interrupted), '.factory-evidence', 'active.json');
      await until('restart-active-writers', () => existsSync(marker));
      const pids = JSON.parse(readFileSync(marker, 'utf8')) as number[];
      const oldPassage = { passageId: f.storage.getAttempt(interrupted).passageId };
      const oldSession = f.persistence.getAttemptSession(oldPassage);
      expect(pids.every(alive)).toBe(true);
      // Close the owner's native handles before shutdown so no live map can authorize recovery.
      await host.closeTerminalProcesses!();
      await pipeline.close();
      await until('restart-writers-stopped', () => pids.every(pid => !alive(pid)));
      expect(f.persistence.getAttemptSession(oldPassage).terminalState).toBe('uncertain');
      const priorController = f.storage.controllerInstanceId;
      f.storage.close();
      f.storage = openStorage({ dataDirectory: f.directory });
      projectStorage = createProjectStorageInspector(f.directory, undefined, f.storage);
      f.persistence = f.storage.executionPersistence();
      f.preparations = createPreparations({ storage: f.storage, github: f.github, workspaces: f.workspaces });
      f.dependencies.storage = f.storage; f.dependencies.preparations = f.preparations;
      host = withWindowsTerminalJobs(rawHost, f.directory);
      execution = createAdapter(); guardPassages(); Object.assign(f.execution, execution);
      pipeline = createController();
      expect(f.storage.controllerInstanceId).not.toBe(priorController);
      setProfiles(false);
      const next = await startAttempt();
      await until('restart-new-attempt-delivered', () => f.storage.getAttempt(next).result === 'delivered');
      const nextSession = f.persistence.getAttemptSession({ passageId: f.storage.getAttempt(next).passageId });
      expect(nextSession.terminalId).toBe(oldSession.terminalId);
      expect(nextSession.managedTerminalId).toBe(oldSession.managedTerminalId);
      expect(nextSession.generation).toBe(oldSession.generation + 1);
      expect(nextSession.ompSessionId).not.toBe(oldSession.ompSessionId);
      expect(f.storage.getAttempt(interrupted).result).toBe('interrupted');
      expect(f.db.prepare("SELECT stop_state FROM resources WHERE passage_id=? AND kind='terminal'").get(oldPassage.passageId)).toEqual({ stop_state: 'uncertain' });
      const finalHandles = f.db.prepare('SELECT id AS passageId FROM passages WHERE attempt_id=?').all(next) as { passageId: string }[];
      for (const handle of finalHandles) await execution.preparePassageHandoff(handle);
      expect(passages).toBe(5); expect(handshakes).toHaveLength(5);
      expect(handshakes.every(x => x.provider === 'openai-codex' && x.model === 'gpt-6-luna' && x.effort === 'high')).toBe(true);
      expect(f.db.pragma('foreign_key_check')).toEqual([]);
      writeFileSync(join(evidence, 'result.json'), JSON.stringify({ ok: true, scope: 'restart', passages, first, interrupted, next, pids,
        oldSession, nextSession, priorController, currentController: f.storage.controllerInstanceId,
        limits: ['Controller instances, SQLite connections, adapter and native job maps recreated within the test process; not an OS process crash.', 'GitHub authority is a controlled port.'], dataDirectory: f.directory }, null, 2));
      return;
    }
    let one: { role: string; omp_session_id: string; managed_terminal_id: string }[] = [], two: typeof one = [];
    if (!stopsOnly) {
    setProfiles(false);
    const first = await startAttempt();
    await until('first-delivered', () => f.storage.getAttempt(first).result === 'delivered');
    // Qualify idle completed passages before measuring reuse; automatic finalization is a separate scenario.
    const completed = f.db.prepare('SELECT id AS passageId FROM passages WHERE attempt_id=?').all(first) as { passageId: string }[];
    for (const handle of completed) await execution.preparePassageHandoff(handle);
    const second = await startAttempt();
    await until('second-delivered', () => f.storage.getAttempt(second).result === 'delivered');
    const sessions = (id: string) => f.db.prepare('SELECT role,omp_session_id,managed_terminal_id FROM attempt_sessions WHERE attempt_id=? ORDER BY role').all(id) as { role: string; omp_session_id: string; managed_terminal_id: string }[];
    one = sessions(first); two = sessions(second);
    expect(one).toHaveLength(2); expect(two).toHaveLength(2);
    expect(new Set([...one, ...two].map(row => row.omp_session_id)).size).toBe(4);
    expect(new Set(two.map(row => row.managed_terminal_id))).toEqual(new Set(one.map(row => row.managed_terminal_id)));
    const finalPassages = f.db.prepare('SELECT id AS passageId FROM passages WHERE attempt_id=?').all(second) as { passageId: string }[];
    for (const handle of finalPassages) await execution.preparePassageHandoff(handle);
    if (sessionsOnly) {
      expect(f.db.prepare("SELECT COUNT(*) AS count FROM resources WHERE kind='terminal' AND stop_state<>'confirmed'").get()).toEqual({ count: 0 });
      expect(passages).toBe(4); expect(handshakes).toHaveLength(4);
      expect(handshakes.every(x => x.provider === 'openai-codex' && x.model === 'gpt-6-luna' && x.effort === 'high')).toBe(true);
      writeFileSync(join(evidence, 'result.json'), JSON.stringify({ state: 'partial', sessionsProved: true, passages, priorPassages: priorBudget?.passages ?? 0,
        firstSessions: one, secondSessions: two, notExecuted: ['native_cancellation', 'induced_tracking_loss'], dataDirectory: f.directory }, null, 2));
      return;
    }
    }
    setProfiles(true);
    const cancellation = await startAttempt();
    const marker = async (id: string) => join(await resolveAttemptWorkspace(id), '.factory-evidence', 'active.json');
    await until('cancel-native-command-active', async () => existsSync(await marker(cancellation)));
    const cancelPids = JSON.parse(readFileSync(await marker(cancellation), 'utf8')) as number[];
    expect(cancelPids.every(alive)).toBe(true);
    const active = f.storage.getAttempt(cancellation);
    const session = f.persistence.getAttemptSession({ passageId: active.passageId });
    const reference = { workspaceId: session.workspaceId!, terminalId: session.terminalId!, terminalName: session.terminalName, generation: session.generation };
    expect(await host.confirmStoppedTerminal!(reference)).toBe(false);
    await pipeline.cancelAttempt(cancellation, {}, { operationId: randomUUID(), expectedRevision: `"${cancellation}:${active.revision}"` });
    await until('cancel-native-command-stopped', async () => await host.confirmStoppedTerminal!(reference) && cancelPids.every(pid => !alive(pid)));
    expect(f.storage.getAttempt(cancellation).result).toBe('cancelled');
    const lost = await startAttempt();
    await until('loss-native-command-active', async () => existsSync(await marker(lost)));
    const lostPids = JSON.parse(readFileSync(await marker(lost), 'utf8')) as number[];
    const lostStatus = f.storage.getAttempt(lost);
    const lostSession = f.persistence.getAttemptSession({ passageId: lostStatus.passageId });
    const lostReference = { workspaceId: lostSession.workspaceId!, terminalId: lostSession.terminalId!, terminalName: lostSession.terminalName, generation: lostSession.generation };
    channels.at(-1)!.callbacks.lost('CHANNEL_EOF'); await channels.at(-1)!.channel.close();
    const liveImmediatelyAfterLoss = lostPids.every(alive);
    const automaticStopConfirmed = await host.confirmStoppedTerminal!(lostReference);
    // Loss starts owned-process cleanup concurrently. Compare the confirmation
    // with process liveness after awaiting it, not with an earlier observation.
    expect(automaticStopConfirmed && lostPids.some(alive)).toBe(false);
    expect(f.persistence.getAttemptSession({ passageId: lostStatus.passageId }).terminalState).not.toBe('available');
    await execution.cancelAttempt(lost, randomUUID());
    await until('loss-owned-processes-stopped', async () => await host.confirmStoppedTerminal!(lostReference) && lostPids.every(pid => !alive(pid)));
    expect(passages).toBe(stopsOnly ? 2 : 6); expect(handshakes).toHaveLength(stopsOnly ? 2 : 6);
    expect(handshakes.every(x => x.provider === 'openai-codex' && x.model === 'gpt-6-luna' && x.effort === 'high')).toBe(true);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
    writeFileSync(join(evidence, 'result.json'), JSON.stringify({ ok: true, scope: stopsOnly ? 'stops_only' : 'full', passages, firstSessions: one, secondSessions: two, nativeActiveNotStopped: true,
      cancellation: { attemptId: cancellation, pids: cancelPids, stopped: true }, trackingLoss: { attemptId: lost, pids: lostPids, liveImmediatelyAfterLoss, automaticStopConfirmed, stoppedAfterExplicitCleanup: true },
      limits: ['GitHub authority/status/comments are controlled ports, never real remote writes.', 'Tracking loss is injected at the real channel callback boundary; it is not an accidental provider/network outage.', 'Active physical processes and non-available occupation are checked; this does not exercise every allocation race.'], dataDirectory: f.directory }, null, 2));
  } finally {
    clearTimeout(watchdog); await pipeline.close(); f.storage.close(); f.db.close();
  }
});
