import { toHttpCompletePublication } from '../../apps/controller/src/http/execution-views.js';
import { randomUUID } from 'node:crypto';
import { removeQueueSchedulerSchema } from '../fixtures/queue-schema.js';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { confirmTerminalStops } from '../fixtures/attempt.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createPublication } from '../../apps/controller/src/modules/publication/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';

const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(hasDelta = true) { const f = await publicationFixture(true,'commit',hasDelta); fixtures.push(f); return f; }
const request = (f: PublicationFixture) => ({ deliveryId: f.status().deliveryId!, authorizedMode: 'commit' as const, authorized: true as const });

it('commits only after durable intent/claim, then comments and completes without a GitHub code publication', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockImplementation(async (d,e,authorize) => {
    expect(f.storage.getEffect(e.operationId)).toMatchObject({ state: 'running', deliveryId: d.id });
    expect(f.storage.getOperation(e.operationId)?.receipt).toBeDefined();
    expect(f.storage.getReview(d.id)?.state).toBe('approved'); expect(f.issue.comments).toEqual([]);
    return commit(d,e,authorize);
  });
  await f.approve();
  expect(f.status()).toMatchObject({ phase: 'finished', result: 'delivered' });
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce();
  const effects = f.storage.getEffects(f.attemptId);
  expect(effects.map(e => e.kind)).toEqual(['project_status','project_status','local_commit','issue_comment','project_status']);
  const local = effects.find(e => e.kind === 'local_commit')!;
  expect(local.receipt).toMatchObject({ parentSha: 'a'.repeat(40), operationId: local.operationId, contentIdentity: f.storage.getDelivery(local.deliveryId!).delivery.contentIdentity });
  expect(f.issue.comments[0]!.body).toContain(local.receipt!.id);
  expect(f.storage.getDeliveryDetail(local.deliveryId!,{}).publication).toMatchObject({ localState: 'completed', commit: { state: 'confirmed', sha: local.receipt!.id } });
  expect(f.mutateEffect.mock.calls.every(([x]) => ['project_status','issue_comment'].includes(x.effect.kind))).toBe(true);
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('records a reviewed no-delta delivery as not applicable and creates no empty commit', async () => {
  const f = await fixture(false); await f.implement();
  expect(() => f.pipeline.completePublication(f.attemptId,request(f),f.context())).toThrow(expect.objectContaining({ code: 'PUBLICATION_BLOCKED' }));
  expect(f.workspaces.createLocalCommit).not.toHaveBeenCalled();
  await f.approve();
  const effect = f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')!;
  expect(effect).toMatchObject({ state: 'not_applicable', reason: 'APPROVED_NO_DELTA', receipt: null });
  expect(f.status().result).toBe('delivered');
  expect(f.issue.comments[0]!.body).toContain('nenhum commit vazio');
  expect(f.storage.getDeliveryDetail(effect.deliveryId!,{}).publication.commit).toMatchObject({ state: 'not_applicable', sha: null });
  expect(() => f.storage.finishEffect(effect.operationId,effect.revision,'confirmed',{ id: 'd'.repeat(40) },null)).not.toThrow();
  expect(f.storage.getEffect(effect.operationId).state).toBe('not_applicable');
});

it('reconciles a lost response without a second commit and completes only on an explicit subsequent action', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockImplementation(async (d,e,a) => {
    const result = await commit(d,e,a);
    f.workspaces.reconcileLocalCommit.mockResolvedValue(result);
    return { state: 'unknown',receipt: null,reason: 'RESPONSE_LOST' };
  });
  await f.approve(); expect(f.status().result).toBeNull(); expect(f.issue.comments).toEqual([]);
  const d = f.status().deliveryId!;
  expect(f.storage.getDeliveryDetail(d,{}).publication).toMatchObject({ commit: { state: 'unknown' },reconcileCapability: { available: true } });
  f.pipeline.reconcilePublication(f.attemptId,{ deliveryId: d },f.context()); await f.pipeline.drain();
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')?.state).toBe('confirmed');
  expect(f.status().result).toBeNull(); expect(f.issue.comments).toEqual([]);
  const context = f.context(); const op = f.pipeline.completePublication(f.attemptId,request(f),context); await f.pipeline.drain();
  expect(f.storage.getOperation(op.operation_id)?.state).toBe('succeeded');
  expect(f.pipeline.completePublication(f.attemptId,request(f),context).receipt).toEqual(op.receipt); await f.pipeline.drain();
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce(); expect(f.issue.comments).toHaveLength(1);
});

it('turns an observed absent delivery branch into a known failure before an explicit safe retry', async () => {
  const f = await fixture(); await f.implement();
  const create = f.workspaces.createTargetCommit.getMockImplementation()!;
  f.workspaces.createTargetCommit.mockResolvedValueOnce({ state:'unknown',receipt:null,reason:'LOCAL_RESPONSE_LOST' });
  await f.approve();
  const target = f.storage.findDeliveryTarget(f.attemptId,f.status().deliveryId!)!;
  const local = f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')!;
  expect(local.state).toBe('unknown');
  f.workspaces.reconcileTargetCommit.mockResolvedValueOnce({ state:'failed_known',receipt:null,reason:'COMMIT_NOT_OBSERVED' });
  f.pipeline.reconcilePublication(f.attemptId,{ deliveryId:target.delivery_id },f.context()); await f.pipeline.drain();
  expect(f.storage.getEffect(local.operationId)).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });
  expect(f.issue.comments).toEqual([]);
  f.workspaces.createTargetCommit.mockImplementation(create);
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain();
  expect(f.storage.getEffect(local.operationId).state).toBe('confirmed');
  expect(f.workspaces.createTargetCommit).toHaveBeenCalledTimes(2);
  expect(f.status().result).toBe('delivered');
});

it('preserves approval and earlier effects on a known commit failure without restarting implementation', async () => {
  const f = await fixture(); await f.implement();
  const count = vi.mocked(f.execution.startPassage).mock.calls.length;
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockResolvedValueOnce({ state: 'failed_known', receipt: null, reason: 'CONTEXT_UNAVAILABLE' });
  await f.approve(); const d = f.status().deliveryId!;
  expect(f.storage.getReview(d)?.state).toBe('approved'); expect(f.issue.comments).toEqual([]);
  expect(f.storage.getDeliveryDetail(d,{}).publication.commit?.state).toBe('failed_known');
  f.workspaces.createLocalCommit.mockImplementation(commit);
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain();
  expect(f.status().result).toBe('delivered'); expect(vi.mocked(f.execution.startPassage).mock.calls).toHaveLength(count);
  expect(f.storage.getEffects(f.attemptId).filter(e => e.kind === 'local_commit')).toHaveLength(1);
});

it('blocks commit IO on intention rollback and forbids changing the captured mode', async () => {
  const f = await fixture(); await f.implement();
  f.db.exec("CREATE TRIGGER fail_commit BEFORE INSERT ON effects WHEN NEW.kind='local_commit' BEGIN SELECT RAISE(ABORT,'FIXTURE'); END");
  await f.approve(); expect(f.workspaces.createLocalCommit).not.toHaveBeenCalled(); expect(f.issue.comments).toEqual([]);
  expect(f.storage.getEffects(f.attemptId).some(e => e.kind === 'local_commit')).toBe(false);
  expect(() => f.pipeline.completePublication(f.attemptId,{ ...request(f),authorizedMode: 'icr' },f.context())).toThrow(expect.objectContaining({ code: 'MODE_NOT_AUTHORIZED' }));
  f.db.exec('DROP TRIGGER fail_commit');
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain(); expect(f.status().result).toBe('delivered');
});

it('retains a late commit fact after cancellation without sending the following comment', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockImplementation(async (d,e,authorize) => {
    const result = await commit(d,e,authorize);
    f.pipeline.cancelAttempt(f.attemptId,{},f.context());
    return result;
  });
  await f.approve();
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')?.state).toBe('confirmed');
  expect(f.status().result).toBe('cancelled'); expect(f.issue.comments).toEqual([]);
});

it('completes from retained content after implementation removal and restart with old resources reconciled', async () => {
  const f = await fixture(); await f.implement();
  f.workspaces.createLocalCommit.mockResolvedValueOnce({ state: 'failed_known',receipt: null,reason: 'CONTEXT_UNAVAILABLE' });
  await f.approve(); const deliveryId = f.status().deliveryId!;
  f.db.prepare("UPDATE resources SET removed=1,revision=revision+1 WHERE attempt_id=? AND kind='implementation'").run(f.attemptId);
  await f.pipeline.close(); f.storage.close();
  const storage = openStorage({ dataDirectory: f.directory });
  try {
    confirmTerminalStops(f, f.attemptId, storage.executionPersistence());
    const tasks: Promise<void>[] = [];
    const publication = createPublication({ storage,github: f.github,workspaces: f.workspaces,verification: f.verification,
      cancelAttempt: async () => {},isClosed: () => false,logFailure: vi.fn(),enqueue: task => { tasks.push(task()); } });
    const op = publication.complete(f.attemptId,{ deliveryId,authorizedMode: 'commit',authorized: true },{ operationId: randomUUID(),expectedRevision: `"${f.attemptId}:${storage.getAttempt(f.attemptId).revision}"` });
    await Promise.all(tasks);
    expect(storage.getOperation(op.operation_id)?.state).toBe('succeeded'); expect(storage.getAttempt(f.attemptId).result).toBe('delivered');
    expect(f.folderCapability).not.toHaveBeenCalled(); expect(storage.getReview(deliveryId)?.state).toBe('approved');
  } finally { storage.close(); }
});

it('does not send a comment when recording the Git receipt fails, and reconciles without another commit', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockImplementation(async (d,e,authorize) => {
    const result = await commit(d,e,authorize); f.workspaces.reconcileLocalCommit.mockResolvedValue(result); return result;
  });
  f.db.exec("CREATE TRIGGER fail_receipt BEFORE UPDATE ON effects WHEN NEW.kind='local_commit' AND NEW.state='confirmed' BEGIN SELECT RAISE(ABORT,'FIXTURE'); END");
  await f.approve(); expect(f.issue.comments).toEqual([]); expect(f.status().result).toBeNull();
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')?.state).toBe('running');
  f.db.exec('DROP TRIGGER fail_receipt');
  f.pipeline.reconcilePublication(f.attemptId,{ deliveryId: f.status().deliveryId! },f.context()); await f.pipeline.drain();
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain();
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce(); expect(f.status().result).toBe('delivered');
});

it('migrates actual v13 effect/request definitions preserving confirmed historical receipts and their order', async () => {
  const f = await publicationFixture(); fixtures.push(f); await f.implement(); await f.approve();
  const effects = f.storage.getEffects(f.attemptId); const instanceId = f.storage.getSettings().installation_id;
  await f.pipeline.close(); f.storage.close();
  const sql = readFileSync(new URL('../../apps/controller/src/modules/storage/migrations/011_publication_queries.sql',import.meta.url),'utf8');
  f.db.transaction(() => {
    removeQueueSchedulerSchema(f.db);
    f.db.exec('DROP TABLE publication_upgrades');
    for (const table of ['effects','publication_requests']) {
      const rows = f.db.prepare<[],Record<string,unknown>>(`SELECT * FROM ${table} ORDER BY rowid`).all();
      f.db.exec(`DROP TABLE ${table}`);
      const start = sql.indexOf(`CREATE TABLE ${table} (`);
      const end = sql.indexOf(table === 'effects' ? 'CREATE TABLE publication_requests' : 'CREATE TABLE attempt_authority');
      f.db.exec(sql.slice(start,end));
      for (const row of rows) {
        const columns = Object.keys(row);
        f.db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row));
      }
    }
    f.db.exec(sql.slice(sql.indexOf('CREATE TRIGGER effect_identity'),sql.indexOf('CREATE INDEX attempts_account_created')));
    f.db.exec('DELETE FROM schema_migrations WHERE version>=14; PRAGMA user_version=13');
  })();
  const storage = openStorage({ dataDirectory: f.directory });
  try {
    expect(storage.getDiagnostics().schemaVersion).toBe(49); expect(storage.getSettings().installation_id).toBe(instanceId);
    expect(storage.getEffects(f.attemptId)).toEqual(effects); expect(f.db.pragma('foreign_key_check')).toEqual([]);
    expect(() => f.db.prepare("UPDATE effects SET reason='changed' WHERE operation_id=?").run(effects[0]!.operationId)).toThrow();
    expect(storage.getAttempt(f.attemptId).result).toBe('delivered');
  } finally { storage.close(); }
});

it('exposes Commit completion and its receipt through the existing protected HTTP contracts', async () => {
  const f = await fixture(); await f.implement();
  f.workspaces.createLocalCommit.mockResolvedValueOnce({ state: 'failed_known',receipt: null,reason: 'CONTEXT_UNAVAILABLE' });
  await f.approve();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory,FACTORY_PORT: '4317',FACTORY_LOG_LEVEL: 'silent' },process.cwd()),f.storage,undefined,undefined,undefined,f.pipeline);
  await app.ready();
  try {
    // App startup revokes old coordination. The fixture supplies an explicit stop observation before completion.
    confirmTerminalStops(f, f.attemptId);
    const boot = await app.inject({ method: 'POST',url: '/api/v1/session',headers: { host: '127.0.0.1:4317',origin: 'http://127.0.0.1:4317','x-factory-client': 'web' },payload: {} });
    const cookie = String(boot.headers['set-cookie']).split(';')[0]!;
    const context = f.context(); const path = `/api/v1/attempts/${f.attemptId}/publication/complete`;
    const headers = { host: '127.0.0.1:4317',origin: 'http://127.0.0.1:4317',cookie,'x-csrf-token': boot.json<{ csrf_token: string }>().csrf_token,'if-match': context.expectedRevision,'idempotency-key': context.operationId };
    const denied = await app.inject({ method: 'POST',url: path,headers: { ...headers,'x-csrf-token': 'invalid' },payload: toHttpCompletePublication(request(f)) });
    expect(denied.statusCode).toBe(403);
    const response = await app.inject({ method: 'POST',url: path,headers,payload: toHttpCompletePublication(request(f)) });
    expect({ status: response.statusCode,code: response.statusCode >= 400 ? response.json<{ code: string }>().code : null }).toEqual({ status: 202,code: null });
    expect(response.headers.location).toBe(`/api/v1/operations/${context.operationId}`);
    await f.pipeline.drain();
    const get = await app.inject({ method: 'GET',url: `/api/v1/deliveries/${f.status().deliveryId}`,headers: { host: headers.host,cookie } });
    expect(get.statusCode).toBe(200);
    expect(get.json<{ publication: { commit: unknown; local_state: string } }>().publication).toMatchObject({ local_state: 'completed',commit: { state: 'confirmed',sha: 'c'.repeat(40) } });
  } finally { await app.close(); }
});
