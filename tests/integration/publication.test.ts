import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { complete } from '../fixtures/attempt.js';
import { createPublication } from '../../apps/controller/src/modules/publication/index.js';
import { removePublicationSchema } from '../fixtures/publication-schema.js';

const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() { const f = await publicationFixture(); fixtures.push(f); return f; }
function publicationServiceFixture(f: PublicationFixture, storage = f.storage) {
  const tasks: Promise<void>[] = [];
  const publication = createPublication({ storage, github: f.github, workspaces: f.workspaces, verification: f.verification,
    cancelAttempt: async id => { await f.pipeline.cancelAttempt(id,{},f.context()); }, isClosed: () => false, logFailure: vi.fn(), enqueue: action => { tasks.push(action()); } });
  return { publication, async drain() { await Promise.all(tasks); } };
}

it('requires explicit current authorization and reconciled resources after restart without restoring an agent session', async () => {
  const f = await fixture(); await f.implement();
  const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(input => input.effect.kind === 'issue_comment' ? Promise.resolve({ state: 'failed_known',receipt: null,reason: 'MUTATION_NOT_AUTHORIZED',retryAtMs: null }) : write(input));
  await f.approve(); const deliveryId = f.status().deliveryId!; const identity = f.storage.getSettings().installation_id;
  await f.pipeline.close(); f.storage.close();
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    expect(reopened.getAttempt(f.attemptId).result).toBe('interrupted'); expect(reopened.getSettings().installation_id).toBe(identity);
    const n = vi.mocked(f.execution.startPassage).mock.calls.length;
    const local = publicationServiceFixture(f,reopened);
    const request = { deliveryId,authorizedMode: 'icr' as const,authorized: true as const };
    const context = () => ({ operationId: randomUUID(),expectedRevision: `"${f.attemptId}:${reopened.getAttempt(f.attemptId).revision}"` });
    expect(() => local.publication.complete(f.attemptId,request,context())).toThrow(expect.objectContaining({ code: 'RESOURCES_NOT_RECONCILED' }));
    expect(reopened.getDeliveryDetail(deliveryId,{}).publication.completeCapability).toEqual({ available: false,reason_code: 'RESOURCES_NOT_RECONCILED' });
    // Controlled trusted-host stop observation. No claim that Maestri was physically exercised.
    f.db.prepare("UPDATE resources SET stop_state='confirmed' WHERE attempt_id=? AND kind='terminal'").run(f.attemptId);
    f.mutateEffect.mockImplementation(write);
    const op = local.publication.complete(f.attemptId,request,context()); await local.drain();
    expect(reopened.getOperation(op.operation_id)?.state).toBe('succeeded'); expect(reopened.getAttempt(f.attemptId).result).toBe('delivered');
    expect(vi.mocked(f.execution.startPassage).mock.calls).toHaveLength(n); expect(f.issue.comments).toHaveLength(1);
  } finally { reopened.close(); }
});

it('completes ICR from the approved version with durable comment/status intentions and no delivery commit or push', async () => {
  const f = await fixture(); expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('PROGRESS');
  await f.implement(); expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('REVIEW');
  const accepted = await f.approve();
  expect(f.status()).toMatchObject({ phase: 'finished', result: 'delivered', suspension: null });
  const d = f.storage.getDelivery(f.status().deliveryId!).delivery;
  expect(f.storage.getReview(d.id)).toMatchObject({ state: 'approved', contentIdentity: d.contentIdentity });
  expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('DELIVERED');
  expect(f.issue.comments).toHaveLength(1); expect(f.issue.comments[0]!.body).toContain(d.contentIdentity);
  expect(f.issue.comments[0]!.body).toContain('sem commit de entrega ou push');
  expect(f.storage.getEffects(f.attemptId).map(e => e.state)).toEqual(['confirmed','confirmed','confirmed','confirmed']);
  expect(f.mutateEffect.mock.calls.map(([input]) => input.effect.kind)).toEqual(['project_status','project_status','issue_comment','project_status']);
  for (const [input] of f.mutateEffect.mock.calls) {
    const op = f.storage.getOperation(input.effect.operationId); expect(op?.receipt).toBeDefined();
    expect(input.effect.state).toBe('running'); expect(input.effect.sentAtMs).not.toBeNull();
  }
  expect(f.persistence.getResult({ passageId: accepted.binding.passageId })?.receiptId).toBe(accepted.receiptId);
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('orders projected transitions by their durable insertion even when all timestamps are equal', async () => {
  const clock = vi.spyOn(Date,'now').mockReturnValue(1_729_018_000_000);
  try { const f = await fixture(); await f.implement(); await f.approve(); expect(f.status().result).toBe('delivered'); expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('DELIVERED'); }
  finally { clock.mockRestore(); }
});

it('reserves global receipt sequences even when another account has more recent events', async () => {
  const f = await fixture(); await f.implement();
  const operationId = randomUUID(); const installationId = f.storage.getSettings().installation_id;
  f.db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('OTHER','other',1,1,1);
  f.db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
    VALUES (?,?,'OTHER','settings.update','settings','local',?,'{}','{}')`).run(operationId,installationId,'a'.repeat(64));
  f.db.prepare("INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms) VALUES ('settings','local',?,'settings.updated',1,'{}',1)").run(operationId);
  await f.approve(); expect(f.status().result).toBe('delivered'); expect(f.issue.comments).toHaveLength(1);
  for (const e of f.storage.getEffects(f.attemptId)) expect(f.storage.getOperation(e.operationId)?.state).toBe('succeeded');
});

it('blocks completion before approval and rejects an unauthorized delivery mode or missing/stale CAS', async () => {
  const f = await fixture(); await f.implement(); const deliveryId = f.status().deliveryId!;
  const request = { deliveryId,authorizedMode: 'icr' as const,authorized: true as const };
  expect(() => f.pipeline.completePublication(f.attemptId,request,{ ...f.context(),expectedRevision: undefined })).toThrow(expect.objectContaining({ statusCode: 428 }));
  expect(() => f.pipeline.completePublication(f.attemptId,request,{ ...f.context(),expectedRevision: '"stale"' })).toThrow(expect.objectContaining({ statusCode: 412 }));
  expect(() => f.pipeline.completePublication(f.attemptId,{ ...request,authorizedMode: 'pr' },f.context())).toThrow(expect.objectContaining({ code: 'MODE_NOT_AUTHORIZED' }));
  expect(() => f.pipeline.completePublication(f.attemptId,request,f.context())).toThrow(expect.objectContaining({ code: 'PUBLICATION_BLOCKED' }));
  expect(f.issue.comments).toEqual([]);
});

it.each(['closed_issue','missing_project','owner_changed','field_option_removed','remote_changed','partial_read'])('blocks the current publication gate for %s and preserves approval', async scenario => {
  const f = await fixture(); await f.implement(); const writes = f.mutateEffect.mock.calls.length;
  if (scenario === 'closed_issue') f.issue.state = 'CLOSED';
  if (scenario === 'missing_project') f.issue.memberships = [];
  if (scenario === 'owner_changed') f.project.project.owner.id = 'OTHER';
  if (scenario === 'field_option_removed') f.project.singleSelectFields[0]!.options.pop();
  if (scenario === 'remote_changed') f.github.getRepository.mockResolvedValue(complete({ ...f.issue.repository,id: 'OTHER' }));
  if (scenario === 'partial_read') vi.mocked(f.github.getIssueContextById).mockResolvedValue({ state: 'partial',data: f.issue,diagnostics: [],retryAtMs: null });
  await f.approve(); expect(f.status().result).toBeNull(); expect(f.issue.comments).toEqual([]); expect(f.mutateEffect).toHaveBeenCalledTimes(writes);
  expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('approved');
});

it.each(['retained_version','environment'])('preserves approved content and prevents a comment if %s integrity is unavailable', async target => {
  const f = await fixture(); await f.implement();
  if (target === 'retained_version') f.verifyRetainedDelivery.mockRejectedValueOnce(new Error('UNAVAILABLE'));
  else f.folderCapability.mockResolvedValueOnce({ available: false,reason: 'RESOURCE_MISSING' });
  await f.approve(); expect(f.issue.comments).toEqual([]); expect(f.status().result).toBeNull(); expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('approved');
});

it('allows correction and a new review to project their stages without adopting an earlier version approval', async () => {
  const f = await fixture(); await f.implement(); const old = f.status().deliveryId!; await f.approve(false);
  expect(f.status().round).toBe(2); expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('PROGRESS');
  expect(f.storage.getReview(old)?.state).toBe('rejected');
  await f.implement(); expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('REVIEW'); await f.approve();
  expect(f.status().result).toBe('delivered'); expect(f.issue.comments).toHaveLength(1); expect(f.issue.comments[0]!.body).toContain(f.status().deliveryId);
  expect(f.issue.comments[0]!.body).not.toContain(`Versão: ${old}`); expect(f.execution.continuePassage).toHaveBeenCalledOnce();
});

it('does not replay an unknown Status when readback is partial, and does not send the following comment', async () => {
  const f = await fixture(); const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(async input => {
    const result = await write(input);
    if (input.effect.expectedIdentity.optionId === 'REVIEW') vi.mocked(f.github.getIssueContextById).mockResolvedValueOnce({ state: 'partial',data: f.issue,diagnostics: [],retryAtMs: null });
    return result;
  });
  await f.implement(); const unknown = f.storage.getEffects(f.attemptId).find(e => e.expectedIdentity.optionId === 'REVIEW');
  expect(unknown?.state).toBe('unknown');
  // Keep readback degraded while approval triggers the completion attempt.
  vi.mocked(f.github.getIssueContextById).mockResolvedValue({ state: 'partial',data: f.issue,diagnostics: [],retryAtMs: null });
  await f.approve(); expect(f.issue.comments).toEqual([]); expect(f.status().result).toBeNull();
  expect(f.mutateEffect.mock.calls.filter(([input]) => input.effect.expectedIdentity.optionId === 'REVIEW')).toHaveLength(1);
});

it('preserves approval on an unknown comment, reconciles its exact marker/hash/author and never sends it twice', async () => {
  const f = await fixture(); await f.implement();
  const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(async input => {
    const result = await write(input);
    return input.effect.kind === 'issue_comment' ? { state: 'unknown', receipt: null, reason: 'TIMEOUT_AFTER_SEND', retryAtMs: null } : result;
  });
  await f.approve(); expect(f.status().result).toBeNull();
  expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('approved');
  expect(f.storage.getDeliveryDetail(f.status().deliveryId!,{}).publication).toMatchObject({
    completeCapability: { available: false,reason_code: 'EFFECT_UNRESOLVED' },reconcileCapability: { available: true },unknownEffects: 1,
  });
  const command = f.context(); const body = { deliveryId: f.status().deliveryId! };
  const op = f.pipeline.reconcilePublication(f.attemptId,body,command); await f.pipeline.drain();
  expect(f.storage.getOperation(op.operation_id)?.state).toBe('succeeded');
  expect(f.issue.comments).toHaveLength(1);
  expect(f.storage.getDeliveryDetail(body.deliveryId,{}).publication.completeCapability.available).toBe(true);
  const completion = f.context(); const request = { deliveryId: body.deliveryId, authorizedMode: 'icr' as const, authorized: true as const };
  const completed = f.pipeline.completePublication(f.attemptId,request,completion); await f.pipeline.drain();
  expect(f.storage.getOperation(completed.operation_id)?.state).toBe('succeeded');
  expect(f.status().result).toBe('delivered');
  expect(f.storage.getDeliveryDetail(body.deliveryId,{}).publication.completeCapability).toEqual({ available: false,reason_code: 'MODE_COMPLETED' });
  const calls = f.mutateEffect.mock.calls.length;
  expect(f.pipeline.completePublication(f.attemptId,request,completion).receipt).toEqual(completed.receipt);
  await f.pipeline.drain(); expect(f.mutateEffect).toHaveBeenCalledTimes(calls);
  expect(() => f.pipeline.completePublication(f.attemptId,{ ...request, authorizedMode: 'pr' },completion)).toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
});

it('refuses ICR completion when the owned implementation environment has been removed', async () => {
  const f = await fixture(); await f.implement();
  const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(input => input.effect.kind === 'issue_comment'
    ? Promise.resolve({ state: 'failed_known',receipt: null,reason: 'MUTATION_NOT_AUTHORIZED',retryAtMs: null }) : write(input));
  await f.approve(); const deliveryId = f.status().deliveryId!;
  f.db.prepare("UPDATE resources SET removed=1,revision=revision+1 WHERE attempt_id=? AND kind='implementation'").run(f.attemptId);
  const calls = f.mutateEffect.mock.calls.length;
  expect(f.storage.getDeliveryDetail(deliveryId,{}).publication.completeCapability).toEqual({ available: false,reason_code: 'ICR_ENVIRONMENT_UNAVAILABLE' });
  expect(() => f.pipeline.completePublication(f.attemptId,{ deliveryId,authorizedMode: 'icr',authorized: true },f.context()))
    .toThrow(expect.objectContaining({ code: 'ICR_ENVIRONMENT_UNAVAILABLE' }));
  expect(f.mutateEffect).toHaveBeenCalledTimes(calls);
  expect(f.storage.getReview(deliveryId)?.state).toBe('approved');
});

it('keeps an absent, partial, forged or duplicate marker unknown without blind retry', async () => {
  const f = await fixture(); await f.implement();
  f.mutateEffect.mockImplementation(async () => ({ state: 'unknown', receipt: null, reason: 'TIMEOUT_AFTER_SEND', retryAtMs: null }));
  await f.approve(); const deliveryId = f.status().deliveryId!; const count = f.mutateEffect.mock.calls.length;
  for (const scenario of ['absent','forged','duplicate','partial']) {
    const effect = f.storage.getEffects(f.attemptId).find(e => e.kind === 'issue_comment')!;
    f.issue.comments = scenario === 'absent' ? [] : [1, ...(scenario === 'duplicate' ? [2] : [])].map(i => ({ id: `C_${i}`, url: f.issue.url+'#comment',
      body: effect.expectedIdentity.marker+'\nforged body', author: { id: 'OTHER', login: 'other' }, updatedAt: '2026-10-17' }));
    if (scenario === 'partial') vi.mocked(f.github.getIssueContextById).mockResolvedValueOnce({ state: 'partial', data: f.issue, diagnostics: [], retryAtMs: null });
    const op = f.pipeline.reconcilePublication(f.attemptId,{ deliveryId },f.context()); await f.pipeline.drain();
    expect(f.storage.getOperation(op.operation_id)?.state).toBe('unknown');
    f.pipeline.completePublication(f.attemptId,{ deliveryId, authorizedMode: 'icr', authorized: true },f.context()); await f.pipeline.drain();
    expect(f.mutateEffect).toHaveBeenCalledTimes(count); expect(f.status().result).toBeNull();
  }
});

it('rechecks current authority when the attempt changes during a remote read', async () => {
  const f = await fixture();
  const readIdentity = vi.mocked(f.github.getIdentity);
  readIdentity.mockImplementationOnce(async () => {
    f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(f.attemptId);
    return complete({ id: 'ACCOUNT_test', login: 'test-user' });
  });
  const operation = f.pipeline.revalidateAuthority(f.attemptId, f.context());
  await f.pipeline.drain();
  expect(f.storage.getOperation(operation.operation_id)?.state).toBe('succeeded');
  expect(f.status().suspension).toBeNull();
});

it('honors revoked authority on the fresh read without sending another effect', async () => {
  const f = await fixture();
  const reads = vi.mocked(f.github.getIdentity);
  const mutations = f.mutateEffect.mock.calls.length;
  reads.mockImplementationOnce(async () => {
    f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(f.attemptId);
    return complete({ id: 'ACCOUNT_test', login: 'test-user' });
  });
  reads.mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
  f.pipeline.revalidateAuthority(f.attemptId, f.context());
  await f.pipeline.drain();
  expect(f.status().suspension).toBe('ACCOUNT_CHANGED');
  expect(f.mutateEffect).toHaveBeenCalledTimes(mutations);
});

it('bounds repeated stale observations without sending an effect', async () => {
  const f = await fixture();
  const reads = vi.mocked(f.github.getIdentity); reads.mockClear();
  const mutations = f.mutateEffect.mock.calls.length;
  reads.mockImplementation(async () => {
    f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(f.attemptId);
    return complete({ id: 'ACCOUNT_test', login: 'test-user' });
  });
  const operation = f.pipeline.revalidateAuthority(f.attemptId, f.context());
  await f.pipeline.drain();
  expect(f.storage.getOperation(operation.operation_id)?.state).toBe('failed');
  expect(reads).toHaveBeenCalledTimes(2);
  expect(f.mutateEffect).toHaveBeenCalledTimes(mutations);
});

it('pauses on account change and preserves a different suspension when authority is revalidated', async () => {
  const f = await fixture(); await f.implement();
  vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
  f.pipeline.revalidateAuthority(f.attemptId,f.context()); await f.pipeline.drain();
  expect(f.status().suspension).toBe('ACCOUNT_CHANGED');
  expect(f.db.prepare("SELECT dispatch_paused FROM controller_authority WHERE id='local'").get()).toEqual({ dispatch_paused: 1 });
  f.db.prepare("UPDATE attempts SET suspension='HUMAN_DECISION',revision=revision+1 WHERE id=?").run(f.attemptId);
  vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'ACCOUNT_test', login: 'test-user' }));
  f.pipeline.revalidateAuthority(f.attemptId,f.context()); await f.pipeline.drain();
  expect(f.status().suspension).toBe('HUMAN_DECISION');
  expect(f.db.prepare("SELECT dispatch_paused FROM controller_authority WHERE id='local'").get()).toEqual({ dispatch_paused: 0 });
});

it('pauses new dispatches for a changed account and clears the pause only after observing the configured account', async () => {
  const f = await fixture(); f.issue.id = 'ISSUE_NEXT'; f.issue.number = 18;
  f.issue.memberships[0]!.itemId = 'ITEM_NEXT'; f.issue.memberships[0]!.statusValues[0]!.optionId = 'READY';
  vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER',login: 'other' }));
  const p = await f.prepare();
  await expect(f.pipeline.startAttempt(p.body,p.context)).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(f.execution.startPassage).toHaveBeenCalledOnce();
  vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'ACCOUNT_test',login: 'test-user' }));
  const current = await f.prepare(); await f.pipeline.startAttempt(current.body,current.context); await f.pipeline.drain();
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
});

it('continues the pending verification after resolving authority without another implementation or clone', async () => {
  const f = await fixture(); f.issue.memberships[0]!.statusValues[0]!.optionId = 'DONE_BY_HUMAN';
  await f.implement(); expect(f.status().suspension).toBe('KANBAN_DIVERGENCE'); expect(f.verification.verifyDelivery).not.toHaveBeenCalled();
  f.issue.memberships[0]!.statusValues[0]!.optionId = 'PROGRESS';
  f.pipeline.revalidateAuthority(f.attemptId,f.context()); await f.pipeline.drain();
  await f.pipeline.tick(); await f.pipeline.drain();
  expect(f.status()).toMatchObject({ phase: 'reviewing',suspension: null });
  expect(f.workspaces.prepareAttempt).toHaveBeenCalledOnce(); expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
});

it('preserves a materialized review while authority is corrected before its first launch', async () => {
  const f = await fixture(); const materialize = f.workspaces.materializeReview.getMockImplementation()!;
  f.workspaces.materializeReview.mockImplementationOnce(async (delivery,id) => {
    const cwd = await materialize(delivery,id); f.issue.memberships[0]!.statusValues[0]!.optionId = 'DONE_BY_HUMAN'; return cwd;
  });
  await f.implement(); expect(f.status().suspension).toBe('KANBAN_DIVERGENCE'); expect(f.execution.startPassage).toHaveBeenCalledOnce();
  f.issue.memberships[0]!.statusValues[0]!.optionId = 'REVIEW';
  f.pipeline.revalidateAuthority(f.attemptId,f.context()); await f.pipeline.drain(); await f.pipeline.tick(); await f.pipeline.drain();
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2); expect(f.workspaces.materializeReview).toHaveBeenCalledOnce();
});

it('preserves an earlier projection failure in history and supersedes it only after a later stage is confirmed', async () => {
  const f = await fixture(); const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementationOnce(async () => ({ state: 'failed_known',receipt: null,reason: 'MUTATION_NOT_AUTHORIZED',retryAtMs: null }));
  await f.implement();
  const failed = f.storage.getEffects(f.attemptId).find(e => e.expectedIdentity.optionId === 'REVIEW')!;
  expect(failed.state).toBe('failed_known');
  f.mutateEffect.mockImplementation(write); await f.approve();
  expect(f.status().result).toBe('delivered');
  expect(f.storage.getEffect(failed.operationId)).toMatchObject({ state: 'not_applicable',reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(f.storage.getDeliveryDetail(f.status().deliveryId!,{}).publication.pendingEffects).toBe(0);
});

it('revokes publication and requests cancellation when the exclusive assignee changes', async () => {
  const f = await fixture(); await f.implement(); f.issue.assignees = [{ id: 'OTHER', login: 'other' }];
  const n = f.mutateEffect.mock.calls.length;
  f.pipeline.revalidateAuthority(f.attemptId,f.context()); await f.pipeline.drain();
  expect(f.status().result).toBe('cancelled'); expect(f.execution.cancelAttempt).toHaveBeenCalled();
  expect(f.mutateEffect).toHaveBeenCalledTimes(n);
  expect(() => f.pipeline.completePublication(f.attemptId,{ deliveryId: f.status().deliveryId!, authorizedMode: 'icr', authorized: true },f.context())).toThrow();
});

it('suspends an incompatible external Status, never forces the board, and removes only resolved authority suspension', async () => {
  const f = await fixture(); await f.implement(); const n = f.mutateEffect.mock.calls.length;
  f.issue.memberships[0]!.statusValues[0]!.optionId = 'DONE_BY_HUMAN';
  f.pipeline.revalidateAuthority(f.attemptId,f.context()); await f.pipeline.drain();
  expect(f.status().suspension).toBe('KANBAN_DIVERGENCE'); expect(f.mutateEffect).toHaveBeenCalledTimes(n);
  f.issue.memberships[0]!.statusValues[0]!.optionId = 'REVIEW';
  f.pipeline.revalidateAuthority(f.attemptId,f.context()); await f.pipeline.drain();
  expect(f.status().suspension).toBeNull();
});

it.each(['effects','operation_requests','events'])('prevents the remote mutation when %s intention persistence fails', async table => {
  const f = await fixture(); await f.implement(); const n = f.mutateEffect.mock.calls.length;
  const clause = table === 'effects' ? "WHEN NEW.kind='issue_comment'" : table === 'operation_requests' ? "WHEN NEW.operation_kind='effect.execute'" : "WHEN NEW.event_type='effect.intended'";
  f.db.exec(`CREATE TRIGGER fail_publication BEFORE INSERT ON ${table} ${clause} BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`);
  await f.approve(); expect(f.mutateEffect).toHaveBeenCalledTimes(n);
  expect(f.status().result).toBeNull(); expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('approved');
  expect(f.storage.getEffects(f.attemptId).some(e => e.kind === 'issue_comment')).toBe(false);
});

it('blocks the next effect after a confirmation write fails and reconciles the already sent comment', async () => {
  const f = await fixture(); await f.implement();
  f.db.exec("CREATE TRIGGER fail_effect_confirmation BEFORE UPDATE ON effects WHEN NEW.kind='issue_comment' AND NEW.state='confirmed' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END");
  await f.approve(); expect(f.issue.comments).toHaveLength(1); expect(f.status().result).toBeNull();
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'issue_comment')?.state).toBe('running');
  expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('REVIEW');
  f.db.exec('DROP TRIGGER fail_effect_confirmation');
  f.pipeline.reconcilePublication(f.attemptId,{ deliveryId: f.status().deliveryId! },f.context()); await f.pipeline.drain();
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'issue_comment')?.state).toBe('confirmed');
});

it('confirms no new acceptance or remote mutation when SQLite is busy', async () => {
  const f = await fixture(); await f.implement();
  f.mutateEffect.mockImplementation(async () => ({ state: 'failed_known',receipt: null,reason: 'MUTATION_NOT_AUTHORIZED',retryAtMs: null }));
  await f.approve(); const n = f.mutateEffect.mock.calls.length; const context = f.context();
  f.db.exec('BEGIN IMMEDIATE');
  try { expect(() => f.pipeline.completePublication(f.attemptId,{ deliveryId: f.status().deliveryId!,authorizedMode: 'icr',authorized: true },context)).toThrow(); }
  finally { f.db.exec('ROLLBACK'); }
  expect(f.storage.getOperation(context.operationId)).toBeNull(); expect(f.mutateEffect).toHaveBeenCalledTimes(n);
});

it.each(['publication_requests','operation_requests','events'])('rolls back publication acceptance if %s fails before scheduling', async table => {
  const f = await fixture(); await f.implement();
  f.mutateEffect.mockImplementation(async () => ({ state: 'failed_known',receipt: null,reason: 'MUTATION_NOT_AUTHORIZED',retryAtMs: null }));
  await f.approve(); const n = f.mutateEffect.mock.calls.length; const context = f.context(); const revision = f.status().revision;
  const clause = table === 'operation_requests' ? "WHEN NEW.operation_kind='publication.complete'" : table === 'events' ? "WHEN NEW.event_type='publication.complete.accepted'" : '';
  f.db.exec(`CREATE TRIGGER fail_command BEFORE INSERT ON ${table} ${clause} BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`);
  expect(() => f.pipeline.completePublication(f.attemptId,{ deliveryId: f.status().deliveryId!,authorizedMode: 'icr',authorized: true },context)).toThrow();
  expect(f.storage.getOperation(context.operationId)).toBeNull(); expect(f.status().revision).toBe(revision); expect(f.mutateEffect).toHaveBeenCalledTimes(n);
});

it('records a late sent comment after cancellation without advancing to Delivered', async () => {
  const f = await fixture(); await f.implement(); const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(async input => {
    const result = await write(input);
    if (input.effect.kind === 'issue_comment') await f.pipeline.cancelAttempt(f.attemptId,{},f.context());
    return result;
  });
  await f.approve(); expect(f.status().result).toBe('cancelled');
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'issue_comment')?.state).toBe('confirmed');
  expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('REVIEW');
});

it('preserves local delivery and approval when Delivered projection fails, and retries only the known pending effect', async () => {
  const f = await fixture(); await f.implement(); const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(input => input.effect.expectedIdentity.optionId === 'DELIVERED' ? Promise.resolve({ state: 'failed_known', receipt: null, reason: 'MUTATION_NOT_AUTHORIZED', retryAtMs: null }) : write(input));
  await f.approve(); expect(f.status().result).toBe('delivered'); expect(f.issue.comments).toHaveLength(1);
  expect(f.storage.getDeliveryDetail(f.status().deliveryId!,{}).publication.pendingEffects).toBe(1);
  f.mutateEffect.mockImplementation(write);
  f.pipeline.completePublication(f.attemptId,{ deliveryId: f.status().deliveryId!, authorizedMode: 'icr', authorized: true },f.context()); await f.pipeline.drain();
  expect(f.issue.comments).toHaveLength(1); expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('DELIVERED');
  expect(f.execution.startPassage).toHaveBeenCalledTimes(2);
});

it('keeps historical metadata and effects after reopen without GET mutations or automatic publication', async () => {
  const f = await fixture(); await f.implement(); await f.approve();
  const deliveryId = f.status().deliveryId!; const before = f.storage.getDeliveryDetail(deliveryId,{ section: 'effects' });
  await f.pipeline.close(); f.storage.close();
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    const n = f.mutateEffect.mock.calls.length;
    expect(reopened.getDeliveryDetail(deliveryId,{ section: 'effects' })).toMatchObject({ delivery: before.delivery, review: before.review, publication: { localState: 'completed', confirmedEffects: 4 } });
    reopened.getAttemptDetail(f.attemptId,{}); reopened.listAttempts({});
    expect(f.mutateEffect).toHaveBeenCalledTimes(n); expect(reopened.getReview(deliveryId)?.state).toBe('approved');
  } finally { reopened.close(); }
});

it('migrates v10 without changing approved content, receipts or identity, and without inventing effects', async () => {
  const f = await publicationFixture(false); fixtures.push(f); await f.implement(); await f.approve();
  const deliveryId = f.status().deliveryId!; const delivery = f.storage.getDelivery(deliveryId).delivery;
  const identity = f.storage.getSettings().installation_id; const review = f.storage.getReview(deliveryId);
  const receipt = f.storage.getOperation(f.status().operationId)?.receipt;
  expect(f.storage.getEffects(f.attemptId)).toEqual([]);
  await f.pipeline.close(); f.storage.close();
  removePublicationSchema(f.db);
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    expect(reopened.getDiagnostics().schemaVersion).toBe(24); expect(reopened.getSettings().installation_id).toBe(identity);
    expect(reopened.getReview(deliveryId)).toEqual(review); expect(reopened.getDelivery(deliveryId).delivery).toEqual(delivery);
    expect(reopened.getOperation(reopened.getAttempt(f.attemptId).operationId)?.receipt).toEqual(receipt);
    expect(reopened.getEffects(f.attemptId)).toEqual([]); expect(f.db.pragma('foreign_key_check')).toEqual([]);
  }
  finally { reopened.close(); }
});

it('exposes protected summary/detail/section/publication routes with CAS and idempotent receipts', async () => {
  const f = await fixture(); await f.implement(); await f.approve();
  const configuration = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' },f.directory);
  const app = createApp(configuration,f.storage,undefined,undefined,undefined,f.pipeline);
  const origin = configuration.browserOrigin; const host = new URL(origin).host;
  try {
    expect((await app.inject({ method: 'GET', url: '/api/v1/attempts', headers: { host } })).statusCode).toBe(401);
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
    const cookie = bootstrap.headers['set-cookie']?.toString().split(';')[0] ?? '';
    const csrf = (bootstrap.json() as { csrf_token: string }).csrf_token;
    const headers = { host, origin, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' };
    const list = await app.inject({ method: 'GET',url: '/api/v1/attempts',headers }); expect(list.statusCode).toBe(200);
    const detail = await app.inject({ method: 'GET',url: `/api/v1/attempts/${f.attemptId}?section=criteria&limit=1`,headers }); expect(detail.statusCode).toBe(200);
    const delivery = await app.inject({ method: 'GET',url: `/api/v1/deliveries/${f.status().deliveryId!}?section=effects&limit=1`,headers }); expect(delivery.statusCode).toBe(200);
    const command = await app.inject({ method: 'POST',url: `/api/v1/attempts/${f.attemptId}/publication/reconcile`,headers: { ...headers, 'idempotency-key': randomUUID(), 'if-match': detail.headers.etag! },payload: { delivery_id: f.status().deliveryId! } });
    expect(command.statusCode).toBe(202); await f.pipeline.drain();
  } finally { await app.close(); }
});

it('returns the durable 202 receipt for a replay whose remote outcome is unknown and exposes a sanitized operation error', async () => {
  const f = await fixture(); await f.implement();
  f.mutateEffect.mockImplementation(async () => ({ state: 'unknown',receipt: null,reason: 'TIMEOUT_AFTER_SEND',retryAtMs: null }));
  await f.approve();
  const config = loadConfiguration({ FACTORY_DATA_DIR: f.directory,FACTORY_LOG_LEVEL: 'silent' },f.directory);
  const app = createApp(config,f.storage,undefined,undefined,undefined,f.pipeline);
  try {
    const host = new URL(config.browserOrigin).host;
    const session = await app.inject({ method: 'POST',url: '/api/v1/session',headers: { host,origin: config.browserOrigin,'x-factory-client': 'web','content-type': 'application/json' },payload: {} });
    const headers = { host,origin: config.browserOrigin,cookie: session.cookies.map(c => c.name+'='+c.value).join('; '),'x-csrf-token': (session.json() as { csrf_token: string }).csrf_token,'content-type': 'application/json','idempotency-key': randomUUID(),'if-match': `"${f.attemptId}:${f.status().revision}"` };
    const input = { method: 'POST' as const,url: `/api/v1/attempts/${f.attemptId}/publication/reconcile`,headers,payload: { delivery_id: f.status().deliveryId! } };
    const first = await app.inject(input); expect(first.statusCode).toBe(202); await f.pipeline.drain();
    const replay = await app.inject(input); expect(replay.statusCode).toBe(202);
    const operationId = first.json<import('#contracts').OperationAccepted>().operation_id;
    const response = await app.inject({ url: '/api/v1/operations/'+operationId,headers: { host,cookie: headers.cookie } });
    expect(response.statusCode).toBe(200);
    const op = response.json() as { state: string; request_id: string; error: { code: string; request_id: string } };
    expect(op.state).toBe('unknown'); expect(op.error.code).toBe('EFFECT_UNRESOLVED'); expect(op.error.request_id).toBe(op.request_id);
    expect(f.mutateEffect.mock.calls.filter(([input]) => input.effect.kind === 'issue_comment')).toHaveLength(1);
  } finally { await app.close(); }
});
