import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const operationId = '00000000-0000-4000-8000-000000000001';
const instanceId = '00000000-0000-4000-8000-000000000002';
const session = () => new Response(JSON.stringify({ csrf_token: 'A'.repeat(43), instance_id: instanceId }));
const settings = (accountId = 'account-a') => new Response(JSON.stringify({ settings: { installation_id: 'installation-a', account_id: accountId } }));
function storage(): Map<string, string> {
  const values = new Map<string, string>();
  vi.stubGlobal('window', { sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  return values;
}

describe('configuration operation recovery', () => {
  it('blocks oversized saves before bootstrap or fetch', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { requestJson } = await import('./http.js');
    await expect(requestJson('/api/v1/settings', { method: 'PUT', body: JSON.stringify({ guidance: '😀'.repeat(4096) }) })).rejects.toBeInstanceOf(RangeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('consults first and explicitly resends the exact original bytes, key and opaque ETag', async () => {
    const values = storage();
    const fetch = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(settings())
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(settings()).mockResolvedValueOnce(new Response(JSON.stringify({ operation_id: operationId })));
    vi.stubGlobal('fetch', fetch);
    const { requestJson } = await import('./http.js');
    await requestJson('/api/v1/settings');
    const recovery = await import('./configuration-save.js');
    const body = JSON.stringify({ changes: { projects_root: 'ação😀' } });
    recovery.retainConfigurationSave({ operationId, path: '/api/v1/settings', method: 'PUT', body, etag: '"opaque-original"', accountId: 'account-a', installationId: 'installation-a', instanceId });
    expect([...values.values()].join('')).not.toContain('projects_root');
    await expect(recovery.resendConfigurationSave(operationId)).rejects.toThrow('Consulte');
    expect(await recovery.consultConfigurationSave(operationId)).toBeNull();
    expect(recovery.hasOriginalConfigurationSave(operationId)).toBe(true);
    await recovery.resendConfigurationSave(operationId);
    const command = fetch.mock.calls.at(-1)?.[1] as RequestInit;
    expect(command.body).toBe(body);
    expect(command.method).toBe('PUT');
    expect(new Headers(command.headers).get('If-Match')).toBe('"opaque-original"');
    expect(new Headers(command.headers).get('Idempotency-Key')).toBe(operationId);
    expect(fetch.mock.calls.filter(call => (call[1] as RequestInit).method === 'PUT')).toHaveLength(1);
  });

  it('refuses replay in another account and after losing the original in-memory request', async () => {
    storage();
    const fetch = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(settings())
      .mockResolvedValueOnce(new Response('{}', { status: 404 })).mockResolvedValueOnce(settings('account-b'));
    vi.stubGlobal('fetch', fetch);
    const { requestJson } = await import('./http.js'); await requestJson('/api/v1/settings');
    const recovery = await import('./configuration-save.js');
    recovery.retainConfigurationSave({ operationId, path: '/api/v1/settings', method: 'PUT', body: '{}', etag: 'old', accountId: 'account-a', installationId: 'installation-a', instanceId });
    await recovery.consultConfigurationSave(operationId);
    await expect(recovery.resendConfigurationSave(operationId)).rejects.toThrow('contexto mudou');
    vi.resetModules();
    const reloaded = await import('./configuration-save.js');
    expect(reloaded.hasOriginalConfigurationSave(operationId)).toBe(false);
    await expect(reloaded.resendConfigurationSave(operationId)).rejects.toThrow('Sem os dados desta operação');
    expect(fetch.mock.calls.filter(call => (call[1] as RequestInit).method === 'PUT')).toHaveLength(0);
  });
});
