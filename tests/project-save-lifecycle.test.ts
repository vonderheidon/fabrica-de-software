import { describe, expect, it } from 'vitest';
import { createSaveLifecycle } from '../apps/web/src/features/projects/save-lifecycle.js';

describe('project configuration save lifecycle', () => {
  it('does not authorize a delayed response from a disposed editor reopened with the same identity', async () => {
    const identity = 'project-a';
    const oldEditor = createSaveLifecycle(identity);
    const reopenedEditor = createSaveLifecycle(identity);
    const oldOperation = oldEditor.begin(identity);
    const draftWrites: string[] = [];
    let resolveSave: (() => void) | undefined;
    const pendingSave = new Promise<void>((resolve) => { resolveSave = resolve; });
    const delayedResponse = pendingSave.then(() => {
      if (oldEditor.isCurrent(identity, oldOperation)) draftWrites.push('old response overwrote draft');
    });

    oldEditor.dispose();
    reopenedEditor.activate();
    expect(oldEditor.isCurrent(identity, oldOperation)).toBe(false);
    expect(reopenedEditor.isCurrent(identity, reopenedEditor.begin(identity))).toBe(true);
    draftWrites.push('new editor saved latest draft');
    resolveSave?.();
    await delayedResponse;

    expect(draftWrites).toEqual(['new editor saved latest draft']);
  });

  it('invalidates a pending A response after the mounted editor changes A to B and back to A', async () => {
    const editor = createSaveLifecycle('project-a');
    const delayedOperation = editor.begin('project-a');
    const draftWrites: string[] = [];
    let resolveConflictRead: (() => void) | undefined;
    const pendingConflictRead = new Promise<void>((resolve) => { resolveConflictRead = resolve; });
    const delayedResponse = pendingConflictRead.then(() => {
      if (editor.isCurrent('project-a', delayedOperation)) draftWrites.push('stale A revision rebased the current draft');
    });

    editor.updateIdentity('project-b');
    editor.updateIdentity('project-a');
    expect(editor.isCurrent('project-a', delayedOperation)).toBe(false);

    draftWrites.push('current A draft remains intact');
    resolveConflictRead?.();
    await delayedResponse;

    expect(draftWrites).toEqual(['current A draft remains intact']);
  });
});
