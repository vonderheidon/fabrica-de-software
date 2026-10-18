import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const session = () => new Response(JSON.stringify({ csrf_token: 'A'.repeat(43), instance_id: 'abcdef12-1234-4123-8123-123456789012' }));

describe('common public HTTP contracts', () => {
  it('reads snake_case errors and preserves correlation, field errors, facts and recovery', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'BLOCKED', message: 'Revise a configuração.', request_id: 'request-1', operation_id: 'abcdef12-1234-4123-8123-123456789012',
      resource: { type: 'settings', id: 'local' }, field_errors: [{ field: 'time_defaults.polling_interval_ms', message: 'Verifique o valor.' }],
      facts: { operatorKey: 'preserved' }, affected_requirements: ['RNF-18'], recovery: 'Consulte a operação antes de tentar novamente.',
    }), { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    const { requestJson, HttpError } = await import('./http.js');
    const failure: unknown = await requestJson('/api/v1/settings').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).toMatchObject({ status: 409, requestId: 'request-1', operationId: 'abcdef12-1234-4123-8123-123456789012',
      resource: { type: 'settings', id: 'local' }, fieldErrors: [{ field: 'time_defaults.polling_interval_ms', message: 'Verifique o valor.' }],
      facts: { operatorKey: 'preserved' }, affectedRequirements: ['RNF-18'], recovery: 'Consulte a operação antes de tentar novamente.' });
  });
  it('keeps the CSRF token in memory and never replays a mutation after a 401', async () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn() };
    vi.stubGlobal('sessionStorage', storage); vi.stubGlobal('localStorage', storage);
    const fetch = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(new Response(JSON.stringify({ code: 'SESSION_REQUIRED', message: 'Sessão necessária.', request_id: 'request-2' }), { status: 401 })).mockResolvedValueOnce(session());
    vi.stubGlobal('fetch', fetch);
    const { requestJson } = await import('./http.js');
    await expect(requestJson('/api/v1/settings', { method: 'PUT', body: '{}' })).rejects.toMatchObject({ status: 401, requestId: 'request-2' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/v1/session', '/api/v1/settings', '/api/v1/session']);
    const mutation = fetch.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(mutation.headers).get('X-CSRF-Token')).toBe('A'.repeat(43));
    expect(mutation.credentials).toBe('same-origin');
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled();
  });

  it.each(['json', 'text'] as const)('preserves the original %s mutation error when session renewal fails', async (format) => {
    const renewalFailure = new Error('Session renewal unavailable');
    const fetch = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'SESSION_REQUIRED', message: 'Sessão necessária.', request_id: 'original-request',
      operation_id: 'abcdef12-1234-4123-8123-123456789012', resource: { type: 'settings', id: 'local' },
      field_errors: [{ field: 'time_defaults', message: 'Confira a configuração.' }],
      facts: { committed: false }, affected_requirements: ['RNF-18'], recovery: 'Consulte a operação.',
    }), { status: 401 })).mockRejectedValueOnce(renewalFailure);
    vi.stubGlobal('fetch', fetch);
    const { requestJson, requestText, HttpError } = await import('./http.js');
    const request = format === 'json' ? requestJson : requestText;
    const failure: unknown = await request('/api/v1/settings', { method: 'PUT', body: '{}' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).toMatchObject({ status: 401, code: 'SESSION_REQUIRED', requestId: 'original-request',
      operationId: 'abcdef12-1234-4123-8123-123456789012', resource: { type: 'settings', id: 'local' },
      fieldErrors: [{ field: 'time_defaults', message: 'Confira a configuração.' }],
      facts: { committed: false }, affectedRequirements: ['RNF-18'], recovery: 'Consulte a operação.', cause: renewalFailure });
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/v1/session', '/api/v1/settings', '/api/v1/session']);
  });
});
