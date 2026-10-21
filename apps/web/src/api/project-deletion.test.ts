import { afterEach, expect, it, vi } from 'vitest';

const projectId = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const context = { projectId, projectName: 'Projeto', projectRevision: 1, contextVersion: 1 };
const confirmation = { confirmed: true as const, authorization_digest: 'a'.repeat(64) };
const pending = { operation_id: operationId, project_id: projectId, project_name: 'Projeto', state: 'pending', revision: 1, targets: [{ target_key: 'original', target_kind: 'original_directory', path: 'C:/privado', state: 'pending' }], blockers: [], can_retry: true };
const completed = { operation_id: operationId, state: 'succeeded' };
const preview = { project_id: projectId, project_name: 'Projeto', project_revision: 1, authorization_digest: 'a'.repeat(64), source_kind: 'local', targets: pending.targets, blockers: [], can_confirm: true };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ETag: '"original"' } });
function setup() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), sessionStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  const fetch = vi.fn().mockResolvedValueOnce(response({ csrf_token: 'csrf', instance_id: 'instance' }));
  vi.stubGlobal('fetch', fetch);
  return { values, fetch };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it('validates preview context, keeps ETag separate and explicitly adapts targets', async () => {
  const { fetch } = setup();
  fetch.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({ ...preview, project_revision: 2 })).mockResolvedValueOnce(response({ ...preview, extra: true }));
  const api = await import('./project-deletion.js');
  const result = await api.getProjectDeletionPreview(context);
  expect(result.etag).toBe('"original"');
  expect(result.preview).toMatchObject({ projectId, canConfirm: true, targets: [{ targetKey: 'original', targetKind: 'original_directory' }] });
  expect(result.preview).not.toHaveProperty('etag');
  await expect(api.getProjectDeletionPreview(context)).rejects.toThrow('mudou');
  await expect(api.getProjectDeletionPreview(context)).rejects.toThrow();
});

it('shares a double click, keeps uncertainty on 404 and never persists original content', async () => {
  const { fetch, values } = setup();
  fetch.mockRejectedValueOnce(new Error('resposta perdida')).mockResolvedValueOnce(response({}, 404));
  const api = await import('./project-deletion.js');
  const input = { context, etag: '"original"', operationId, confirmation, installationId: 'installation', accountId: 'account' };
  const first = api.confirmProjectDeletion(input);
  expect(api.confirmProjectDeletion(input)).toBe(first);
  await expect(first).rejects.toThrow('perdida');
  await expect(api.confirmProjectDeletion({ ...input, operationId: '00000000-0000-4000-8000-000000000003' })).rejects.toThrow('já enviada');
  expect(await api.recoverUncertainOperation(operationId)).toEqual({ kind: 'missing' });
  expect([...values.values()].join('')).not.toMatch(/Projeto|privado|authorization|installation/);
  expect(JSON.parse([...values.values()][0]!)).toEqual([{ operationId, projectId, kind: 'project.delete', recordedAt: expect.any(Number) }]);
  expect([...values.values()].join('')).toContain('project.delete');
  const init = fetch.mock.calls[1]?.[1] as RequestInit;
  expect(init.body).toBe(JSON.stringify(confirmation));
  expect(init.credentials).toBe('same-origin');
  expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf');
  expect(new Headers(init.headers).get('If-Match')).toBe('"original"');
  expect(new Headers(init.headers).get('Idempotency-Key')).toBe(operationId);
});

it('recovers the project binding after reload and removes the entire temporary reference on completion', async () => {
  const { fetch, values } = setup();
  values.set('factory.uncertain-operations.v1', JSON.stringify([{ operationId, projectId, kind: 'project.delete', recordedAt: 1 }]));
  fetch.mockResolvedValueOnce(response(completed));
  const api = await import('./project-deletion.js');
  expect(api.isProjectDeletionCompleted(projectId)).toBe(false);
  await expect(api.getProjectDeletionStatus(operationId)).resolves.toEqual({ operationId, state: 'succeeded' });
  expect(api.isProjectDeletionCompleted(projectId)).toBe(true);
  expect(values.size).toBe(0);
  expect(api.knownProjectDeletionOperations()).toEqual([]);
});

it.each([403, 409, 412, 429])('releases a definite %s rejection so a newly checked preview can be confirmed', async (status) => {
  const { fetch, values } = setup();
  fetch.mockResolvedValueOnce(response({ code: 'PRECONDITION_FAILED', message: 'Conferência alterada', request_id: 'request' }, status))
    .mockResolvedValueOnce(response(completed));
  const api = await import('./project-deletion.js');
  await expect(api.confirmProjectDeletion({ context, etag: 'old', operationId, confirmation, installationId: 'installation', accountId: null })).rejects.toMatchObject({ status });
  expect(values.size).toBe(0);
  const nextId = '00000000-0000-4000-8000-000000000003';
  fetch.mockReset().mockResolvedValueOnce(response({ ...completed, operation_id: nextId }));
  await expect(api.confirmProjectDeletion({ context, etag: 'new', operationId: nextId, confirmation, installationId: 'installation', accountId: null })).resolves.toMatchObject({ state: 'succeeded' });
});

it('renews after 401, queries the original key and recovers completion without a project GET', async () => {
  const { fetch, values } = setup();
  fetch.mockResolvedValueOnce(response({ code: 'SESSION_REQUIRED', message: 'sessão', request_id: 'request' }, 401))
    .mockResolvedValueOnce(response({ csrf_token: 'new', instance_id: 'new-instance' }))
    .mockResolvedValueOnce(response(completed));
  const api = await import('./project-deletion.js');
  await expect(api.confirmProjectDeletion({ context, etag: '"original"', operationId, confirmation, installationId: 'installation', accountId: null })).resolves.toEqual({ operationId, state: 'succeeded' });
  expect(values.size).toBe(0);
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/v1/session', `/api/v1/projects/${projectId}/deletion`, '/api/v1/session', `/api/v1/operations/${operationId}`]);
});

it('recovers pending operation into status and resumes with the original key only', async () => {
  const { fetch } = setup();
  fetch.mockResolvedValueOnce(response({ operation_id: operationId, kind: 'project.delete', resource: { type: 'project', id: projectId }, state: 'running', request_id: 'request' }))
    .mockResolvedValueOnce(response(pending)).mockResolvedValueOnce(response(pending));
  const api = await import('./project-deletion.js');
  expect(await api.recoverUncertainOperation(operationId)).toMatchObject({ kind: 'pending', status: { operationId, canRetry: true } });
  await api.resumeProjectDeletion(operationId);
  const init = fetch.mock.calls.at(-1)?.[1] as RequestInit;
  expect(init.body).toBe('{}');
  expect(new Headers(init.headers).get('Idempotency-Key')).toBe(operationId);
});

it('clears only deleted project drafts and ignores late pending responses and draft writes', async () => {
  const { fetch } = setup();
  fetch.mockResolvedValueOnce(response(pending)).mockResolvedValueOnce(response(completed)).mockResolvedValueOnce(response(pending));
  const drafts = await import('../app/drafts.js');
  const own = drafts.configurationDraftIdentity('account', projectId);
  const other = drafts.configurationDraftIdentity('account', 'other');
  drafts.setDraft(own, 'editor', 'privado'); drafts.setDraft(other, 'editor', 'preservado');
  const api = await import('./project-deletion.js');
  await api.getProjectDeletionStatus(operationId);
  await api.getProjectDeletionStatus(operationId);
  expect(await api.getProjectDeletionStatus(operationId)).toEqual({ operationId, state: 'succeeded' });
  drafts.setDraft(own, 'editor', 'resposta tardia');
  expect(drafts.getDraft(own, 'editor')).toBeUndefined();
  expect(drafts.getDraft(other, 'editor')).toBe('preservado');
});

it('after reload keeps only consultation and cannot reconstruct a POST from persisted metadata', async () => {
  const { fetch } = setup();
  fetch.mockResolvedValueOnce(response({}, 404));
  const api = await import('./project-deletion.js');
  await expect(api.resendProjectDeletion(operationId)).rejects.toThrow('Continue consultando');
  expect(fetch.mock.calls.filter(call => (call[1] as RequestInit).method === 'POST')).toHaveLength(1); // bootstrap only
});

it('consults before identical replay, shares recovery clicks and refuses a changed account', async () => {
  const { fetch } = setup();
  const { Value } = await import('@sinclair/typebox/value');
  const { SettingsView } = await import('#contracts');
  const settings = Value.Create({ ...SettingsView, properties: { ...SettingsView.properties, event_cursor: { ...SettingsView.properties.event_cursor, default: '0' } } });
  settings.settings.installation_id = 'installation'; settings.settings.account_id = 'account';
  fetch.mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(response({}, 404))
    .mockResolvedValueOnce(response(settings)).mockResolvedValueOnce(response(pending));
  const api = await import('./project-deletion.js');
  await expect(api.confirmProjectDeletion({ context, etag: '"original"', operationId, confirmation, installationId: 'installation', accountId: 'account' })).rejects.toThrow('lost');
  const replay = api.resendProjectDeletion(operationId);
  expect(api.resendProjectDeletion(operationId)).toBe(replay);
  await expect(replay).resolves.toMatchObject({ operationId, state: 'pending' });
  const posts = fetch.mock.calls.filter(call => String(call[0]).endsWith('/deletion'));
  expect(posts).toHaveLength(2);
  expect(posts[0]?.[1]).toEqual(posts[1]?.[1]);
  expect(fetch.mock.calls.map(call => call[0]).slice(2, 4)).toEqual([`/api/v1/operations/${operationId}`, '/api/v1/settings']);
  settings.settings.account_id = 'other';
  fetch.mockResolvedValueOnce(response({}, 404)).mockResolvedValueOnce(response(settings));
  await expect(api.resendProjectDeletion(operationId)).rejects.toThrow('conta originais');
  expect(fetch.mock.calls.filter(call => String(call[0]).endsWith('/deletion'))).toHaveLength(2);
});

it('stops observation on cleanup, discards late responses and polls only reads with configured backoff', async () => {
  vi.useFakeTimers();
  const { observeDeletion } = await import('../features/projects/useProjectDeletion.js');
  let settle: ((value: string) => void) | undefined;
  const publish = vi.fn();
  const stop = observeDeletion(() => new Promise<string>(resolve => { settle = resolve; }), publish, vi.fn(), 100, 400, () => false);
  stop(); settle?.('old'); await Promise.resolve();
  expect(publish).not.toHaveBeenCalled();
  const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('done');
  const cleanup = observeDeletion(read, publish, vi.fn(), 100, 400, value => value === 'done');
  await vi.advanceTimersByTimeAsync(199); expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000); expect(read).toHaveBeenCalledTimes(2);
  cleanup();
});
