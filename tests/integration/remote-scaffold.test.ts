import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateScaffold, EffectReceipt, EffectView, GitHubMutationResult, ScaffoldInput, SessionResponse } from '#contracts';
import { createScaffold, type ScaffoldDependencies } from '../../apps/controller/src/modules/projects/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { acceptCreation, completeCreation, recordCreationStep } from '../../apps/controller/src/modules/storage/creations.js';
import { readOperation } from '../../apps/controller/src/modules/storage/operations.js';
import { removeRemoteScaffoldSchema } from '../fixtures/scaffold-schema.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createRemoteScaffolder } from '../../apps/controller/src/modules/github/scaffold.js';
import { GraphQLReader } from '../../apps/controller/src/modules/github/transport.js';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const complete = <T>(data: T) => ({ state: 'complete' as const,data,diagnostics: [],retryAtMs: null });
async function fixture(failure = '') {
  const directory = mkdtempSync(join(tmpdir(),'remote-scaffold-'));
  cleanup.push(() => rmSync(directory,{ recursive: true })); const storage = openStorage({ dataDirectory: directory,busyTimeoutMs: 10 }); cleanup.push(() => storage.close());
  const db = new Database(join(directory,'factory.sqlite')); cleanup.push(() => { db.close(); }); db.pragma('foreign_keys=ON');
  db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('ACCOUNT_test','test-user',1,1,1);
  db.prepare("UPDATE factory_settings SET account_id='ACCOUNT_test'").run();
  storage.saveSettings({ operationId: randomUUID(),expectedRevision: storage.getGlobalConfiguration().etag,body: { changes: { projects_root: directory } },changes: { projects_root: directory } });
  let accountId = 'ACCOUNT_test'; let remote: EffectReceipt | null = null; const sends: string[] = [];
  const receipt = (e: EffectView): EffectReceipt => ({ id: e.kind === 'baseline_push' ? 'a'.repeat(40) : 'R_created',repositoryId: 'R_created',
    ownerId: 'OWNER_test',repositoryName: 'different-name',visibility: 'private',url: 'https://github.com/test-org/different-name',operationId: e.operationId,
    ...(e.kind === 'create_repository' ? {} : { commitSha: 'a'.repeat(40),branchRef: 'refs/heads/release/base' }) });
  const confirmed = (e: EffectView): GitHubMutationResult => ({ state: 'confirmed',receipt: receipt(e),reason: null,retryAtMs: null });
  const unknown = (): GitHubMutationResult => ({ state: 'unknown',receipt: null,reason: 'RESPONSE_LOST',retryAtMs: null });
  const github = {
    getIdentity: vi.fn(async () => complete({ id: accountId,login: 'test-user' })),
    scaffoldRemoteCapability: vi.fn<NonNullable<ScaffoldDependencies['github']['scaffoldRemoteCapability']>>(() => ({ available: true,reason_code: 'CREATION_TARGET_NOT_AUTHORIZED' })),
    inspectScaffoldRemote: vi.fn(async () => complete({ ownerLogin: 'test-org',repositoryId: remote?.id ?? null })),
    createScaffoldRepository: vi.fn<NonNullable<ScaffoldDependencies['github']['createScaffoldRepository']>>(async (e,_account,authorize) => {
      expect(storage.getEffect(e.operationId).state).toBe('running'); expect(storage.getOperation(e.operationId)?.receipt).toBeDefined();
      expect(storage.getCreation(e.creationId!).creation.baselineSha).toBe('a'.repeat(40));
      await authorize(); sends.push('create_repository'); remote = receipt(e);
      if (failure === 'account') accountId = 'OTHER';
      if (failure === 'settings') storage.saveTimeDefaults({ operationId: randomUUID(),expectedRevision: storage.getSettingsETag(),timeDefaults: { ...storage.getSettings().time_defaults,polling_interval_ms: 9000 } });
      if (failure === 'throw') throw new Error('Synthetic transport error');
      return failure === 'repository' ? unknown() : confirmed(e);
    }),
    reconcileScaffoldRepository: vi.fn<NonNullable<ScaffoldDependencies['github']['reconcileScaffoldRepository']>>(async e => remote ? confirmed(e) : unknown()),
  };
  const workspaces: ScaffoldDependencies['workspaces'] = {
    scaffoldCapability: () => ({ available: true }),
    inspectScaffoldDestination: async (projectsRoot,destinationRelative) => {
      const destination = join(projectsRoot,destinationRelative); if (existsSync(destination)) throw new Error('DESTINATION_EXISTS');
      return { projectsRoot,destination,parentIdentity: 'b'.repeat(64) };
    },
    createLocalScaffold: vi.fn<ScaffoldDependencies['workspaces']['createLocalScaffold']>(async ({ plan,record }) => {
      expect(db.prepare('SELECT count(*) AS n FROM project_creations').get()).toEqual({ n: 1 });
      for (const step of ['directory','files','git','baseline'] as const) {
        record(step,'running');
        if (step === 'directory') mkdirSync(plan.destination);
        if (step === 'files') writeFileSync(join(plan.destination,'README.md'),'Preserved baseline fixture.','utf8');
        record(step,'confirmed',step === 'baseline' ? 'a'.repeat(40) : undefined);
      }
      return { baselineSha: 'a'.repeat(40),baselineRef: 'refs/heads/release/base' };
    }),
    executeScaffoldGit: vi.fn<NonNullable<ScaffoldDependencies['workspaces']['executeScaffoldGit']>>(async (_plan,e,_account,authorize) => {
      expect(storage.getEffect(e.operationId).state).toBe('running');
      expect(storage.getCreation(e.creationId!).effects.find(x => x.kind === 'create_repository')?.state).toBe('confirmed');
      if (e.kind === 'baseline_push') expect(storage.getCreation(e.creationId!).effects.find(x => x.kind === 'associate_origin')?.state).toBe('confirmed');
      await authorize(); sends.push(e.kind); return failure === e.kind ? unknown() : confirmed(e);
    }),
    reconcileScaffoldGit: vi.fn<NonNullable<ScaffoldDependencies['workspaces']['reconcileScaffoldGit']>>(async (_plan,e) => confirmed(e)),
  };
  const scaffold = createScaffold({ storage,github,workspaces,logFailure: vi.fn() }); cleanup.push(() => scaffold.close());
  const options = await scaffold.getOptions(); const template = options.templates[0]!;
  const input: ScaffoldInput = { name: 'Local name',templateId: template.id,templateDigest: template.digest,destinationRelative: 'project',
    creationMode: 'remote_push',baseBranch: 'release/base',triageEnabled: false,remote: { ownerId: 'OWNER_test',name: 'different-name',visibility: 'private' } };
  const authorize = async (mode: ScaffoldInput['creationMode'] = 'remote_push'): Promise<CreateScaffold> => {
    const planned = await scaffold.plan({ ...input,creationMode: mode }); return { planHash: planned.planHash,plan: planned.plan,authorized: true };
  };
  return { directory,storage,db,github,workspaces,scaffold,input,authorize,sends,changeAccount: () => { accountId = 'OTHER'; },existingRemote: () => { remote = { id: 'R_existing' }; } };
}
const etag = (f: Awaited<ReturnType<typeof fixture>>,id: string) => { const c = f.storage.getCreation(id).creation; return `"creation:${id}:${c.revision}"`; };

describe('remote scaffold journal and reconciliation with controlled adapters',() => {
  it('accepts creation when the event sequence exceeds retained events', async () => {
    const f = await fixture();
    const body = await f.authorize();
    f.db.prepare("UPDATE sqlite_sequence SET seq=seq+20 WHERE name='events'").run();
    const operationId = randomUUID();
    const accepted = acceptCreation(f.db, { operationId, body });
    const event = f.db.prepare<[string], { seq: number }>('SELECT seq FROM events WHERE operation_id=?').get(operationId)!;
    expect(accepted.operation.receipt?.event_cursor).toBe(String(event.seq));
    expect(readOperation(f.db, operationId)?.resource.id).toBe(accepted.operation.resource.id);
  });
  it('offers remote modes for the configured account and plans without sending effects', async () => {
    const f = await fixture();
    const runner = vi.fn(async () => { throw new Error('Capability checks must not send requests'); });
    const adapter = createRemoteScaffolder(new GraphQLReader(runner), { kind: 'confirmed_plan' });
    f.github.scaffoldRemoteCapability.mockImplementation(adapter.scaffoldRemoteCapability);
    expect((await f.scaffold.getOptions()).creationModes.every(mode => mode.capability.available)).toBe(true);
    await f.authorize();
    expect(f.sends).toEqual([]);
    expect(existsSync(join(f.directory, 'project'))).toBe(false);
    expect(runner).not.toHaveBeenCalled();
    f.changeAccount();
    expect((await f.scaffold.getOptions()).creationModes.filter(mode => mode.mode !== 'local').every(mode => !mode.capability.available)).toBe(true);
  });
  it.each(['remote_no_push','remote_push'] as const)('completes only the effects authorized by %s and registers the same branch',async mode => {
    const f = await fixture(); const body = await f.authorize(mode); const operationId = randomUUID();
    const op = await f.scaffold.create(body,operationId); await f.scaffold.drain();
    const view = f.scaffold.getCreation(op.resource.id);
    expect(view.creation).toMatchObject({ state: 'completed',baselineSha: 'a'.repeat(40),baselineRef: 'refs/heads/release/base' });
    expect(f.sends).toEqual(mode === 'remote_push' ? ['create_repository','associate_origin','baseline_push'] : ['create_repository','associate_origin']);
    expect(view.remoteEffects.find(e => e.kind === 'baseline_push')?.state).toBe(mode === 'remote_push' ? 'confirmed' : 'not_requested');
    const config = f.storage.getConfiguration(view.creation.projectId!).view.configuration;
    expect(config).toMatchObject({ base_branch: 'release/base',automation_enabled: false,github_project: null,source: { repository_id: 'R_created',repository_url: 'https://github.com/test-org/different-name' } });
    const before = [...f.sends]; expect((await f.scaffold.create(body,operationId)).operation_id).toBe(operationId); await f.scaffold.drain(); expect(f.sends).toEqual(before);
    expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 0 }); expect(f.db.pragma('foreign_key_check')).toEqual([]);
    for (const e of view.effects) expect(() => f.db.prepare("UPDATE effects SET reason='CHANGED' WHERE operation_id=?").run(e.operationId)).toThrow();
  });
  it('refuses an existing remote and changed account before destination effects',async () => {
    const f = await fixture(); const body = await f.authorize(); f.changeAccount();
    await expect(f.scaffold.create(body,randomUUID())).rejects.toMatchObject({ code: 'SCAFFOLD_ACCOUNT_CHANGED' }); expect(f.sends).toEqual([]);
    expect(existsSync(body.plan.destination)).toBe(false);
    const g = await fixture(); g.existingRemote(); await expect(g.authorize()).rejects.toMatchObject({ code: 'SCAFFOLD_REMOTE_EXISTS' });
  });
  it.each(['account','settings'])('preserves a confirmed repository when %s changes before origin',async failure => {
    const f = await fixture(failure); const body = await f.authorize(); const op = await f.scaffold.create(body,randomUUID()); await f.scaffold.drain();
    const view = f.scaffold.getCreation(op.resource.id); expect(view.creation.state).toBe('partial'); expect(f.sends).toEqual(['create_repository']);
    expect(view.effects[0]?.state).toBe('confirmed'); expect(view.remoteEffects[1]?.state).toBe('not_started'); expect(existsSync(join(body.plan.destination,'README.md'))).toBe(true);
  });
  it.each(['repository','associate_origin','baseline_push','throw'])('reconciles %s response loss without resending any effect',async failure => {
    const f = await fixture(failure); const body = await f.authorize(); const originalId = randomUUID(); const op = await f.scaffold.create(body,originalId); await f.scaffold.drain();
    const partial = f.scaffold.getCreation(op.resource.id); expect(partial.creation.state).toBe('partial'); expect(partial.effects.at(-1)?.state).toBe('unknown');
    const sent = [...f.sends]; const reconciliationId = randomUUID(); const precondition = etag(f,op.resource.id);
    const reconciled = await f.scaffold.reconcile(op.resource.id,reconciliationId,precondition); expect(reconciled.resource.type).toBe('creation'); await f.scaffold.drain();
    expect(f.storage.getOperation(reconciliationId)?.state).toBe(failure === 'baseline_push' ? 'succeeded' : 'unknown');
    expect(f.sends).toEqual(sent); const view = f.scaffold.getCreation(op.resource.id); expect(view.effects.at(-1)?.state).toBe('confirmed');
    expect(view.creation.state).toBe(failure === 'baseline_push' ? 'completed' : 'partial');
    expect((await f.scaffold.create(body,originalId)).operation_id).toBe(originalId);
    expect((await f.scaffold.reconcile(op.resource.id,reconciliationId,precondition)).operation_id).toBe(reconciliationId); await f.scaffold.drain(); expect(f.sends).toEqual(sent);
    await expect(f.scaffold.reconcile(op.resource.id,reconciliationId,'"other"')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('keeps an unobserved remote unknown and requires CAS before reconciliation',async () => {
    const f = await fixture('repository'); const op = await f.scaffold.create(await f.authorize(),randomUUID()); await f.scaffold.drain();
    await expect(f.scaffold.reconcile(op.resource.id,randomUUID(),undefined)).rejects.toMatchObject({ statusCode: 428 });
    await expect(f.scaffold.reconcile(op.resource.id,randomUUID(),'"old"')).rejects.toMatchObject({ statusCode: 412 });
    f.github.reconcileScaffoldRepository.mockResolvedValue({ state: 'unknown',receipt: null,reason: 'NOT_OBSERVED',retryAtMs: null });
    const before = f.scaffold.getCreation(op.resource.id); const precondition = etag(f,op.resource.id);
    const reconcile = await f.scaffold.reconcile(op.resource.id,randomUUID(),precondition); await f.scaffold.drain();
    expect(f.storage.getOperation(reconcile.operation_id)?.state).toBe('unknown'); expect(f.scaffold.getCreation(op.resource.id).effects[0]?.state).toBe('unknown'); expect(f.sends).toEqual(['create_repository']);
    expect(f.db.prepare('SELECT state,diagnostic FROM creation_reconciliations WHERE operation_id=?').get(reconcile.operation_id)).toEqual({ state: 'unknown',diagnostic: 'NOT_OBSERVED' });
    expect(f.db.prepare('SELECT event_type,entity_revision FROM events WHERE operation_id=? ORDER BY seq').all(reconcile.operation_id)).toEqual([
      { event_type: 'creation.reconcile.accepted',entity_revision: before.creation.revision },
      { event_type: 'creation.reconciled',entity_revision: before.creation.revision + 1 },
    ]);
    const after = f.scaffold.getCreation(op.resource.id);
    expect(after.creation).toEqual({ ...before.creation,revision: before.creation.revision + 1 });
    expect(after.effects).toEqual(before.effects);
    expect(f.storage.getOperation(reconcile.operation_id)?.receipt).toEqual(reconcile.receipt);
    expect(await f.scaffold.reconcile(op.resource.id,reconcile.operation_id,precondition)).toMatchObject({ state: 'unknown',receipt: reconcile.receipt });
    await f.scaffold.drain(); expect(f.github.reconcileScaffoldRepository).toHaveBeenCalledTimes(1); expect(f.sends).toEqual(['create_repository']);
    await expect(f.scaffold.reconcile(op.resource.id,randomUUID(),precondition)).rejects.toMatchObject({ statusCode: 412 });
    const next = await f.scaffold.reconcile(op.resource.id,randomUUID(),etag(f,op.resource.id)); await f.scaffold.drain();
    expect(f.storage.getOperation(next.operation_id)?.state).toBe('unknown'); expect(f.sends).toEqual(['create_repository']);
  });
  it.each(['effect.intended','effect.sent','effect.confirmed'])('a SQL failure in %s blocks the following effect',async event => {
    const f = await fixture(); const body = await f.authorize();
    f.db.exec(`CREATE TRIGGER fail_remote BEFORE INSERT ON events WHEN NEW.event_type='${event}' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`);
    const op = await f.scaffold.create(body,randomUUID()); await f.scaffold.drain();
    expect(f.sends).toEqual(event === 'effect.confirmed' ? ['create_repository'] : []); expect(f.scaffold.getCreation(op.resource.id).creation.state).toBe('partial');
    expect(f.storage.listProjects({}).items).toEqual([]);
  });
  it('requires exact scope, confirmed repository and remote_push in the journal',async () => {
    const f = await fixture('repository'); const op = await f.scaffold.create(await f.authorize('remote_no_push'),randomUUID()); await f.scaffold.drain();
    const effect = f.scaffold.getCreation(op.resource.id).effects[0]!;
    expect(() => f.storage.finishEffect(effect.operationId,effect.revision,'confirmed',{ id: 'R_wrong',repositoryId: 'R_wrong',ownerId: 'OTHER',repositoryName: 'different-name',visibility: 'private',operationId: effect.operationId,url: 'https://github.com/test-org/different-name' },null)).toThrow();
    expect(() => f.db.prepare("INSERT INTO effects(operation_id,creation_id,attempt_id,kind,scope_key,authorization_json,expected_identity_json,state,created_at_ms) VALUES (?,? ,NULL,'push',?,'{}','{}','not_started',1)").run(randomUUID(),op.resource.id,op.resource.id)).toThrow();
  });
  it('serves protected creation reconciliation with creation scope and original Location',async () => {
    const f = await fixture('baseline_push'); const op = await f.scaffold.create(await f.authorize(),randomUUID()); await f.scaffold.drain();
    const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory,FACTORY_LOG_LEVEL: 'silent' },f.directory),f.storage,undefined,undefined,undefined,undefined,{ github: f.github,workspaces: f.workspaces }); cleanup.push(() => app.close());
    const url = `/api/v1/scaffold/creations/${op.resource.id}/reconcile`; const base = { host: '127.0.0.1:4310',origin: 'http://127.0.0.1:4310','content-type': 'application/json','x-factory-client': 'web' };
    expect((await app.inject({ method: 'POST',url,headers: base,payload: {} })).statusCode).toBe(401);
    const session = await app.inject({ method: 'POST',url: '/api/v1/session',headers: base,payload: {} });
    const headers = { ...base,cookie: String(session.headers['set-cookie']).split(';')[0]!,'x-csrf-token': session.json<SessionResponse>().csrf_token,'idempotency-key': randomUUID(),'if-match': etag(f,op.resource.id) };
    const response = await app.inject({ method: 'POST',url,headers,payload: {} }); expect(response.statusCode).toBe(202); expect(response.json<{ resource: { type: string } }>().resource.type).toBe('creation');
    expect(response.headers.location).toMatch(/^\/api\/v1\/operations\//);
    expect((await app.inject({ method: 'POST',url,headers,payload: { deliveryId: randomUUID() } })).statusCode).toBe(400);
  });
  it('migrates actual v16 preserving completed local creation, baseline, identity and original receipt',async () => {
    const f = await fixture(); const { remote: _remote, ...localInput } = f.input;
    const planned = await f.scaffold.plan({ ...localInput, creationMode: 'local' });
    const body: CreateScaffold = { planHash: planned.planHash, plan: planned.plan, authorized: true };
    const originalId = randomUUID();
    const accepted = acceptCreation(f.db,{ operationId: originalId,body });
    for (const step of ['directory','files','git','baseline'] as const) { recordCreationStep(f.db,accepted.operation.resource.id,step,'running'); recordCreationStep(f.db,accepted.operation.resource.id,step,'confirmed',step === 'baseline' ? 'a'.repeat(40) : undefined); }
    completeCreation(f.db,accepted.operation.resource.id);
    const before = readOperation(f.db,originalId); const instance = f.db.prepare('SELECT installation_id FROM factory_settings').get();
    f.storage.close(); removeRemoteScaffoldSchema(f.db);
    const storage = openStorage({ dataDirectory: f.directory }); cleanup.push(() => storage.close());
    expect(storage.getDiagnostics().schemaVersion).toBe(24); const probe = new Database(join(f.directory,'factory.sqlite')); cleanup.push(() => { probe.close(); });
    expect(probe.prepare('SELECT installation_id FROM factory_settings').get()).toEqual(instance); expect(probe.pragma('foreign_key_check')).toEqual([]);
    expect(storage.getOperation(originalId)).toEqual(before);
    expect(storage.getCreation(accepted.operation.resource.id).creation).toMatchObject({ state: 'completed',baselineSha: 'a'.repeat(40),baselineRef: 'refs/heads/release/base' });
    expect(probe.prepare('SELECT count(*) AS n FROM effects').get()).toEqual({ n: 0 }); expect(probe.prepare('SELECT count(*) AS n FROM creation_reconciliations').get()).toEqual({ n: 0 });
  });
});
