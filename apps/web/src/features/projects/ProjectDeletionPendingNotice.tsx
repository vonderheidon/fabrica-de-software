import { useEffect, useRef, useState } from 'react';
import type { DeletionSummary } from '#contracts';
import type { ProjectDetail } from '#contracts';
import { requestJson } from '../../api/http.js';
import type { ControllerEventNotice } from '../../app/useControllerEvents.js';
import { ProjectDeletionDialog } from './ProjectDeletionDialog.js';
import { isProjectDeletionCompleted, bindProjectDeletion, pendingProjectDeletionOperation } from '../../api/project-deletion.js';

// Remember a known restriction across failed refreshes until completion is proven.
const pendingProjects = new Map<string, DeletionSummary>();
export function forgetProjectDeletion(projectId: string): void { pendingProjects.delete(projectId); }
export function rememberProjectDeletion(projectId: string, deletion: DeletionSummary | null): void {
  if (deletion && !isProjectDeletionCompleted(projectId)) { pendingProjects.set(projectId, deletion); bindProjectDeletion(deletion.operation_id, projectId); }
}
export function knownProjectDeletion(projectId: string): DeletionSummary | null {
  if (isProjectDeletionCompleted(projectId)) { pendingProjects.delete(projectId); return null; }
  const operationId = pendingProjectDeletionOperation(projectId);
  return pendingProjects.get(projectId) ?? (operationId ? { operation_id: operationId, state: 'accepted', reason: null, recovery: null } : null);
}
export function useProjectDeletionRestriction(projectId: string | null): boolean {
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update((value) => value + 1);
    let active = true;
    const controller = new AbortController();
    const observe = (event: Event) => {
      const notice = (event as CustomEvent<Partial<ControllerEventNotice>>).detail;
      if (!projectId || notice && notice.project_id !== projectId) return;
      void requestJson<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(projectId)}`, { signal: controller.signal }).then((data) => {
        if (!active) return;
        rememberProjectDeletion(projectId, data.deletion); refresh();
      }).catch(() => { /* Keep known restrictions when observation is unavailable. */ });
    };
    window.addEventListener('factory-controller-event', observe);
    window.addEventListener('factory-controller-resync', observe);
    window.addEventListener('factory-project-deletion-pending', refresh);
    window.addEventListener('factory-project-deleted', refresh);
    return () => {
      active = false; controller.abort();
      window.removeEventListener('factory-controller-event', observe);
      window.removeEventListener('factory-controller-resync', observe);
      window.removeEventListener('factory-project-deletion-pending', refresh); window.removeEventListener('factory-project-deleted', refresh);
    };
  }, [projectId]);
  return Boolean(projectId && knownProjectDeletion(projectId));
}
export function ProjectDeletionPendingNotice({ projectId, projectName, revision, deletion, pollingIntervalMs = 15000 }: {
  projectId: string; projectName: string; revision: number; deletion: DeletionSummary; pollingIntervalMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    rememberProjectDeletion(projectId, deletion);
    window.dispatchEvent(new Event('factory-project-deletion-pending'));
  }, [projectId, deletion.operation_id]);
  return <section className="notice" aria-label="Exclusão pendente">
    <p>Este cadastro está em exclusão. Preparação, início, publicação e salvamento estão indisponíveis.</p>
    {deletion.reason && <p>{deletion.reason}</p>}{deletion.recovery && <p>Próxima ação: {deletion.recovery}</p>}
    <button ref={trigger} type="button" onClick={() => setOpen(true)}>Acompanhar exclusão</button>
    {open && <ProjectDeletionDialog originContext={{ projectId, projectName, projectRevision: revision, contextVersion: 0 }} currentRevision={revision}
      installationId="" accountId={null} hasUnsavedChanges={false} pollingIntervalMs={pollingIntervalMs} returnFocusTarget={trigger.current}
      initialOperationId={deletion.operation_id} onClose={() => setOpen(false)} />}
  </section>;
}
