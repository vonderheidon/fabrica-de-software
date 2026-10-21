import type { Storage, ProjectDeletionCommand } from '../storage/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { OperationError } from '../storage/index.js';

/** Coordinates read-only inspection and durable acceptance through public ports. */
export function createProjectDeletions(dependencies: {
  storage: Storage;
  workspaces: Pick<Workspaces, 'inspectProjectDeletion'>;
  coordinator?: { schedule(operationId: string): Promise<void> };
}) {
  const { storage, workspaces } = dependencies;
  const inspect = async (projectId: string) => {
    const paths = storage.getProjectDeletionPaths(projectId);
    try { return await workspaces.inspectProjectDeletion(paths); }
    catch {
      throw new OperationError(503, 'PROJECT_DELETION_INSPECTION_UNAVAILABLE', 'Não foi possível conferir os alvos da exclusão.', {
        recovery: 'Verifique o acesso às pastas e consulte novamente a exclusão.',
      });
    }
  };
  return {
    preview: async (projectId: string) => {
      const before = storage.getProject(projectId).view.project;
      const inspection = await inspect(projectId);
      const current = storage.getProject(projectId);
      const after = current.view.project;
      if (before.current_revision_id !== after.current_revision_id) throw new OperationError(503, 'PROJECT_DELETION_INSPECTION_UNAVAILABLE', 'O cadastro mudou durante a consulta. Consulte novamente a exclusão.');
      return { view: inspection.preview, etag: current.etag };
    },
    accept: async (command: ProjectDeletionCommand) => {
      const recovered = storage.recoverProjectDeletion(command);
      if (recovered) return recovered;
      if (command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match é obrigatório.');
      const inspection = await inspect(command.projectId);
      const status = storage.acceptProjectDeletion({ command, inspection });
      if (status.state === 'accepted') void dependencies.coordinator?.schedule(status.operation_id);
      return status;
    },
  };
}
