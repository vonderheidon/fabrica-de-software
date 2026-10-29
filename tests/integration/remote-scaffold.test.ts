import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { HttpCreationView, HttpScaffoldInput, HttpScaffoldOptions, HttpScaffoldPlanned, type CreateScaffold, type EffectReceipt, type EffectView, type GitHubMutationResult, type ScaffoldInputV3, type SessionResponse } from '#contracts';
import { createScaffold, type ScaffoldDependencies } from '../../apps/controller/src/modules/projects/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { acceptCreation } from '../../apps/controller/src/modules/storage/creations.js';
import { readOperation } from '../../apps/controller/src/modules/storage/operations.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createRemoteScaffolder } from '../../apps/controller/src/modules/github/scaffold.js';
import { GraphQLReader } from '../../apps/controller/src/modules/github/transport.js';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const complete = <T>(data: T) => ({ state: 'complete' as const,data,diagnostics: [],retryAtMs: null });
async function fixture(failure = '') {
  const directory = mkdtempSync(join(tmpdir(),'remote-scaffold-'));
  cleanup.push(() => rmSync(directory,{ recursive: true })); let storage = openStorage({ dataDirectory: directory,busyTimeoutMs: 10 });
  cleanup.push(() => storage.close());
  const db = new Database(join(directory,'factory.sqlite')); cleanup.push(() => { db.close(); }); db.pragma('foreign_keys=ON');
  db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('ACCOUNT_test','test-user',1,1,1);
  db.prepare("UPDATE factory_settings SET account_id='ACCOUNT_test'").run();
  storage.saveSettings({ operationId: randomUUID(),expectedRevision: storage.getGlobalConfiguration().etag,body: { changes: { projects_root: directory } },changes: { projects_root: directory } });
  let accountId = 'ACCOUNT_test'; let remote: EffectReceipt | null = null; const sends: string[] = []; const boardSends: string[] = [];
  const receipt = (e: EffectView): EffectReceipt => ({ id: e.kind === 'baseline_push' ? 'a'.repeat(40) : 'R_created',repositoryId: 'R_created',
    ownerId: 'OWNER_test',repositoryName: 'different-name',visibility: 'private',url: 'https://github.com/test-org/different-name',operationId: e.operationId,
    ...(e.kind === 'create_repository' ? {} : { commitSha: 'a'.repeat(40),branchRef: 'refs/heads/release/base' }) });
  const confirmed = (e: EffectView): GitHubMutationResult => ({ state: 'confirmed',receipt: receipt(e),reason: null,retryAtMs: null });
  const unknown = (): GitHubMutationResult => ({ state: 'unknown',receipt: null,reason: 'RESPONSE_LOST',retryAtMs: null });
  const boardReceipt = (kind: string, identity: import('#contracts').CreationBoardOperation['expected_identity'], repositoryId: string) => {
    const projectId = identity.project_id ?? 'PVT_board'; const fieldId = identity.status_field_id ?? 'FIELD_status';
    const viewId = identity.view_id ?? 'VIEW_kanban';
    const statusOptions = ['Backlog','Ready','In progress','In review','Done'].map((name,index) => ({ name,id: `OPTION_${index}` }));
    return { format_version: 1 as const, observed_at_ms: Date.now(),
      ...(kind === 'create_board' ? { project_id: projectId, owner_id: identity.owner_id, title: identity.board_name, project_url: 'https://github.com/users/test-user/projects/1' } : {}),
      ...(kind === 'configure_status' ? { project_id: projectId, owner_id: identity.owner_id, status_field_id: fieldId, status_field_name: 'Status', status_options: statusOptions } : {}),
      ...(kind === 'link_repository' ? { project_id: projectId, owner_id: identity.owner_id, repository_ids: [repositoryId] } : {}),
      ...(kind === 'configure_view' ? { project_id: projectId, owner_id: identity.owner_id, status_field_id: fieldId, status_field_name: 'Status', status_options: statusOptions,
        view_id: viewId, view_name: 'Kanban', view_layout: 'BOARD_LAYOUT' as const, visible_field_ids: [fieldId], group_by_field_ids: [fieldId] } : {}),
      ...(kind === 'verify_board' ? { project_id: projectId, owner_id: identity.owner_id, title: identity.board_name, project_url: 'https://github.com/users/test-user/projects/1', repository_ids: [repositoryId], status_field_id: fieldId,
        status_field_name: 'Status', status_options: statusOptions, view_id: viewId, view_name: 'Kanban', view_layout: 'BOARD_LAYOUT' as const,
        visible_field_ids: [fieldId], group_by_field_ids: [fieldId] } : {}) };
  };
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
    describeScaffoldRepository: vi.fn<NonNullable<ScaffoldDependencies['github']['describeScaffoldRepository']>>(async (e,_account,authorize) => {
      await authorize();
      return failure === 'description' ? unknown() : confirmed(e);
    }),
    scaffoldBoardCapability: vi.fn(() => ({ available: true, reason_code: 'BOARD_TARGET_NOT_AUTHORIZED' })),
    createBoardOperation: vi.fn<NonNullable<ScaffoldDependencies['github']['createBoardOperation']>>(async (operation,_target,repositoryId,_account,authorize,markSent) => {
      expect(storage.getCreationBoardOperation(operation.operation_id).state).toBe('running');
      if (operation.kind !== 'verify_board') { await authorize(); markSent(); boardSends.push(operation.kind); }
      if (failure === `${operation.kind}_throw`) throw new Error('Synthetic board transport error');
      if (failure === operation.kind) return { state: 'unknown', receipt: null, reason: 'RESPONSE_LOST' };
      return { state: 'confirmed', receipt: boardReceipt(operation.kind,operation.expected_identity,repositoryId), reason: null };
    }),
    reconcileBoardOperation: vi.fn(async operation => ({ state: 'confirmed' as const,
      receipt: boardReceipt(operation.kind,operation.expected_identity,'R_created'), reason: null })),
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
  const input: ScaffoldInputV3 = { name: 'Local name',templateId: template.id,templateDigest: template.digest,destinationRelative: 'project',
    creationMode: 'remote_push',baseBranch: 'release/base',triageEnabled: false,boardName: 'Kanban custom',
    remote: { ownerId: 'OWNER_test',name: 'different-name',visibility: 'private' } };
  const authorize = async (): Promise<CreateScaffold> => {
    const planned = await scaffold.plan(input); return { planHash: planned.planHash,plan: planned.plan,authorized: true };
  };
  return { directory,storage,db,github,workspaces,scaffold,input,authorize,sends,boardSends,setStorage: (value: typeof storage) => { storage = value; },changeAccount: () => { accountId = 'OTHER'; },
    restoreAccount: () => { accountId = 'ACCOUNT_test'; },existingRemote: () => { remote = { id: 'R_existing' }; } };
}
const etag = (f: Awaited<ReturnType<typeof fixture>>,id: string) => { const c = f.storage.getCreation(id).creation; return `"creation:${id}:${c.revision}"`; };

describe('remote scaffold journal and reconciliation with controlled adapters',() => {
  it('preserves all remote_push effects when description confirmation is lost and finishes by reconciliation', async () => {
    const f = await fixture('description'); const body = await f.authorize();
    const operation = await f.scaffold.create(body,randomUUID()); await f.scaffold.drain();
    const partial = f.scaffold.getCreation(operation.resource.id);
    expect(partial.creation.state).toBe('partial'); expect(partial.effects.every(effect => effect.state === 'confirmed')).toBe(true);
    const sends = [...f.sends];
    f.github.describeScaffoldRepository.mockImplementation(async e => ({ state: 'confirmed', receipt: e.receipt, reason: null, retryAtMs: null }));
    await f.scaffold.reconcile(operation.resource.id,randomUUID(),etag(f,operation.resource.id)); await f.scaffold.drain();
    const reconciledCreation = f.scaffold.getCreation(operation.resource.id);
    expect(reconciledCreation.creation.state, JSON.stringify(reconciledCreation)).toBe('completed'); expect(f.sends).toEqual(sends);
  });
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
    expect((await f.scaffold.getOptions()).creationModes.map(mode => mode.mode)).toEqual(['remote_push']);
    expect((await f.scaffold.getOptions()).creationModes.every(mode => mode.capability.available)).toBe(true);
    await f.authorize();
    expect(f.sends).toEqual([]);
    expect(existsSync(join(f.directory, 'project'))).toBe(false);
    expect(runner).not.toHaveBeenCalled();
    f.changeAccount();
    expect((await f.scaffold.getOptions()).creationModes.every(mode => !mode.capability.available)).toBe(true);
  });
  it('completes remote_push with its authorized board name and registers the same branch',async () => {
    const f = await fixture(); const body = await f.authorize(); const operationId = randomUUID();
    const op = await f.scaffold.create(body,operationId); await f.scaffold.drain();
    const view = f.scaffold.getCreation(op.resource.id);
    expect(view.creation, JSON.stringify(view)).toMatchObject({ state: 'completed',baselineSha: 'a'.repeat(40),baselineRef: 'refs/heads/release/base' });
    expect(f.sends).toEqual(['create_repository','associate_origin','baseline_push']);
    expect(view.remoteEffects.find(e => e.kind === 'baseline_push')?.state).toBe('confirmed');
    expect(view.creation.plan.input.boardName).toBe('Kanban custom');
    expect(view.board_operations.map(item => item.kind)).toEqual(['create_board','configure_status','link_repository','configure_view','verify_board']);
    for (const boardOperation of view.board_operations) {
      expect(boardOperation.state).toBe('confirmed');
      expect(boardOperation.receipt).not.toBeNull();
      expect(f.storage.getOperation(boardOperation.operation_id)?.state).toBe('succeeded');
    }
    const config = f.storage.getConfiguration(view.creation.projectId!).view.configuration;
    expect(config).toMatchObject({ base_branch: 'release/base',automation_enabled: false,github_project: { id: 'PVT_board', owner_id: 'OWNER_test', status_field_id: 'FIELD_status',
      status_option_ids: { backlog: 'OPTION_0', ready: 'OPTION_1', in_progress: 'OPTION_2', in_review: 'OPTION_3', delivered: 'OPTION_4' } }, source: { repository_id: 'R_created',repository_url: 'https://github.com/test-org/different-name' } });
    expect(view.board_operations.map(item => item.kind)).toEqual(['create_board','configure_status','link_repository','configure_view','verify_board']);
    const before = [...f.sends]; expect((await f.scaffold.create(body,operationId)).operation_id).toBe(operationId); await f.scaffold.drain(); expect(f.sends).toEqual(before);
    expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 0 }); expect(f.db.pragma('foreign_key_check')).toEqual([]);
    expect(() => f.db.prepare("UPDATE creation_board_operations SET kind='verify_board' WHERE operation_id=?").run(view.board_operations[0]!.operation_id)).toThrow();
    expect(() => f.db.prepare("INSERT INTO creation_steps(creation_id,step,state) VALUES (?, 'create_board','confirmed')").run(view.creation.id)).toThrow();
    for (const e of view.effects) expect(() => f.db.prepare("UPDATE effects SET reason='CHANGED' WHERE operation_id=?").run(e.operationId)).toThrow();
  });
  it('reopens the current schema without reseeding installation data', async () => {
    const f = await fixture(''); const before = f.db.prepare("SELECT installation_id,account_id,revision FROM factory_settings WHERE id='local'").get();
    const { applyMigrations, loadMigrations } = await import('../fixtures/historical-schema.js');
    applyMigrations(f.db,loadMigrations(),() => { throw new Error('MUST_NOT_RESEED'); });
    expect(f.db.prepare('SELECT installation_id,account_id,revision FROM factory_settings WHERE id=\'local\'').get()).toEqual(before);
    expect(f.db.prepare('SELECT * FROM creation_board_operations').all()).toEqual([]);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
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
  it.each(['repository','associate_origin','baseline_push','throw'])('reconciles %s response loss and resumes pending effects without duplicates',async failure => {
    const f = await fixture(failure); const body = await f.authorize(); const originalId = randomUUID(); const op = await f.scaffold.create(body,originalId); await f.scaffold.drain();
    const partial = f.scaffold.getCreation(op.resource.id); expect(partial.creation.state).toBe('partial'); expect(partial.effects.at(-1)?.state).toBe('unknown');
    const reconciliationId = randomUUID(); const precondition = etag(f,op.resource.id);
    const reconciled = await f.scaffold.reconcile(op.resource.id,reconciliationId,precondition); expect(reconciled.resource.type).toBe('creation'); await f.scaffold.drain();
    expect(f.storage.getOperation(reconciliationId)?.state).toBe('succeeded');
    expect(f.sends).toEqual(['create_repository','associate_origin','baseline_push']); const view = f.scaffold.getCreation(op.resource.id); expect(view.effects.every(effect => effect.state === 'confirmed')).toBe(true);
    expect(view.creation.state).toBe('completed');
    expect((await f.scaffold.create(body,originalId)).operation_id).toBe(originalId);
    expect((await f.scaffold.reconcile(op.resource.id,reconciliationId,precondition)).operation_id).toBe(reconciliationId); await f.scaffold.drain(); expect(f.sends).toEqual(['create_repository','associate_origin','baseline_push']);
    await expect(f.scaffold.reconcile(op.resource.id,reconciliationId,'"other"')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it.each(['create_board','configure_status','link_repository','configure_view','verify_board'])('reconciles a lost %s board effect without replaying it', async kind => {
    const f = await fixture(kind); const body = await f.authorize(); const original = randomUUID();
    const op = await f.scaffold.create(body,original); await f.scaffold.drain();
    const partial = f.scaffold.getCreation(op.resource.id); expect(partial.creation.state).toBe('partial');
    expect(partial.board_operations.find(item => item.kind === kind)?.state).toBe('unknown');
    await f.scaffold.reconcile(op.resource.id,randomUUID(),etag(f,op.resource.id)); await f.scaffold.drain();
    const finished = f.scaffold.getCreation(op.resource.id);
    expect(finished.creation.state).toBe('completed'); expect(new Set(f.boardSends).size).toBe(f.boardSends.length);
    expect(finished.board_operations.every(item => item.state === 'confirmed')).toBe(true);
  });
  it('reconciles a board adapter exception through E57 in the same controller without replaying the effect', async () => {
    const f = await fixture('configure_view_throw'); const original = await f.scaffold.create(await f.authorize(),randomUUID()); await f.scaffold.drain();
    const before = f.scaffold.getCreation(original.resource.id); expect(before.creation.state).toBe('partial');
    expect(before.board_operations.find(item => item.kind === 'configure_view')?.state).toBe('unknown');
    const sendsBeforeReconciliation = [...f.boardSends];
    await f.scaffold.reconcile(original.resource.id,randomUUID(),etag(f,original.resource.id)); await f.scaffold.drain();
    const finished = f.scaffold.getCreation(original.resource.id);
    expect(finished.creation.state).toBe('completed'); expect(finished.board_operations.every(item => item.state === 'confirmed')).toBe(true);
    expect(f.boardSends).toEqual(sendsBeforeReconciliation); expect(new Set(f.boardSends).size).toBe(f.boardSends.length);
  });
  it('reconciles a board effect when persisting its confirmation fails, without restarting the controller', async () => {
    const f = await fixture();
    f.db.exec(`CREATE TRIGGER fail_configure_view_confirmation BEFORE UPDATE OF state ON creation_board_operations
      WHEN NEW.kind='configure_view' AND NEW.state='confirmed' BEGIN SELECT RAISE(ABORT,'synthetic confirmation failure'); END;`);
    const original = await f.scaffold.create(await f.authorize(),randomUUID()); await f.scaffold.drain();
    const partial = f.scaffold.getCreation(original.resource.id);
    expect(partial.creation.state).toBe('partial'); expect(partial.board_operations.find(item => item.kind === 'configure_view')?.state).toBe('unknown');
    const sendsBeforeReconciliation = [...f.boardSends]; f.db.exec('DROP TRIGGER fail_configure_view_confirmation');
    await f.scaffold.reconcile(original.resource.id,randomUUID(),etag(f,original.resource.id)); await f.scaffold.drain();
    const finished = f.scaffold.getCreation(original.resource.id);
    expect(finished.creation.state).toBe('completed'); expect(finished.board_operations.every(item => item.state === 'confirmed')).toBe(true);
    expect(f.boardSends).toEqual(sendsBeforeReconciliation); expect(new Set(f.boardSends).size).toBe(f.boardSends.length);
  });
  it('reconciles an uncertain board effect through E57 before completing without replay', async () => {
    const f = await fixture('configure_view'); const original = await f.scaffold.create(await f.authorize(),randomUUID()); await f.scaffold.drain();
    const before = f.scaffold.getCreation(original.resource.id); expect(before.creation.state).toBe('partial');
    const beforeSends = [...f.boardSends]; const expectedEtag = etag(f,original.resource.id);
    await f.scaffold.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory,busyTimeoutMs: 10 }); cleanup.push(() => reopened.close());
    f.storage = reopened; f.setStorage(reopened); f.storage.interruptCreations();
    f.scaffold = createScaffold({ storage: reopened,github: f.github,workspaces: f.workspaces,logFailure: vi.fn() }); cleanup.push(() => f.scaffold.close());
    const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory,FACTORY_LOG_LEVEL: 'silent' },f.directory),f.storage,
      undefined,undefined,undefined,undefined,{ github: f.github,workspaces: f.workspaces }); cleanup.push(() => app.close());
    const base = { host: '127.0.0.1:4310',origin: 'http://127.0.0.1:4310','content-type': 'application/json','x-factory-client': 'web' };
    const session = await app.inject({ method: 'POST',url: '/api/v1/session',headers: base,payload: {} });
    const operationId = randomUUID();
    const headers = { ...base,cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<SessionResponse>().csrf_token,
      'idempotency-key': operationId,'if-match': expectedEtag };
    const url = `/api/v1/scaffold/creations/${original.resource.id}/reconcile`;
    const accepted = await app.inject({ method: 'POST',url,headers,payload: {} }); expect(accepted.statusCode).toBe(202);
    let observed = await app.inject({ url: `/api/v1/operations/${operationId}`,headers });
    for (let index = 0; index < 100 && !['succeeded','failed'].includes(observed.json<{ state: string }>().state); index += 1) {
      await new Promise(resolve => setTimeout(resolve,5)); observed = await app.inject({ url: `/api/v1/operations/${operationId}`,headers });
    }
    expect(observed.json<{ state: string }>().state, JSON.stringify({ creation: f.scaffold.getCreation(original.resource.id), reconciliation: f.db.prepare('SELECT * FROM creation_reconciliations WHERE operation_id=?').get(operationId) })).toBe('succeeded');
    const replay = await app.inject({ method: 'POST',url,headers,payload: {} }); expect(replay.statusCode).toBe(202);
    const finished = f.scaffold.getCreation(original.resource.id);
    expect(finished.creation.state).toBe('completed'); expect(finished.board_operations.every(item => item.state === 'confirmed')).toBe(true);
    expect(f.boardSends).toEqual(expect.arrayContaining(beforeSends)); expect(new Set(f.boardSends).size).toBe(f.boardSends.length);
    expect(f.storage.getOperation(operationId)?.state).toBe('succeeded');
  });
  it('serves strict V3 plans, requires board_name and resumes the same complete creation without duplicate effects', async () => {
    const f = await fixture();
    const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory,FACTORY_LOG_LEVEL: 'silent' },f.directory),f.storage,
      undefined,undefined,undefined,undefined,{ github: f.github,workspaces: f.workspaces }); cleanup.push(() => app.close());
    const base = { host: '127.0.0.1:4310',origin: 'http://127.0.0.1:4310','content-type': 'application/json','x-factory-client': 'web' };
    const session = await app.inject({ method: 'POST',url: '/api/v1/session',headers: base,payload: {} });
    const headers = { ...base,cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<SessionResponse>().csrf_token };
    const optionsResponse = await app.inject({ url: '/api/v1/scaffold/options',headers });
    expect(optionsResponse.statusCode).toBe(200); expect(Value.Check(HttpScaffoldOptions,optionsResponse.json())).toBe(true);
    expect(optionsResponse.json<HttpScaffoldOptions>().creation_modes.map(item => item.mode)).toEqual(['remote_push']);
    const input: import('#contracts').HttpScaffoldInput = { name: f.input.name,template_id: f.input.templateId,template_digest: f.input.templateDigest,
      destination_relative: f.input.destinationRelative,creation_mode: 'remote_push',base_branch: f.input.baseBranch,triage_enabled: true,
      remote: { owner_id: f.input.remote!.ownerId,name: f.input.remote!.name,visibility: f.input.remote!.visibility },board_name: 'Delivery board' };
    expect(Value.Check(HttpScaffoldInput,input)).toBe(true);
    for (const invalid of [
      { ...input,creation_mode: 'local' },
      { ...input,creation_mode: 'remote_no_push' },
      { ...input,board_name: undefined },
      { ...input,remote: undefined },
    ]) {
      const response = await app.inject({ method: 'POST',url: '/api/v1/scaffold/plans',headers,payload: invalid });
      expect(response.statusCode).toBe(400);
    }
    expect(f.sends).toEqual([]); expect(f.boardSends).toEqual([]);
    const plannedResponse = await app.inject({ method: 'POST',url: '/api/v1/scaffold/plans',headers,payload: input });
    expect(plannedResponse.statusCode).toBe(200);
    const planned = plannedResponse.json<HttpScaffoldPlanned>();
    expect(Value.Check(HttpScaffoldPlanned,planned)).toBe(true);
    expect(planned.plan.input).toEqual(input);
    const inspections = f.github.inspectScaffoldRemote.mock.calls.length;
    const changedPlan = { plan_hash: planned.plan_hash,plan: { ...planned.plan,input: { ...planned.plan.input,board_name: 'Changed after authorization' } },authorized: true };
    const changed = await app.inject({ method: 'POST',url: '/api/v1/scaffold/creations',headers: { ...headers,'idempotency-key': randomUUID() },payload: changedPlan });
    expect(changed.statusCode).toBe(400);
    f.changeAccount();
    const staleAccount = await app.inject({ method: 'POST',url: '/api/v1/scaffold/creations',headers: { ...headers,'idempotency-key': randomUUID() },payload: { plan_hash: planned.plan_hash,plan: planned.plan,authorized: true } });
    expect(staleAccount.statusCode).toBe(409); f.restoreAccount();
    expect(f.github.inspectScaffoldRemote).toHaveBeenCalledTimes(inspections);
    expect(f.github.createScaffoldRepository).not.toHaveBeenCalled(); expect(f.sends).toEqual([]); expect(f.boardSends).toEqual([]);
    const operationId = randomUUID();
    const command = { plan_hash: planned.plan_hash,plan: planned.plan,authorized: true };
    const accepted = await app.inject({ method: 'POST',url: '/api/v1/scaffold/creations',headers: { ...headers,'idempotency-key': operationId },payload: command });
    expect(accepted.statusCode).toBe(202);
    const acceptedBody = accepted.json<{ resource: { id: string } }>();
    let detail = await app.inject({ url: `/api/v1/scaffold/creations/${acceptedBody.resource.id}`,headers });
    for (let index = 0; index < 100 && detail.json<HttpCreationView>().creation.state !== 'completed'; index += 1) {
      await new Promise(resolve => setTimeout(resolve,5));
      detail = await app.inject({ url: `/api/v1/scaffold/creations/${acceptedBody.resource.id}`,headers });
    }
    expect(detail.statusCode).toBe(200); expect(Value.Check(HttpCreationView,detail.json())).toBe(true);
    const view = detail.json<HttpCreationView>();
    expect(view.creation.plan.input).toEqual(input); expect(view.board_name).toBe('Delivery board');
    expect(view.board_url).toBe('https://github.com/users/test-user/projects/1'); expect(view.next_action).toBe('none');
    expect(view.creation.state).toBe('completed');
    const sends = [...f.sends]; const boardSends = [...f.boardSends];
    const replay = await app.inject({ method: 'POST',url: '/api/v1/scaffold/creations',headers: { ...headers,'idempotency-key': operationId },payload: command });
    expect(replay.statusCode).toBe(202); expect(replay.json().operation_id).toBe(operationId);
    expect(f.sends).toEqual(sends); expect(f.boardSends).toEqual(boardSends);
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
    const f = await fixture('repository'); const op = await f.scaffold.create(await f.authorize(),randomUUID()); await f.scaffold.drain();
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
  it('refuses a completed creation with a retired local plan contract without changing its rows',async () => {
    const f = await fixture('');
    const planned = await f.scaffold.plan(f.input);
    const body: CreateScaffold = { planHash: planned.planHash,plan: planned.plan,authorized: true };
    const originalId = randomUUID(); const accepted = await f.scaffold.create(body,originalId); await f.scaffold.drain();
    const { remote: _remote, boardName: _boardName, ...localInput } = planned.plan.input;
    const retired = { ...planned.plan, input: { ...localInput, creationMode: 'local' } };
    const trigger = f.db.prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='creation_identity'").get()!.sql;
    f.db.exec('DROP TRIGGER creation_identity');
    f.db.prepare('UPDATE project_creations SET plan_json=? WHERE id=?').run(JSON.stringify(retired), accepted.resource.id);
    f.db.exec(trigger);
    const before = {
      creation: f.db.prepare('SELECT * FROM project_creations WHERE id=?').get(accepted.resource.id),
      operation: f.db.prepare('SELECT * FROM operation_requests WHERE operation_id=?').get(originalId),
      effects: f.db.prepare('SELECT * FROM effects WHERE creation_id=? ORDER BY operation_id').all(accepted.resource.id),
    };
    expect(() => openStorage({ dataDirectory: f.directory })).toThrowError(
      expect.objectContaining({ code: 'OPERATION_DATA_INVALID' }),
    );
    expect({
      creation: f.db.prepare('SELECT * FROM project_creations WHERE id=?').get(accepted.resource.id),
      operation: f.db.prepare('SELECT * FROM operation_requests WHERE operation_id=?').get(originalId),
      effects: f.db.prepare('SELECT * FROM effects WHERE creation_id=? ORDER BY operation_id').all(accepted.resource.id),
    }).toEqual(before);
  });
});
