import { randomUUID } from 'node:crypto';
import type { SetPublicationTarget } from '#contracts';
import { OperationError, type Storage, type TargetCommand } from '../storage/index.js';
import { TargetError } from '../workspaces/index.js';
import type { Workspaces } from '../workspaces/index.js';

export type TargetWorkspaces = Pick<Workspaces,'inspectPublicationTarget' | 'observePublicationTarget' | 'clonePublicationTarget'>;
export function createTargetSelections(storage: Storage, workspaces: Partial<TargetWorkspaces>, enqueue: (task: () => Promise<void>) => void, isClosed: () => boolean) {
  const active = new Set<string>();
  const supported = () => { if (isClosed()) throw new OperationError(503,'PUBLICATION_CLOSED','O controlador está encerrando.'); };
  async function run(id: string) {
    if (active.has(id)) return;
    active.add(id);
    let current = storage.getTargetSelection(id);
    try {
      supported();
      if (['confirmed','failed_known'].includes(current.view.state)) return;
      const authorize = () => {
        supported(); const now = storage.getTargetSelection(id);
        if (now.view.revision !== current.view.revision) throw new OperationError(409,'TARGET_SELECTION_CHANGED','A seleção mudou.');
        const a = storage.getAttempt(now.view.attempt_id);
        if (a.deliveryId !== now.view.delivery_id || a.result && !['delivered','interrupted'].includes(a.result)) throw new OperationError(409,'TARGET_ATTEMPT_CHANGED','A entrega mudou.');
        storage.assertTargetSelection(id);
      };
      authorize();
      if (!workspaces.observePublicationTarget || !workspaces.clonePublicationTarget) throw new OperationError(503,'CONTEXT_UNAVAILABLE','O contexto Git autorizado está indisponível.');
      let observed;
      if (current.view.state === 'accepted' && current.view.selection_kind === 'clone') {
        current = storage.advanceTargetSelection(id,current.view.revision,'running',null,null);
        observed = await workspaces.clonePublicationTarget(current.expected, identity => {
          current = storage.advanceTargetSelection(id,current.view.revision,'running',identity,null);
        },authorize);
      } else {
        // Recovery only observes the durably reserved directory, never repeats clone.
        if (current.view.selection_kind === 'clone' && current.expected.directoryIdentity === null) throw new TargetError('TARGET_OWNERSHIP_UNCERTAIN');
        observed = await workspaces.observePublicationTarget(current.expected);
      }
      authorize();
      storage.advanceTargetSelection(id,current.view.revision,'confirmed',observed,null);
    } catch (error) {
      current = storage.getTargetSelection(id);
      if (['confirmed','failed_known'].includes(current.view.state)) return;
      const reason = error instanceof TargetError || error instanceof OperationError ? error.code : 'TARGET_IO_UNCERTAIN';
      const known = ['TARGET_OCCUPIED','TARGET_PARENT_CHANGED','CONTEXT_UNAVAILABLE'].includes(reason) && current.expected.directoryIdentity === null;
      storage.advanceTargetSelection(id,current.view.revision,known ? 'failed_known' : 'unknown',null,reason);
    } finally { active.delete(id); }
  }
  async function select(attemptId: string, body: SetPublicationTarget, context: { operationId: string; expectedRevision: string | undefined }) {
    const command: TargetCommand = { ...context,attemptId,body };
    const previous = storage.recoverTargetSelection(command);
    if (previous) { if (!['succeeded','failed'].includes(previous.state)) enqueue(() => run(previous.operation_id)); return previous; }
    supported(); const { capture,path } = storage.validateTargetCommand(command);
    if (!workspaces.inspectPublicationTarget) throw new OperationError(503,'CONTEXT_UNAVAILABLE','O contexto Git autorizado está indisponível.');
    let expected;
    try { expected = await workspaces.inspectPublicationTarget(path,body.repository_id,capture.issue.repository.url,body.selection.kind); }
    catch (error) { throw new OperationError(409,error instanceof TargetError ? error.code : 'TARGET_INSPECTION_FAILED','Não foi possível confirmar o destino. Confira o clone ou escolha uma pasta livre.'); }
    const accepted = storage.acceptTargetSelection(command,expected);
    if (accepted.created) enqueue(() => run(context.operationId));
    return accepted.operation;
  }
  return {
    select,
    async reconcile(attemptId: string,deliveryId: string) {
      const pending = storage.findTargetSelection(attemptId,deliveryId);
      if (pending) await run(pending.view.operation_id);
      return storage.findTargetSelection(attemptId,deliveryId) !== null;
    },
    async ensureCaptured(deliveryId: string) {
      const delivery = storage.getDelivery(deliveryId).delivery; const capture = storage.getAttemptCapture(delivery.attemptId);
      if (storage.getIntegrationTarget(deliveryId)) return;
      const target = capture.v3Delivery;
      if (!target?.publication_target || capture.configuration.configuration.default_delivery_mode === 'icr') return;
      const prior = storage.findTargetSelection(delivery.attemptId,deliveryId,{ operationId: target.authorization_operation_id,hash: target.publication_target_hash! })?.view;
      if (prior) {
        await run(prior.operation_id);
        if (storage.getTargetSelection(prior.operation_id).view.state !== 'confirmed') throw new OperationError(409,'TARGET_SELECTION_PENDING','O destino precisa de conferência antes de continuar.');
        return;
      }
      const attempt = storage.getAttempt(delivery.attemptId);
      const operation = await select(attempt.id,{ delivery_id: deliveryId,repository_id: target.publication_target.repository_id,
        selection: target.publication_target.selection,authorized: true,authorization_operation_id: target.authorization_operation_id,target_intent_hash: target.publication_target_hash! },
        { operationId: randomUUID(),expectedRevision: `"${attempt.id}:${attempt.revision}"` });
      await run(operation.operation_id);
      if (storage.getTargetSelection(operation.operation_id).view.state !== 'confirmed') throw new OperationError(409,'TARGET_SELECTION_PENDING','O destino precisa de conferência antes de continuar.');
    },
  };
}
