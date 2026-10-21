import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rename, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createDeletionInspector, nativeDeletionInspectionPlatform, type DeletionInspectionInput,
  type DeletionInspectionPlatform, type DeletionPathObservation } from './deletion.js';

const projectId = '00000000-0000-4000-8000-000000000001';
function fixture() {
  const objects = new Map<string, DeletionPathObservation>();
  const observation = (path: string): DeletionPathObservation => objects.get(path) ?? {
    path, resolvedPath: path, identity: path.toLowerCase(), kind: 'directory',
    ancestors: [{ path: 'C:\\', identity: 'volume:1', resolvedPath: 'C:\\' }],
  };
  const platform: DeletionInspectionPlatform = { pathStyle: 'windows', caseSensitive: false,
    policyVersion: 'test/validated-reference-removal-v1', safeReferenceRemoval: true,
    observe: async path => observation(path) };
  const input: DeletionInspectionInput = { projectId, projectName: 'Projeto', projectRevision: 2, sourceKind: 'local',
    inventoryVersion: 'a'.repeat(64), blockers: [], containers: ['C:\\Projects'], originalProtectedPaths: ['C:\\Factory'],
    protectedPaths: ['C:\\Other'], targets: [{ key: 'original', kind: 'original_directory',
      path: 'C:\\Projects\\Espaços 日本', ownerKind: 'project', ownerId: projectId }] };
  return { objects, observation, platform, input };
}
describe('read-only deletion path conference', () => {
  it('is deterministic for identical root facts and does not enumerate internal files', async () => {
    const f = fixture(); let calls = 0;
    const inspector = createDeletionInspector({ ...f.platform, observe: async p => { calls++; return f.observation(p); } });
    const first = await inspector.inspectProjectDeletion(f.input);
    const second = await inspector.inspectProjectDeletion(f.input);
    expect(first.preview.can_confirm).toBe(true);
    expect(second.preview.authorization_digest).toBe(first.preview.authorization_digest);
    expect(calls).toBe(16); // Four roots, twice per inspection. No readdir/content port.
  });
  it.each(['C:\\', 'c:\\OTHER', 'C:\\Other\\child', 'C:\\Factory', 'C:\\Factory\\source', 'C:\\Projects',
    'C:\\Projects\\..\\Other', 'C:\\Projects\\trailing.', '\\\\server\\share', 'relative', 'C:\\Projects\\x:stream'])('blocks unsafe lexical target %s', async path => {
    const f = fixture();
    const result = await createDeletionInspector(f.platform).inspectProjectDeletion({ ...f.input,
      targets: [{ ...f.input.targets[0]!, path }] });
    expect(result.preview.can_confirm).toBe(false);
    expect(result.preview.blockers.length).toBeGreaterThan(0);
  });
  it.each(['symlink', 'junction', 'directory'] as const)('protects effective paths and aliases (%s)', async kind => {
    const f = fixture(); const path = f.input.targets[0]!.path;
    f.objects.set(path, { ...f.observation(path), kind, resolvedPath: 'c:\\OTHER\\child' });
    expect((await createDeletionInspector(f.platform).inspectProjectDeletion(f.input)).preview.can_confirm).toBe(false);
  });
  it('blocks equal object IDs even with unrelated lexical and resolved names', async () => {
    const f = fixture(); const path = f.input.targets[0]!.path;
    f.objects.set(path, { ...f.observation(path), identity: f.observation('C:\\Other').identity });
    expect((await createDeletionInspector(f.platform).inspectProjectDeletion(f.input)).preview.can_confirm).toBe(false);
  });
  it.each(['EACCES', 'EBUSY', 'ENOENT', 'EPERM'])('does not turn failed resolution %s into absence', async code => {
    const f = fixture();
    const inspector = createDeletionInspector({ ...f.platform, observe: async () => { throw Object.assign(new Error('private'), { code }); } });
    const result = await inspector.inspectProjectDeletion(f.input);
    expect(result.preview.can_confirm).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('distinguishes proven leaf absence and preserves ancestor identity', async () => {
    const f = fixture(); const path = f.input.targets[0]!.path;
    f.objects.set(path, { ...f.observation(path), kind: 'absent', identity: null, resolvedPath: null });
    const result = await createDeletionInspector(f.platform).inspectProjectDeletion(f.input);
    expect(result.preview.can_confirm).toBe(true);
    expect(result.observations[0]?.kind).toBe('absent');
    expect(result.preview.targets[0]?.state).toBe('removed');
  });
  it.each(['object', 'ancestor', 'resolution'])('invalidates a prior conference after %s replacement', async change => {
    const f = fixture(); const inspector = createDeletionInspector(f.platform);
    const before = await inspector.inspectProjectDeletion(f.input); const path = f.input.targets[0]!.path;
    const observed = f.observation(path);
    f.objects.set(path, { ...observed, ...(change === 'object' ? { identity: 'replacement' }
      : change === 'resolution' ? { resolvedPath: 'C:\\Elsewhere' }
        : { ancestors: [{ path: 'C:\\', identity: 'replacement', resolvedPath: 'C:\\' }] }) });
    const after = await inspector.inspectProjectDeletion(f.input, before);
    expect(after.preview.can_confirm).toBe(false);
    expect(after.preview.authorization_digest).not.toBe(before.preview.authorization_digest);
  });
  it('allows safe absence after external removal without accepting a replacement identity', async () => {
    const f = fixture(); const inspector = createDeletionInspector(f.platform);
    const authorized = await inspector.inspectProjectDeletion(f.input);
    const path = f.input.targets[0]!.path;
    const original = f.observation(path);
    f.objects.set(path, { ...original, identity: 'replacement' });
    const replaced = await inspector.inspectProjectDeletion(f.input, authorized);
    expect(replaced.preview.can_confirm).toBe(false);
    expect(replaced.preview.blockers).toContainEqual({
      reason: 'A pasta ou um de seus ancestrais foi substituído.',
      recovery: 'Retire a pasta substituta desse caminho fora da aplicação, preservando seu conteúdo, e clique em Tentar novamente para conferir.',
    });
    f.objects.set(path, { ...original, kind: 'absent', identity: null, resolvedPath: null });
    const absent = await inspector.inspectProjectDeletion(f.input, authorized);
    expect(absent.preview.can_confirm).toBe(true);
    expect(absent.observations[0]?.kind).toBe('absent');
    // Always compare to the original authorization, never the last observation.
    f.objects.set(path, { ...original, identity: 'replacement' });
    expect((await inspector.inspectProjectDeletion(f.input, authorized)).preview.can_confirm).toBe(false);
  });
  it('does not release absence when an authorized ancestor has changed', async () => {
    const f = fixture(); const inspector = createDeletionInspector(f.platform);
    const authorized = await inspector.inspectProjectDeletion(f.input);
    const path = f.input.targets[0]!.path;
    f.objects.set(path, { ...f.observation(path), kind: 'absent', identity: null, resolvedPath: null,
      ancestors: [{ path: 'C:\\', identity: 'replacement', resolvedPath: 'C:\\' }] });
    expect((await inspector.inspectProjectDeletion(f.input, authorized)).preview.can_confirm).toBe(false);
  });
  it('blocks changes during inspection and never emits a partially confirmable set', async () => {
    const f = fixture(); let count = 0; const path = f.input.targets[0]!.path;
    const inspector = createDeletionInspector({ ...f.platform, observe: async p => ({ ...f.observation(p),
      ...(p === path && ++count > 1 ? { identity: 'replacement' } : {}) }) });
    expect((await inspector.inspectProjectDeletion(f.input)).preview.can_confirm).toBe(false);
  });
  it('binds revision, inventory and policy to the digest', async () => {
    const f = fixture(); const inspector = createDeletionInspector(f.platform);
    const first = await inspector.inspectProjectDeletion(f.input);
    for (const input of [{ ...f.input, projectRevision: 3 }, { ...f.input, inventoryVersion: 'b'.repeat(64) }]) {
      expect((await inspector.inspectProjectDeletion(input)).preview.authorization_digest).not.toBe(first.preview.authorization_digest);
    }
    expect((await createDeletionInspector({ ...f.platform, policyVersion: 'v2' }).inspectProjectDeletion(f.input))
      .preview.authorization_digest).not.toBe(first.preview.authorization_digest);
  });
  it('exposes the missing production primitive and fails closed', async () => {
    expect(nativeDeletionInspectionPlatform().safeReferenceRemoval).toBe(false);
    const f = fixture();
    const result = await createDeletionInspector({ ...f.platform, safeReferenceRemoval: false }).inspectProjectDeletion(f.input);
    expect(result.preview.can_confirm).toBe(false);
    expect(result.preview.blockers.some(b => b.reason.includes('primitiva segura'))).toBe(true);
  });
});

describe('native deletion absence reconciliation', () => {
  const ignoreAbsent = (error: unknown): void => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  };
  async function temporaryFixture() {
    // Keep native mutation fixtures in the authorized workspace, not the
    // sandbox's external temporary directory with different ACLs.
    const fixtureRoot = join(process.cwd(), '.cache');
    await mkdir(fixtureRoot, { recursive: true });
    const base = await mkdtemp(join(fixtureRoot, 'factory-deletion-absence-'));
    const target = join(base, 'authorized');
    const platform = nativeDeletionInspectionPlatform();
    const inspector = createDeletionInspector(platform);
    const input: DeletionInspectionInput = {
      projectId, projectName: 'Projeto', projectRevision: 2, sourceKind: 'local', inventoryVersion: 'a'.repeat(64),
      blockers: [], containers: [], protectedPaths: [], originalProtectedPaths: [],
      targets: [{ key: 'original', kind: 'original_directory', path: target, ownerKind: 'project', ownerId: projectId }],
    };
    return { base, target, inspector, input };
  }

  it('recognizes safe physical absence without requiring a destructive primitive', async () => {
    const f = await temporaryFixture();
    try {
      const inspection = await f.inspector.inspectProjectDeletion(f.input);
      expect(inspection.preview.can_confirm).toBe(true);
      expect(inspection.preview.targets[0]?.state).toBe('removed');
      const reconciled = await f.inspector.reconcileProjectDeletion(f.input, inspection);
      expect(reconciled.preview.targets[0]?.state).toBe('removed');
    } finally { await rmdir(f.base); }
  });

  it('reobserves removed targets and preserves a replacement until it is externally withdrawn', async () => {
    const f = await temporaryFixture();
    const withdrawn = join(f.base, 'withdrawn');
    try {
      const authorization = await f.inspector.inspectProjectDeletion(f.input);
      expect(authorization.preview.targets[0]?.state).toBe('removed');
      await mkdir(f.target);
      const replacement = await nativeDeletionInspectionPlatform().observe(f.target);
      const blocked = await f.inspector.reconcileProjectDeletion(f.input, authorization);
      expect(blocked.preview.can_confirm).toBe(false);
      expect(blocked.preview.targets[0]?.state).toBe('blocked');
      expect(blocked.preview.blockers.some(b => b.recovery.includes('Retire a pasta substituta'))).toBe(true);
      expect((await nativeDeletionInspectionPlatform().observe(f.target)).identity).toBe(replacement.identity);
      await rename(f.target, withdrawn);
      const absent = await f.inspector.reconcileProjectDeletion(f.input, authorization);
      expect(absent.preview.targets[0]?.state).toBe('removed');
      expect((await nativeDeletionInspectionPlatform().observe(withdrawn)).identity).toBe(replacement.identity);
    } finally {
      await rmdir(withdrawn).catch(ignoreAbsent);
      await rmdir(f.target).catch(ignoreAbsent);
      await rmdir(f.base);
    }
  });

});

describe('reference removal orchestration', () => {
  it('passes original identities to the effect port and proves final absence', async () => {
    const f = fixture();
    let effects = 0;
    const inspector = createDeletionInspector({ ...f.platform, removeReference: async expected => {
      effects++;
      expect(expected.identity).toBe(f.observation(expected.path).identity);
      f.objects.set(expected.path, { ...expected, identity: null, resolvedPath: null, kind: 'absent' });
    } });
    const authorization = await inspector.inspectProjectDeletion(f.input);
    const removed = await inspector.removeProjectDeletion(f.input, authorization);
    expect(effects).toBe(1);
    expect(removed.preview.can_confirm).toBe(true);
    expect(removed.preview.targets[0]?.state).toBe('removed');
  });
  it.each(['EACCES', 'EBUSY', 'IDENTITY_CHANGED', 'UNSAFE'])('stops all subsequent effects on %s and sanitizes the failure', async code => {
    const f = fixture();
    const input = { ...f.input, targets: [...f.input.targets, { ...f.input.targets[0]!,
      key: 'second', path: 'C:\\Projects\\second' }] };
    let effects = 0;
    const inspector = createDeletionInspector({ ...f.platform, removeReference: async () => {
      effects++; throw Object.assign(new Error('private content or path'), { code });
    } });
    const authorization = await inspector.inspectProjectDeletion(input);
    const blocked = await inspector.removeProjectDeletion(input, authorization);
    expect(effects).toBe(1);
    expect(blocked.preview.can_confirm).toBe(false);
    expect(JSON.stringify(blocked)).not.toContain('private content');
    if (code === 'IDENTITY_CHANGED') expect(blocked.preview.blockers[0]?.recovery).toContain('Retire a pasta substituta');
  });
  it('blocks an adapter that advertises support without supplying the effect primitive', async () => {
    const f = fixture(); const inspector = createDeletionInspector(f.platform);
    const authorization = await inspector.inspectProjectDeletion(f.input);
    const result = await inspector.removeProjectDeletion(f.input, authorization);
    expect(result.preview.can_confirm).toBe(false);
    expect(result.preview.targets[0]?.state).toBe('blocked');
  });
  it('preserves a substituted target and does not invoke the effect port', async () => {
    const f = fixture(); let effects = 0;
    const inspector = createDeletionInspector({ ...f.platform, removeReference: async () => { effects++; } });
    const authorization = await inspector.inspectProjectDeletion(f.input);
    const path = f.input.targets[0]!.path;
    f.objects.set(path, { ...f.observation(path), identity: 'substitute' });
    const result = await inspector.removeProjectDeletion(f.input, authorization);
    expect(effects).toBe(0);
    expect(result.preview.can_confirm).toBe(false);
    expect(result.preview.blockers[0]?.recovery).toContain('Retire a pasta substituta');
  });
});
