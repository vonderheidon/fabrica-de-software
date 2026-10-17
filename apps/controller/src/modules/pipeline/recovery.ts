import { createHash } from 'node:crypto';
import type { CancelAttempt, RemoveResource, RemovalPlan } from '#contracts';
import { OperationError, type RecoveryCommand } from '../storage/index.js';
import type { PipelineDependencies } from './start.js';

export interface RecoveryContext { operationId: string; expectedRevision: string | undefined }
export function createRecovery(deps: PipelineDependencies, enqueue: (task: () => Promise<void>) => void,
  revoke: (attemptId: string) => void, isClosed: () => boolean) {
  const { storage, workspaces, execution } = deps;
  const supported = () => { if (isClosed()) throw new OperationError(503, 'PIPELINE_CLOSED', 'The controller is shutting down.'); };
  const unavailable = (code: string): never => { throw new OperationError(409, code, 'This action is not currently available for the registered resource.'); };
  function environment(attemptId: string, resourceId: string) {
    const snapshot = storage.getResourceSnapshot(attemptId, resourceId);
    if (snapshot.resource.kind !== 'implementation' || !snapshot.resource.owned || snapshot.resource.removed) unavailable('RESOURCE_UNAVAILABLE');
    return snapshot;
  }
  async function plan(attemptId: string, resourceId: string) {
    const snapshot = environment(attemptId, resourceId);
    if (!workspaces.inspectEnvironment) throw new OperationError(503, 'REMOVAL_UNAVAILABLE', 'Environment inspection is unavailable.');
    const observation = await workspaces.inspectEnvironment(attemptId, snapshot.deliveries);
    if (storage.getResourceSnapshot(attemptId, resourceId).stamp !== snapshot.stamp) unavailable('RESOURCE_CHANGED');
    const reason = !snapshot.stopped ? 'RESOURCE_NOT_STOPPED' : snapshot.removalPending ? 'REMOVAL_IN_PROGRESS' : !observation.exists ? 'RESOURCE_MISSING' : !observation.contentSafe ? 'RETAINED_CONTENT_AT_RISK' : null;
    const losses = [`Todo o conteúdo da pasta de implementação, inclusive alterações locais e arquivos ignorados (${observation.fileCount} arquivos; ${observation.bytes} bytes).`,
      'O índice e metadados Git locais deste ambiente.'];
    const preservedReferences = ['Histórico, resultados oficiais e evidências de checks.', ...snapshot.deliveries.filter(d => d.captureState === 'captured').map(d => d.gitRef!)];
    const capability = { available: reason === null, reason };
    const planHash = createHash('sha256').update(JSON.stringify([snapshot.stamp, observation.stamp, losses, preservedReferences, capability])).digest('hex');
    const view: RemovalPlan = { resourceId, locationDisplay: snapshot.resource.reference, losses, preservedReferences, planHash, capability };
    return { view, etag: snapshot.etag, snapshot, observation };
  }
  function interaction(attemptId: string, passageId: string) {
    const passage = storage.getPassageForAttempt(attemptId, passageId);
    const surface = execution.interactionSurface({ passageId });
    const resource = storage.getResources(attemptId).entries.find(r => r.kind === 'terminal' && r.reference === passage.terminalName);
    if (!resource) throw new OperationError(404, 'RESOURCE_NOT_FOUND', 'The native session resource is not registered.');
    return { surface, resource };
  }
  async function folder(attemptId: string, resourceId: string) {
    const snapshot = storage.getResourceSnapshot(attemptId, resourceId);
    if (snapshot.resource.kind !== 'implementation') unavailable('RESOURCE_UNAVAILABLE');
    if (snapshot.resource.removed || !snapshot.resource.owned || snapshot.removalPending) {
      return { snapshot, capability: { available: false, reason: snapshot.resource.removed ? 'RESOURCE_REMOVED' : snapshot.removalPending ? 'REMOVAL_IN_PROGRESS' : 'RESOURCE_NOT_OWNED' } };
    }
    const capability = workspaces.folderCapability ? await workspaces.folderCapability(attemptId) : { available: false, reason: 'NATIVE_OPEN_UNAVAILABLE' };
    if (storage.getResourceSnapshot(attemptId, resourceId).stamp !== snapshot.stamp) unavailable('RESOURCE_CHANGED');
    return { snapshot, capability };
  }
  return {
    async cancelAttempt(attemptId: string, body: CancelAttempt, context: RecoveryContext) {
      const command: RecoveryCommand = { ...context, attemptId, kind: 'attempt.cancel', body };
      const old = storage.recoverRecovery(command); if (old) return old;
      supported();
      // This transaction revokes all domain advancement before abort/stop can have an effect.
      const accepted = storage.acceptRecovery(command); revoke(attemptId);
      if (accepted.created) enqueue(async () => { await execution.cancelAttempt(attemptId, context.operationId); });
      return accepted.operation;
    },
    getResources: (id: string) => storage.getResources(id),
    async getRemovalPlan(attemptId: string, resourceId: string) { const p = await plan(attemptId, resourceId); return { view: p.view, etag: p.etag }; },
    async removeResource(attemptId: string, resourceId: string, body: RemoveResource, context: RecoveryContext) {
      const command: RecoveryCommand = { ...context, attemptId, resourceId, kind: 'resource.remove', body };
      const old = storage.recoverRecovery(command); if (old) return old;
      supported();
      if (context.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
      const current = await plan(attemptId, resourceId);
      if (current.etag !== context.expectedRevision) throw new OperationError(412, 'REVISION_CONFLICT', 'The resource changed.');
      if (!current.view.capability.available) unavailable(current.view.capability.reason ?? 'REMOVAL_UNAVAILABLE');
      if (body.planHash !== current.view.planHash) unavailable('REMOVAL_PLAN_CHANGED');
      if (!workspaces.removeEnvironment) unavailable('REMOVAL_UNAVAILABLE');
      const accepted = storage.acceptRecovery(command, current.snapshot.stamp);
      if (accepted.created) enqueue(async () => {
        try {
          supported();
          await workspaces.removeEnvironment!(attemptId, current.snapshot.deliveries, current.observation.stamp, () => {
            supported(); const now = storage.getResourceSnapshot(attemptId, resourceId);
            if (!now.stopped) unavailable('RESOURCE_NOT_STOPPED');
            if (now.stamp !== current.snapshot.stamp) unavailable('RESOURCE_CHANGED');
          });
          storage.finishRecovery(context.operationId, 'confirmed');
        } catch (error) {
          storage.finishRecovery(context.operationId, 'unknown'); throw error;
        }
      });
      return accepted.operation;
    },
    getInteraction(attemptId: string, passageId: string) {
      const { surface } = interaction(attemptId, passageId);
      return { sessionReference: surface.reference, openCapability: { available: surface.available, reason: surface.reason }, eventCursor: storage.getAttempt(attemptId).eventCursor };
    },
    async openInteraction(attemptId: string, passageId: string, context: RecoveryContext) {
      const { surface, resource } = interaction(attemptId, passageId);
      const command: RecoveryCommand = { ...context, attemptId, resourceId: resource.id, passageId, kind: 'interaction.open', body: {} };
      const old = storage.recoverRecovery(command); if (old) return old;
      supported(); if (!surface.available || !surface.open) unavailable('NATIVE_OPEN_UNAVAILABLE');
      const accepted = storage.acceptRecovery(command, storage.getResourceSnapshot(attemptId, resource.id).stamp);
      if (accepted.created) enqueue(async () => {
        try { supported(); const latest = interaction(attemptId, passageId).surface;
          if (!latest.available || !latest.open) throw new OperationError(409, 'NATIVE_OPEN_UNAVAILABLE', 'Native opening is no longer available.');
          await latest.open(); storage.finishRecovery(context.operationId, 'confirmed'); }
        catch (error) { storage.finishRecovery(context.operationId, 'unknown'); throw error; }
      });
      return accepted.operation;
    },
    async getFolder(attemptId: string, resourceId: string) {
      const { snapshot, capability } = await folder(attemptId, resourceId);
      return { resourceId, locationDisplay: snapshot.resource.reference, openCapability: capability, eventCursor: snapshot.eventCursor };
    },
    async openFolder(attemptId: string, resourceId: string, context: RecoveryContext) {
      const command: RecoveryCommand = { ...context, attemptId, resourceId, kind: 'folder.open', body: {} };
      const old = storage.recoverRecovery(command); if (old) return old;
      supported(); const { snapshot, capability } = await folder(attemptId, resourceId);
      if (!capability.available || !workspaces.openEnvironment) unavailable('NATIVE_OPEN_UNAVAILABLE');
      const accepted = storage.acceptRecovery(command, snapshot.stamp);
      if (accepted.created) enqueue(async () => {
        try { supported(); const current = await folder(attemptId, resourceId); if (!current.capability.available) unavailable('NATIVE_OPEN_UNAVAILABLE');
          await workspaces.openEnvironment!(attemptId); storage.finishRecovery(context.operationId, 'confirmed'); }
        catch (error) { storage.finishRecovery(context.operationId, 'unknown'); throw error; }
      });
      return accepted.operation;
    },
  };
}

