export type SaveLifecycle = {
  activate(): void;
  dispose(): void;
  updateIdentity(identity: string): void;
  begin(identity: string): SaveOperation;
  isCurrent(currentIdentity: string, operation: SaveOperation): boolean;
};

export type SaveOperation = { identity: string; generation: number };

export function createSaveLifecycle(initialIdentity: string): SaveLifecycle {
  let active = true;
  let identity = initialIdentity;
  let generation = 0;
  return {
    activate() { active = true; },
    dispose() { active = false; },
    updateIdentity(nextIdentity) {
      if (identity === nextIdentity) return;
      identity = nextIdentity;
      generation += 1;
    },
    begin(operationIdentity) {
      return { identity: operationIdentity, generation };
    },
    isCurrent(currentIdentity, operation) {
      return active && currentIdentity === identity && operation.identity === identity && operation.generation === generation;
    },
  };
}
