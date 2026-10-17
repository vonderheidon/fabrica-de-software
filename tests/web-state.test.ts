import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../apps/web/src/api/uncertain-operations.js';
import { draftIdentity, getDraft, setDraft } from '../apps/web/src/app/drafts.js';
import { parseHash, routeIdentity } from '../apps/web/src/app/hash-route.js';

describe('web local state', () => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('window', { sessionStorage: storage });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('separates request and draft identity by tab and entity context', () => {
    const project = parseHash('#principal/projetos?projectId=project-a');
    const otherProject = parseHash('#principal/projetos?projectId=project-b');
    const attempt = parseHash('#principal/tentativas?attemptId=attempt-a');

    expect(routeIdentity(project)).not.toBe(routeIdentity(otherProject));
    expect(routeIdentity(project)).not.toBe(routeIdentity(attempt));
    setDraft(draftIdentity(project), 'search', 'filtro local');
    expect(getDraft<string>(draftIdentity(project), 'search')).toBe('filtro local');
    expect(getDraft<string>(draftIdentity(otherProject), 'search')).toBeUndefined();
  });

  it('stores only minimal metadata for uncertain operations and can resolve it', () => {
    const setItem = vi.spyOn(storage, 'setItem');
    recordUncertainOperation({ operationId: '00000000-0000-4000-8000-000000000001', kind: 'attempt-start', recordedAt: 10 });

    expect(readUncertainOperations()).toEqual([{ operationId: '00000000-0000-4000-8000-000000000001', kind: 'attempt-start', recordedAt: 10 }]);
    expect(setItem.mock.calls[0]?.[1]).not.toContain('body');
    expect(setItem.mock.calls[0]?.[1]).not.toContain('token');
    resolveUncertainOperation('00000000-0000-4000-8000-000000000001');
    expect(readUncertainOperations()).toEqual([]);
  });
});
