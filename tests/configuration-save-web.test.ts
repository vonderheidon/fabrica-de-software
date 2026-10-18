import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertConfigurationBody, configurationBodyLimitMessage } from '../apps/web/src/api/configuration-body.js';
import { configurationDraftIdentity, getDraft, setDraft } from '../apps/web/src/app/drafts.js';
import { createSaveLifecycle } from '../apps/web/src/features/projects/save-lifecycle.js';
import { readUncertainOperations, recordUncertainOperation } from '../apps/web/src/api/uncertain-operations.js';

afterEach(() => vi.unstubAllGlobals());

describe('configuration editing safeguards', () => {
  it('measures the complete serialized UTF-8 body including Unicode and escapes', () => {
    const body = JSON.stringify({ guidance: 'ação😀\n"\\' });
    const bytes = new TextEncoder().encode(body).byteLength;
    expect(bytes).toBeGreaterThan(body.length);
    expect(() => assertConfigurationBody(body + ' '.repeat(16384 - bytes))).not.toThrow();
    expect(() => assertConfigurationBody(body + ' '.repeat(16385 - bytes))).toThrow(configurationBodyLimitMessage);
    expect(JSON.parse(body)).toEqual({ guidance: 'ação😀\n"\\' });
  });

  it('isolates drafts by account, resource, wizard step and profile', () => {
    const key = configurationDraftIdentity('account-a', 'global', 'profile', 'profile-a');
    setDraft(key, 'guidance', 'Rascunho íntegro 😀');
    expect(getDraft(key, 'guidance')).toBe('Rascunho íntegro 😀');
    for (const other of [
      configurationDraftIdentity('account-b', 'global', 'profile', 'profile-a'),
      configurationDraftIdentity('account-a', 'project-a', 'profile', 'profile-a'),
      configurationDraftIdentity('account-a', 'global', 'folder', 'profile-a'),
      configurationDraftIdentity('account-a', 'global', 'profile', 'profile-b'),
    ]) expect(getDraft(other, 'guidance')).toBeUndefined();
  });

  it('never persists extra properties from a structurally compatible metadata object', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    const metadata = { operationId: '00000000-0000-4000-8000-000000000001', kind: 'settings-save' as const, recordedAt: 10, body: 'private draft', etag: 'opaque', token: 'private token' };
    recordUncertainOperation(metadata);
    expect([...values.values()].join('')).not.toMatch(/private|body|etag|token/);
    expect(readUncertainOperations()).toEqual([{ operationId: metadata.operationId, kind: 'settings-save', recordedAt: 10 }]);
  });

  it('invalidates old work even when effect cleanup is followed by activation', () => {
    const lifecycle = createSaveLifecycle('global');
    const pending = lifecycle.begin('global');
    lifecycle.dispose();
    lifecycle.activate();
    expect(lifecycle.isCurrent('global', pending)).toBe(false);
    expect(lifecycle.isCurrent('global', lifecycle.begin('global'))).toBe(true);
  });
});
