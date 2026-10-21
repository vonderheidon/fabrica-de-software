import { ProjectDeletionPendingNotice, rememberProjectDeletion, knownProjectDeletion } from './ProjectDeletionPendingNotice.js';
import { useEffect, useRef, useState } from 'react';
import { Value } from '@sinclair/typebox/value';
import { ProjectDetail } from '#contracts';
import { requestJson } from '../../api/http.js';
import type { DeletionOriginContext } from '../../api/project-deletion.js';
import { ProjectDeletionDialog } from './ProjectDeletionDialog.js';

export function ProjectDeletionAction({ projectId, projectRevision, installationId, accountId, hasUnsavedChanges, pollingIntervalMs, onProjectNameChange }: {
  onProjectNameChange?: (name: string) => void;
  projectId: string; projectRevision: number; installationId: string; accountId: string | null; hasUnsavedChanges: boolean; pollingIntervalMs: number;
}) {
  const [projectName, setProjectName] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [context, setContext] = useState<DeletionOriginContext | null>(null);
  const version = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setProjectName(null); setError(false);
    void requestJson<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}`, { signal: controller.signal }).then((data) => {
      if (!active) return;
      if (!Value.Check(ProjectDetail, data) || data.project.id !== projectId || data.project.revision !== projectRevision) { setError(true); return; }
      rememberProjectDeletion(projectId, data.deletion);
      setProjectName(data.project.name);
      onProjectNameChange?.(data.project.name);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; controller.abort(); };
  }, [projectId, projectRevision, reload, onProjectNameChange]);
  const deletion = knownProjectDeletion(projectId);
  if (deletion && !context) return <ProjectDeletionPendingNotice projectId={projectId} projectName={projectName ?? 'Projeto'} revision={projectRevision} deletion={deletion} pollingIntervalMs={pollingIntervalMs} />;
  return <>
    <button ref={trigger} type="button" className="danger-button" disabled={!projectName} onClick={() => {
      if (projectName) setContext(Object.freeze({ projectId, projectName, projectRevision, contextVersion: ++version.current }));
    }}>Excluir definitivamente</button>
    {error && <div role="alert"><p>Não foi possível conferir o cadastro salvo. Atualize seus dados antes de abrir a exclusão.</p><button type="button" onClick={() => setReload((value) => value + 1)}>Consultar cadastro novamente</button></div>}
    {context && <ProjectDeletionDialog originContext={context} currentRevision={projectRevision} installationId={installationId} accountId={accountId}
      hasUnsavedChanges={hasUnsavedChanges} pollingIntervalMs={pollingIntervalMs} returnFocusTarget={trigger.current} onClose={() => setContext(null)} />}
  </>;
}
