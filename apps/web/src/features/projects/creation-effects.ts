import type { HttpCreationView } from '#contracts';

// A remote projection and its journal record represent one operation. Distinct
// operation identities remain separate even when their kinds happen to match.
export function visibleCreationEffects(view: HttpCreationView) {
  return [
    ...view.effects.map((effect) => ({ kind: effect.kind, state: effect.state, reason: effect.reason, operation_id: effect.operation_id, source: 'Registro da operação' })),
    ...view.remote_effects.filter((remote) => !view.effects.some((effect) => effect.kind === remote.kind &&
      (remote.operation_id === null || effect.operation_id === remote.operation_id)))
      .map((effect) => ({ ...effect, source: 'Projeção da criação' })),
  ];
}
