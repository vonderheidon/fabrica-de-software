import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { publicationFixture } from '../fixtures/publication.js';
import { createTargetSelections } from '../../apps/controller/src/modules/publication/targets.js';
import type { TargetIdentity } from '../../apps/controller/src/modules/workspaces/publication-target.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';

describe('durable publication target selection', () => {
  it('derives the exact clone authorization from start without another operator action', async () => {
    const f = await publicationFixture(true,'commit',true,{ targetKind: 'clone' });
    try {
      f.workspaces.inspectPublicationTarget.mockImplementation(async (root,repositoryId,repositoryUrl) => ({ formatVersion: 1,root,parent: f.directory,parentIdentity: 'controlled-parent',directoryIdentity: null,repositoryId,repositoryUrl }));
      f.workspaces.clonePublicationTarget.mockImplementation(async (expected,reserve,authorize) => {
        authorize(); const reserved = { ...expected,directoryIdentity: 'controlled-clone' }; reserve(reserved); authorize(); return reserved;
      });
      await f.implement(); await f.approve();
      expect(f.workspaces.clonePublicationTarget).toHaveBeenCalledOnce();
      const selections = f.storage.getAttemptDetail(f.attemptId,{ section: 'target_selections' }).v3Details!;
      expect(selections.items[0]).toMatchObject({ state: 'confirmed',authorization_operation_id: f.status().operationId });
      const row = f.db.prepare('SELECT authorization_json FROM publication_target_selections').get() as { authorization_json: string };
      expect(JSON.parse(row.authorization_json)).toMatchObject({ origin: 'attempt_start' });
    } finally { await f.close(); }
  });
  async function fixture() {
    const f = await publicationFixture(); await f.implement();
    const path = join(f.directory,'destination');
    const expected: TargetIdentity = { formatVersion: 1, repositoryId: f.issue.repository.id, repositoryUrl: f.issue.repository.url,
      root: path, parent: dirname(path), parentIdentity: 'parent', directoryIdentity: null };
    const tasks: Array<() => Promise<void>> = [];
    const inspectPublicationTarget = vi.fn(async () => expected);
    const observePublicationTarget = vi.fn(async (identity: TargetIdentity) => ({ ...identity,directoryIdentity: identity.directoryIdentity ?? 'directory' }));
    const clonePublicationTarget = vi.fn(async (identity: TargetIdentity,reserve: (identity: TargetIdentity) => void,authorize: () => void) => {
      authorize(); const reserved = { ...identity,directoryIdentity: 'directory' }; reserve(reserved); authorize(); return reserved;
    });
    const service = createTargetSelections(f.storage,{ inspectPublicationTarget,observePublicationTarget,clonePublicationTarget },task => tasks.push(task),() => false);
    const body = { delivery_id: f.status().deliveryId!,repository_id: f.issue.repository.id,selection: { kind: 'clone' as const,destination: path },authorized: true as const };
    return { ...f,expected,service,tasks,body,inspectPublicationTarget,observePublicationTarget,clonePublicationTarget };
  }
  it('accepts before IO, confirms identity and replays without cloning twice', async () => {
    const f = await fixture();
    try {
      const context = f.context(); const operation = await f.service.select(f.attemptId,f.body,context);
      expect(operation.state).toBe('accepted'); expect(f.clonePublicationTarget).not.toHaveBeenCalled();
      expect(f.db.prepare('SELECT count(*) AS n FROM publication_requests').get()).toEqual({ n: 0 });
      const journal = f.db.prepare('SELECT authorization_json FROM publication_target_selections').get() as { authorization_json: string };
      expect(JSON.parse(journal.authorization_json)).toMatchObject({ origin: 'operator',authorization_operation_id: null });
      await f.tasks.shift()!();
      expect(f.storage.getOperation(operation.operation_id)).toMatchObject({ state: 'succeeded',progress: { kind: 'publication_target',target_selection: { identity_verified: true } } });
      await f.service.select(f.attemptId,f.body,context);
      expect(f.clonePublicationTarget).toHaveBeenCalledTimes(1);
      const page = f.storage.getAttemptDetail(f.attemptId,{ section: 'target_selections' });
      expect(page.v3Details?.items).toHaveLength(1);
      expect(f.storage.getEffects(f.attemptId).some(e => ['local_commit','push','pull_request'].includes(e.kind))).toBe(false);
      expect(() => f.db.prepare("UPDATE publication_target_selections SET local_path='other',revision=revision+1").run()).toThrow();
    } finally { await f.close(); }
  });
  it('rejects unrelated repository, delivery, hash and ICR start authority before inspection', async () => {
    const f = await fixture();
    try {
      for (const body of [{ ...f.body,repository_id: 'R_other' },{ ...f.body,delivery_id: randomUUID() },
        { ...f.body,authorization_operation_id: f.status().operationId },
        { ...f.body,authorization_operation_id: f.status().operationId,target_intent_hash: 'a'.repeat(64) }]) {
        await expect(f.service.select(f.attemptId,body,f.context())).rejects.toThrow();
      }
      expect(f.inspectPublicationTarget).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it('blocks concurrent selection and conflicting reuse of the key', async () => {
    const f = await fixture();
    try {
      const context = f.context(); await f.service.select(f.attemptId,f.body,context);
      await expect(f.service.select(f.attemptId,{ ...f.body,selection: { kind: 'clone',destination: join(f.directory,'other') } },context)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      await expect(f.service.select(f.attemptId,f.body,f.context())).rejects.toMatchObject({ code: 'TARGET_SELECTION_PENDING' });
      expect(f.clonePublicationTarget).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it('reconciles a lost response by observation and keeps uncertainty blocking new clones', async () => {
    const f = await fixture();
    try {
      const context = f.context(); await f.service.select(f.attemptId,f.body,context);
      f.clonePublicationTarget.mockImplementationOnce(async (identity,reserve) => { reserve({ ...identity,directoryIdentity: identity.directoryIdentity ?? 'directory' }); throw new Error('lost response'); });
      await f.tasks.shift()!(); expect(f.storage.getTargetSelection(context.operationId).view.state).toBe('unknown');
      await expect(f.service.select(f.attemptId,f.body,f.context())).rejects.toMatchObject({ code: 'TARGET_SELECTION_PENDING' });
      await f.service.select(f.attemptId,f.body,context); await f.tasks.shift()!();
      expect(f.storage.getTargetSelection(context.operationId).view.state).toBe('confirmed');
      expect(f.clonePublicationTarget).toHaveBeenCalledTimes(1); expect(f.observePublicationTarget).toHaveBeenCalledOnce();
    } finally { await f.close(); }
  });
  it('restart marks running unknown and retains the reserved identity', async () => {
    const f = await fixture();
    try {
      const context = f.context(); await f.service.select(f.attemptId,f.body,context);
      f.storage.advanceTargetSelection(context.operationId,1,'running',{ ...f.expected,directoryIdentity: 'reserved' },null);
      const restarted = openStorage({ dataDirectory: f.directory });
      try { expect(restarted.getTargetSelection(context.operationId)).toMatchObject({ view: { state: 'unknown' },expected: { directoryIdentity: 'reserved' } }); }
      finally { restarted.close(); }
      expect(f.clonePublicationTarget).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it('checks an existing clone without writing or granting publication effects', async () => {
    const f = await fixture();
    try {
      f.expected.directoryIdentity = 'existing';
      await f.service.select(f.attemptId,{ ...f.body,selection: { kind: 'existing_clone',path: f.expected.root } },f.context());
      await f.tasks.shift()!();
      expect(f.observePublicationTarget).toHaveBeenCalledOnce(); expect(f.clonePublicationTarget).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it('exposes authenticated V01, operation progress and the bounded detail section', async () => {
    const f = await publicationFixture(); await f.implement();
    const config = loadConfiguration({ FACTORY_DATA_DIR: f.directory,FACTORY_LOG_LEVEL: 'silent' },f.directory);
    const app = createApp(config,f.storage,undefined,undefined,undefined,f.pipeline);
    try {
      const host = new URL(config.browserOrigin).host; const origin = config.browserOrigin;
      const url = `/api/v1/attempts/${f.attemptId}/publication/target`;
      const payload = { delivery_id: f.status().deliveryId!,repository_id: f.issue.repository.id,selection: { kind: 'existing_clone',path: join(f.directory,'target') },authorized: true };
      expect((await app.inject({ method: 'POST',url,headers: { host,origin },payload })).statusCode).toBe(401);
      const session = await app.inject({ method: 'POST',url: '/api/v1/session',headers: { host,origin,'x-factory-client': 'web','content-type': 'application/json' },payload: {} });
      const headers = { host,origin,cookie: session.headers['set-cookie']!.toString().split(';')[0]!,'x-csrf-token': session.json<{ csrf_token: string }>().csrf_token,
        'idempotency-key': randomUUID(),'if-match': `"${f.attemptId}:${f.status().revision}"` };
      const accepted = await app.inject({ method: 'POST',url,headers,payload }); expect(accepted.statusCode,accepted.body).toBe(202);
      await f.pipeline.drain();
      const operationId = accepted.json<{ operation_id: string }>().operation_id;
      const status = await app.inject({ url: `/api/v1/operations/${operationId}`,headers });
      expect(status.statusCode,status.body).toBe(200); expect(status.json()).toMatchObject({ state: 'succeeded',progress: { kind: 'publication_target',target_selection: { identity_verified: true } } });
      const detail = await app.inject({ url: `/api/v1/attempts/${f.attemptId}?section=target_selections&limit=1`,headers });
      expect(detail.statusCode,detail.body).toBe(200); expect(detail.json()).toMatchObject({ v3_details: { section: 'target_selections',items: [{ operation_id: operationId }] } });
      const replay = await app.inject({ method: 'POST',url,headers,payload }); expect(replay.statusCode,replay.body).toBe(202);
      expect(f.workspaces.observePublicationTarget).toHaveBeenCalledOnce();
    } finally { await app.close(); await f.close(); }
  });
});
