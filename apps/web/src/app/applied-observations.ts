import { useEffect, useId, useSyncExternalStore } from 'react';

type ObservationState = 'pending' | 'applied' | 'failed';
const observations = new Map<string, ObservationState>();
const listeners = new Set<() => void>();
function emit(): void { for (const listener of listeners) listener(); }
function update(id: string, state: ObservationState): void {
  if (observations.get(id) === state) return;
  observations.set(id, state); emit();
}
export function invalidateAppliedObservations(): void {
  for (const id of observations.keys()) observations.set(id, 'pending');
  emit();
}
function snapshot(): ObservationState {
  const states = [...observations.values()];
  return states.includes('failed') ? 'failed' : states.includes('pending') ? 'pending' : 'applied';
}
export function useAppliedObservations(): ObservationState {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, snapshot, () => 'pending');
}

/** A read acknowledges success after React commits its resulting view. */
export function useAppliedObservation(enabled: boolean, pending: boolean, failed: boolean, revision: unknown): void {
  const id = useId();
  useEffect(() => {
    if (!enabled) return;
    update(id, 'pending');
    return () => { observations.delete(id); emit(); };
  }, [id, enabled]);
  useEffect(() => {
    if (!enabled) return;
    // Background reads retain the last outcome; stream resync explicitly invalidates it.
    if (failed) update(id, 'failed');
    else if (!pending) update(id, 'applied');
  }, [id, enabled, pending, failed, revision]);
}
