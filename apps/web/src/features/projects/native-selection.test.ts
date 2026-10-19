import { describe, expect, it } from 'vitest';
import { nativeSelectionMessage, type NativeSelectionState } from './useNativeSelection.js';

describe('native selection feedback', () => {
  it('keeps a selected path labeled as an unsaved candidate', () => {
    const state: NativeSelectionState = { status: 'selected', kind: 'projects_root', path: 'C:\\work\\apps', observedAtMs: 1 };
    expect(nativeSelectionMessage(state)).toContain('ainda não foi salva');
  });

  it('explains that cancellation preserves the existing value', () => {
    expect(nativeSelectionMessage({ status: 'cancelled', kind: 'projects_root' })).toContain('foram mantidos');
  });

  it('reports an unconfirmed close and does not imply automatic reopening', () => {
    const message = nativeSelectionMessage({ status: 'expired', kind: 'gh_executable', closeConfirmed: false });
    expect(message).toContain('fechamento da janela não foi confirmado');
    expect(message).toContain('não a abrirá novamente sem uma nova ação sua');
  });

  it('explains native host unavailability in operator language', () => {
    expect(nativeSelectionMessage({ status: 'unavailable', kind: 'projects_root', diagnostic: 'NATIVE_SELECTION_UNAVAILABLE', closeConfirmed: true }))
      .toContain('host não oferece a seleção nativa');
  });
});
