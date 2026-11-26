import { blocksDeletion } from '#contracts';
import type { Storage } from '../storage/index.js';
import { OperationError } from '../storage/index.js';
import type { Workspaces } from '../workspaces/index.js';

/** Installation-scoped coordinator. No timer, HTTP session or external authority. */
export function createDeletionCoordinator({ storage, workspaces, logFailure, prepareAttempts }: {
  storage: Pick<Storage, 'deletionWorker' | 'getProjectDeletion' | 'finalizeProjectDeletion'>;
  workspaces: Pick<Workspaces, 'inspectProjectDeletion' | 'reconcileProjectDeletion' | 'removeProjectDeletion'>;
  logFailure: (code: string) => void;
  prepareAttempts?: (attemptIds: readonly string[], operationId: string) => Promise<void>;
}) {
  const active = new Map<string, Promise<void>>();
  const checked = new Map<string, Promise<void>>();
  let closing = false;
  let recovered = false;
  async function execute(id: string, confirmed: () => void): Promise<void> {
    const worker = storage.deletionWorker.claim(id);
    if (!worker) return;
    try {
      const attempts = storage.deletionWorker.attempts(worker);
      // Stopping is best effort: an unconfirmed stop never holds back a confirmed deletion.
      if (prepareAttempts) await prepareAttempts(attempts, id).catch(() => logFailure('PROJECT_DELETION_STOP_UNCONFIRMED'));
      const snapshot = storage.deletionWorker.snapshot(worker);
      const { input } = snapshot;
      // An empty target set grants no filesystem identity. No policy was stored
      // on a target in that case; establish the current read-only policy.
      const authorization = snapshot.authorization.claims.length ? snapshot.authorization
        : await workspaces.inspectProjectDeletion(input);
      const verify = async () => {
        if (closing) throw new Error('PROJECT_DELETION_INTERRUPTED');
        const snapshot = storage.deletionWorker.snapshot(worker);
        const inspection = await workspaces.reconcileProjectDeletion(snapshot.input, authorization);
        const latest = storage.deletionWorker.snapshot(worker);
        if (latest.input.inventoryVersion !== snapshot.input.inventoryVersion || blocksDeletion(latest.input.blockers)) {
          throw new OperationError(409, 'PROJECT_DELETION_TARGETS_CHANGED', 'Os vínculos mudaram durante a conferência.', {
            recovery: 'Clique em Tentar novamente para continuar a exclusão.',
          });
        }
        if (!inspection.preview.can_confirm) {
          const blocker = inspection.preview.blockers[0];
          throw new OperationError(409, 'PROJECT_DELETION_RECONFIRMATION_REQUIRED', blocker?.reason ?? 'A segurança dos alvos não foi comprovada.', {
            recovery: blocker?.recovery ?? 'Confira os caminhos e tente novamente.',
          });
        }
        return inspection;
      };
      await verify();
      storage.deletionWorker.start(worker);
      confirmed();
      const result = await workspaces.removeProjectDeletion(input, authorization, {
        before: async key => { await verify(); storage.deletionWorker.progress(worker, key, 'removing'); },
        removed: key => storage.deletionWorker.progress(worker, key, 'removed'),
      });
      if (!result.preview.can_confirm) {
        const blocker = result.preview.blockers[0];
        storage.deletionWorker.finish(worker, blocker?.reason.includes('substitu') ? 'reconfirmation_required' : 'pending',
          blocker?.reason ?? 'A exclusão não foi concluída.', blocker?.recovery ?? 'Confira as pastas e tente novamente.');
        return;
      }
      const final = await verify();
      if (final.observations.some(o => o.kind !== 'absent')) throw new Error('PROJECT_DELETION_ABSENCE_REQUIRED');
      // No await before SQL finalization. This observation is the filesystem
      // boundary; empty names are not reserved against external recreation.
      storage.finalizeProjectDeletion({ operationId: worker.operationId,
        projectId: input.projectId, workerGeneration: worker.generation, workerToken: worker.token });
    } catch (error) {
      logFailure(error instanceof OperationError ? error.code : 'PROJECT_DELETION_INTERRUPTED');
      try {
        storage.deletionWorker.finish(worker, error instanceof OperationError ? 'reconfirmation_required' : 'pending',
          error instanceof OperationError ? error.message : 'A execução foi interrompida; o progresso realizado foi preservado.',
          'Clique em Tentar novamente para continuar a exclusão.');
      } catch { logFailure('PROJECT_DELETION_PROGRESS_UNCONFIRMED'); }
    }
  }
  function schedule(id: string): Promise<void> {
    const existing = active.get(id);
    if (existing) return existing;
    if (closing) return Promise.resolve();
    let confirmed = () => {};
    checked.set(id, new Promise<void>(resolve => { confirmed = resolve; }));
    const task = Promise.resolve().then(() => execute(id, confirmed)).catch(() => {
      logFailure('PROJECT_DELETION_CLAIM_UNCONFIRMED');
    }).finally(() => { confirmed(); active.delete(id); checked.delete(id); });
    active.set(id, task);
    return task;
  }
  return {
    schedule,
    recover: () => {
      if (recovered) return;
      recovered = true;
      for (const id of storage.deletionWorker.recover()) void schedule(id);
    },
    resume: async (id: string) => {
      const status = storage.getProjectDeletion(id);
      if (!status || status.state === 'succeeded') return status;
      if (active.has(id)) return status;
      if (!status.can_retry) throw new OperationError(409, 'PROJECT_DELETION_RETRY_NOT_ALLOWED', 'Aguarde a execução em andamento.');
      void schedule(id);
      // Only the read-only reconference is awaited by the command. Removal is
      // owned by the coordinator and continues after its caller disconnects.
      await checked.get(id);
      const result = storage.getProjectDeletion(id);
      if (result?.state === 'reconfirmation_required') throw new OperationError(409, 'PROJECT_DELETION_RECONFIRMATION_REQUIRED',
        result.blockers[0]?.reason ?? 'A reconferência mantém a exclusão bloqueada.', {
          recovery: result.blockers[0]?.recovery ?? 'Confira os caminhos e tente novamente.',
        });
      return result;
    },
    drain: async () => { await Promise.all(active.values()); },
    close: async () => { closing = true; await Promise.all(active.values()); },
  };
}
