import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { complete, confirmTerminalStops } from '../fixtures/attempt.js';
import { createPublication } from '../../apps/controller/src/modules/publication/index.js';
import { createQueue } from '../../apps/controller/src/modules/projects/index.js';
import { observationWire } from '../fixtures/observation-wire.js';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';

const fixtures: PublicationFixture[] = [];

it('respects a preparation branch override throughout authority checks and delivery', async () => {
  const f = await publicationFixture(true, 'icr', true, { baseBranch: 'feat/landing' }); fixtures.push(f);
  expect(f.storage.getConfiguration(f.projectId).view.configuration.base_branch).toBe('main');
  expect(f.status().suspension).toBeNull();
  expect(f.status().phase).toBe('implementing');
  await f.implement(); await f.approve();
  expect(f.status().suspension).toBeNull();
  expect(f.status().result).toBe('delivered');
});
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() { const f = await publicationFixture(); fixtures.push(f); return f; }
function publicationServiceFixture(f: PublicationFixture, storage = f.storage) {
  const tasks: Promise<void>[] = [];
  const publication = createPublication({ storage, github: f.github, workspaces: f.workspaces,
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
    confirmTerminalStops(f, f.attemptId, reopened.executionPersistence());
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
  expect(f.issueReader.mock.calls.some(([, purpose]) => purpose === 'authority')).toBe(true);
  expect(f.issueReader.mock.calls.some(([, purpose]) => purpose === 'comment_confirmation')).toBe(true);
  expect(f.issueReader.mock.calls.some(([, purpose]) => purpose === 'status_confirmation')).toBe(true);
  for (const [input] of f.mutateEffect.mock.calls) {
    const op = f.storage.getOperation(input.effect.operationId); expect(op?.receipt).toBeDefined();
    expect(input.effect.state).toBe('running'); expect(input.effect.sentAtMs).not.toBeNull();
  }
  expect(f.persistence.getResult({ passageId: accepted.binding.passageId })?.receiptId).toBe(accepted.receiptId);
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('keeps a confirmed comment mutation pending until the exact projected comment is observed', async () => {
  const f = await fixture(); await f.implement();
  const mutate = f.mutateEffect.getMockImplementation();
  if (!mutate) throw new Error('The publication fixture must provide a controlled effect writer.');
  f.mutateEffect.mockImplementation(async input => input.effect.kind === 'issue_comment'
    ? { state: 'confirmed', receipt: { id: 'COMMENT_UNREAD', url: `${f.issue.url}#issuecomment-999` }, reason: null, retryAtMs: null }
    : mutate(input));

  await f.approve();

  expect(f.storage.getEffects(f.attemptId).find(effect => effect.kind === 'issue_comment')?.state).toBe('unknown');
  expect(f.issue.comments).toEqual([]);
  expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('REVIEW');
  expect(f.issueReader).toHaveBeenCalledWith(f.issue.id, 'comment_confirmation');
});

it.each(['author_unknown', 'invalid_url', 'marker_missing', 'duplicate', 'partial'] as const)(
  'does not confirm a comment when projected reconciliation is %s', async scenario => {
    const f = await fixture(); await f.implement();
    const read = f.issueReader.getMockImplementation();
    if (!read) throw new Error('The publication fixture must provide a controlled issue reader.');
    f.issueReader.mockImplementation(async (id, purpose) => {
      const result = await read(id, purpose);
      if (purpose !== 'comment_confirmation' || !result.data || !('comments' in result.data)) return result;
      let comments = result.data.comments;
      if (scenario === 'author_unknown') comments = comments.map(comment => ({ ...comment, author: null }));
      if (scenario === 'invalid_url') comments = comments.map(comment => ({ ...comment, url: 'https://github.com.example/test-org/repo/issues/17#issuecomment-1' }));
      if (scenario === 'marker_missing') comments = comments.map(comment => ({ ...comment, body: `<!-- wrong marker -->\n${comment.body}` }));
      if (scenario === 'duplicate') comments = [...comments, ...comments];
      return { ...result, ...(scenario === 'partial' ? { state: 'partial' as const } : {}), data: { ...result.data, comments } };
    });

    await f.approve();

    expect(f.storage.getEffects(f.attemptId).find(effect => effect.kind === 'issue_comment')?.state).toBe('unknown');
    expect(f.mutateEffect.mock.calls.some(([input]) => input.effect.kind === 'project_status' && input.effect.expectedIdentity.optionId === 'DELIVERED')).toBe(false);
    expect(f.issueReader).toHaveBeenCalledWith(f.issue.id, 'comment_confirmation');
  });

it('requires an exact Status readback even when the mutation reports an item ID', async () => {
  const f = await fixture(); await f.implement();
  const mutate = f.mutateEffect.getMockImplementation();
  if (!mutate) throw new Error('The publication fixture must provide a controlled effect writer.');
  f.mutateEffect.mockImplementation(async input => input.effect.kind === 'project_status' && input.effect.expectedIdentity.optionId === 'DELIVERED'
    ? { state: 'confirmed', receipt: { id: 'ITEM_test' }, reason: null, retryAtMs: null }
    : mutate(input));

  await f.approve();

  expect(f.storage.getEffects(f.attemptId).find(effect => effect.kind === 'project_status' && effect.expectedIdentity.optionId === 'DELIVERED')?.state).toBe('unknown');
  expect(f.issue.memberships[0]!.statusValues[0]!.optionId).toBe('REVIEW');
  expect(f.issueReader).toHaveBeenCalledWith(f.issue.id, 'status_confirmation');
});

it('keeps Status unknown when an archived duplicate membership makes the readback ambiguous', async () => {
  const f = await fixture(); await f.implement();
  const mutate = f.mutateEffect.getMockImplementation();
  if (!mutate) throw new Error('The publication fixture must provide a controlled effect writer.');
  f.mutateEffect.mockImplementation(async input => {
    const result = await mutate(input);
    if (input.effect.kind === 'project_status' && input.effect.expectedIdentity.optionId === 'DELIVERED') {
      const membership = f.issue.memberships[0];
      if (!membership) throw new Error('The fixture must contain a project membership.');
      f.issue.memberships.push({ ...structuredClone(membership), archived: true });
    }
    return result;
  });

  await f.approve();

  expect(f.storage.getEffects(f.attemptId).find(effect => effect.kind === 'project_status' && effect.expectedIdentity.optionId === 'DELIVERED')?.state).toBe('unknown');
  expect(f.issueReader).toHaveBeenCalledWith(f.issue.id, 'status_confirmation');
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

it.each(['closed_issue','missing_project','owner_changed','field_option_removed','remote_changed','partial_read','account','assignee','status','configuration'])('preserves publication authority after grouped display for %s', async scenario => {
  const f = await fixture(); await f.implement(); const writes = f.mutateEffect.mock.calls.length;
  f.issue.memberships.push(...['extra-a', 'extra-b'].map(itemId => ({ ...structuredClone(f.issue.memberships[0]!), itemId, projectId: itemId })));
  let grouped = 0;
  const remote = observationWire({ issues: new Map([[f.issue.id, f.issue]]), projects: new Map([[f.project.project.id, f.project]]),
    items: new Map([[f.project.project.id, [{ id: 'ITEM_test', archived: false, kind: 'issue', contentId: f.issue.id, title: f.issue.title, url: f.issue.url, executable: true }]]]),
    pages: 1, account: () => 'ACCOUNT_test' }, new BackendMeasurement(), { afterSend: async operation => { if (operation === 'GroupedValues') grouped++; } });
  const queue = createQueue({ storage: f.storage, github: remote, workspaces: f.workspaces, hostName: 'test-host' });
  const display = await queue.read({ projectId: f.projectId }); expect(display.observation.complete).toBe(true);
  expect(grouped).toBe(1);
  expect((await queue.read({ projectId: f.projectId })).etag).toBe(display.etag); expect(grouped).toBe(1);
  if (scenario === 'closed_issue') f.issue.state = 'CLOSED';
  if (scenario === 'missing_project') f.issue.memberships = [];
  if (scenario === 'owner_changed') f.project.project.owner.id = 'OTHER';
  if (scenario === 'field_option_removed') f.project.singleSelectFields[0]!.options.pop();
  if (scenario === 'remote_changed') f.github.getRepository.mockResolvedValue(complete({ ...f.issue.repository,id: 'OTHER' }));
  if (scenario === 'partial_read') f.issueReader.mockResolvedValue({ state: 'partial',data: f.issue,diagnostics: [],retryAtMs: null });
  if (scenario === 'account') vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
  if (scenario === 'assignee') f.issue.assignees = [];
  if (scenario === 'status') f.issue.memberships[0]!.statusValues[0]!.optionId = 'BACKLOG';
  if (scenario === 'configuration') {
    const current = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = current.view.configuration;
    const changes = { base_branch: 'different' };
    expect(() => f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: f.projectId,
      body: { project_changes: changes }, configuration: { ...configuration, ...changes }, globalChanges: {} })).toThrow(expect.objectContaining({ code: 'PROJECT_CONFIGURATION_LOCKED' }));
    expect(f.storage.getConfiguration(f.projectId).etag).toBe(current.etag);
    expect(f.mutateEffect).toHaveBeenCalledTimes(writes);
    return;
  }
  await f.approve(); expect(f.status().result).toBe(scenario === 'assignee' ? 'cancelled' : null); expect(f.issue.comments).toEqual([]); expect(f.mutateEffect).toHaveBeenCalledTimes(writes);
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
  expect(f.issue.comments[0]!.body).not.toContain(`Versão: ${old}`); expect(f.execution.continuePassage).toHaveBeenCalledTimes(2);
});

it('does not replay an unknown Status when readback is partial, and does not send the following comment', async () => {
  const f = await fixture(); const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(async input => {
    const result = await write(input);
    if (input.effect.expectedIdentity.optionId === 'REVIEW') f.issueReader.mockResolvedValueOnce({ state: 'partial',data: f.issue,diagnostics: [],retryAtMs: null });
    return result;
  });
  await f.implement(); const unknown = f.storage.getEffects(f.attemptId).find(e => e.expectedIdentity.optionId === 'REVIEW');
  expect(unknown?.state).toBe('unknown');
  // Keep readback degraded while approval triggers the completion attempt.
  f.issueReader.mockResolvedValue({ state: 'partial',data: f.issue,diagnostics: [],retryAtMs: null });
  await f.approve(); expect(f.issue.comments).toEqual([]); expect(f.status().result).toBeNull();
  expect(f.mutateEffect.mock.calls.filter(([input]) => input.effect.expectedIdentity.optionId === 'REVIEW')).toHaveLength(1);
});

it('immediately reconciles an unknown comment through its exact projection and never sends it twice', async () => {
  const f = await fixture(); await f.implement();
  const write = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(async input => {
    const result = await write(input);
    return input.effect.kind === 'issue_comment' ? { state: 'unknown', receipt: null, reason: 'TIMEOUT_AFTER_SEND', retryAtMs: null } : result;
  });
  await f.approve(); expect(f.status().result).toBe('delivered');
  expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('approved');
  expect(f.issue.comments).toHaveLength(1);
  expect(f.storage.getDeliveryDetail(f.status().deliveryId!,{}).publication).toMatchObject({ unknownEffects: 0 });
  const completion = f.context(); const request = { deliveryId: f.status().deliveryId!, authorizedMode: 'icr' as const, authorized: true as const };
  const completed = f.pipeline.completePublication(f.attemptId,request,completion); await f.pipeline.drain();
  expect(f.storage.getOperation(completed.operation_id)?.state).toBe('succeeded');
  expect(f.status().result).toBe('delivered');
  expect(f.storage.getDeliveryDetail(request.deliveryId,{}).publication.completeCapability).toEqual({ available: false,reason_code: 'MODE_COMPLETED' });
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
    if (scenario === 'partial') f.issueReader.mockResolvedValueOnce({ state: 'partial', data: f.issue, diagnostics: [], retryAtMs: null });
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

it('discards Publication authorization continuations after their signal is revoked during a read', async () => {
  const f = await fixture(); await f.implement();
  const readIssue = f.issueReader;
  const originalRead = readIssue.getMockImplementation();
  if (!originalRead) throw new Error('The publication fixture must provide a controlled issue reader.');
  const changedIssue = await originalRead(f.issue.id, 'queue');
  if (changedIssue.state !== 'complete' || !changedIssue.data) throw new Error('The fixture issue must be readable.');
  const lateIssue = { ...changedIssue, data: { ...changedIssue.data, assignees: [] } };
  readIssue.mockClear();
  let resolveLateRead!: (value: Awaited<ReturnType<typeof f.issueReader>>) => void;
  const lateRead = new Promise<Awaited<ReturnType<typeof f.issueReader>>>(resolve => { resolveLateRead = resolve; });
  let signalRead!: () => void;
  const readReached = new Promise<void>(resolve => { signalRead = resolve; });
  let holdNextIssueRead = false;
  readIssue.mockImplementation(async (id, purpose) => {
    if (holdNextIssueRead) { holdNextIssueRead = false; signalRead(); return lateRead; }
    return originalRead(id, purpose);
  });
  const recordAuthority = vi.spyOn(f.storage, 'recordAuthority');
  const cancelAttempt = vi.spyOn(f.pipeline, 'cancelAttempt');
  const mutate = f.mutateEffect.getMockImplementation();
  if (!mutate) throw new Error('The publication fixture must provide a controlled effect writer.');
  let authorizationSettled = Promise.resolve();
  let revoked = false;
  f.mutateEffect.mockImplementation(async input => {
    if (!revoked && input.authorize) {
      revoked = true;
      const controller = new AbortController();
      const signal = controller.signal;
      holdNextIssueRead = true;
      authorizationSettled = input.authorize({ signal, deadlineMonotonicMs: Number.MAX_SAFE_INTEGER,
        assertActive() { if (signal.aborted) throw new Error('AUTHORIZATION_REVOKED'); } }).then(() => {}, () => {});
      await readReached;
      controller.abort();
      return { state: 'failed_known', receipt: null, reason: 'EFFECT_AUTHORITY_REVOKED', retryAtMs: null };
    }
    return mutate(input);
  });

  const approval = f.approve();
  await readReached;
  await approval;
  const recordCount = recordAuthority.mock.calls.length;
  const readCount = readIssue.mock.calls.length;
  resolveLateRead(lateIssue);
  await authorizationSettled;

  expect(recordAuthority).toHaveBeenCalledTimes(recordCount);
  expect(readIssue).toHaveBeenCalledTimes(readCount);
  expect(cancelAttempt).not.toHaveBeenCalled();
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

it('continues the pending review after resolving authority without another implementation or clone', async () => {
  const f = await fixture(); f.issue.memberships[0]!.statusValues[0]!.optionId = 'DONE_BY_HUMAN';
  await f.implement(); expect(f.status().suspension).toBe('KANBAN_DIVERGENCE');
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
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'issue_comment')?.state).toBe('unknown');
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
