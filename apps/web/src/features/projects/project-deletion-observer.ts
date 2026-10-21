import { getProjectDeletionStatus, isProjectDeletionOperationCompleted, knownProjectDeletionOperations, type ProjectDeletionStatus } from '../../api/project-deletion.js';
import { readUncertainOperations } from '../../api/uncertain-operations.js';

type Subscriber = { publish: (status: ProjectDeletionStatus) => void; fail: () => void };
type Observation = {
  subscribers: Set<Subscriber>; intervalMs: number; maxBackoffMs: number;
  timer: ReturnType<typeof setTimeout> | undefined; active: boolean; reading: boolean;
  controller: AbortController;
  failures: number; value: ProjectDeletionStatus | null;
};
const observations = new Map<string, Observation>();
const owners = new Set<symbol>();

function knownOperations(): Set<string> {
  return new Set([...knownProjectDeletionOperations(), ...readUncertainOperations().filter(item => item.kind === 'project.delete').map(item => item.operationId)]);
}
function dispose(id: string, observation: Observation): void {
  observation.active = false;
  observation.controller.abort();
  if (observation.timer !== undefined) clearTimeout(observation.timer);
  observations.delete(id);
}
async function read(id: string, observation: Observation): Promise<void> {
  if (!observation.active || observation.reading) return;
  if (observation.timer !== undefined) clearTimeout(observation.timer);
  observation.reading = true;
  try {
    const value = await getProjectDeletionStatus(id, observation.controller.signal);
    if (!observation.active) return;
    observation.value = value;
    observation.failures = 0;
    for (const subscriber of observation.subscribers) subscriber.publish(value);
  } catch {
    if (!observation.active) return;
    observation.failures += 1;
    for (const subscriber of observation.subscribers) subscriber.fail();
  } finally {
    observation.reading = false;
    if (observation.active && observation.value?.state !== 'succeeded' && !isProjectDeletionOperationCompleted(id)) {
      const delay = observation.failures ? Math.min(observation.maxBackoffMs, observation.intervalMs * 2 ** Math.min(observation.failures, 20)) : observation.intervalMs;
      observation.timer = setTimeout(() => { void read(id, observation); }, delay);
    }
  }
}
function ensure(id: string, intervalMs: number, maxBackoffMs: number): Observation {
  const existing = observations.get(id);
  if (existing) return existing;
  const observation: Observation = { subscribers: new Set(), intervalMs, maxBackoffMs, active: true, reading: false, controller: new AbortController(), timer: undefined, failures: 0, value: null };
  observations.set(id, observation);
  // Subscribers must be attached before a synchronously resolved read publishes.
  void Promise.resolve().then(() => read(id, observation));
  return observation;
}

export function subscribeProjectDeletion(id: string, publish: Subscriber['publish'], fail: Subscriber['fail'], intervalMs: number, maxBackoffMs: number): () => void {
  const observation = ensure(id, intervalMs, maxBackoffMs);
  observation.intervalMs = intervalMs;
  observation.maxBackoffMs = Math.max(observation.maxBackoffMs, maxBackoffMs);
  const subscriber = { publish, fail };
  observation.subscribers.add(subscriber);
  if (observation.value) publish(observation.value);
  return () => {
    observation.subscribers.delete(subscriber);
    if (!observation.subscribers.size && (!owners.size || !knownOperations().has(id))) dispose(id, observation);
  };
}
export function refreshProjectDeletion(id: string): void {
  const observation = observations.get(id);
  if (observation) void read(id, observation);
}

/** Application ownership outlives dialogs; all background work is read-only. */
export function trackProjectDeletions(intervalMs: number): () => void {
  const owner = Symbol();
  owners.add(owner);
  const sync = () => {
    const known = knownOperations();
    for (const id of known) if (!isProjectDeletionOperationCompleted(id)) ensure(id, intervalMs, Math.max(intervalMs, 60_000));
    for (const [id, observation] of observations) {
      if (!observation.subscribers.size && (!known.has(id) || isProjectDeletionOperationCompleted(id))) dispose(id, observation);
    }
  };
  window.addEventListener('factory-project-deletion-pending', sync);
  window.addEventListener('factory-project-deleted', sync);
  window.addEventListener('factory-controller-resync', sync);
  sync();
  return () => {
    owners.delete(owner);
    window.removeEventListener('factory-project-deletion-pending', sync);
    window.removeEventListener('factory-project-deleted', sync);
    window.removeEventListener('factory-controller-resync', sync);
    if (!owners.size) for (const [id, observation] of observations) if (!observation.subscribers.size) dispose(id, observation);
  };
}
