import { useEffect, useState } from 'react';
import type { ProjectFolderInspection } from '#contracts';
import { requestJson } from '../../api/http.js';
import { FieldHelp } from './FieldHelp.js';
import { nativeSelectionMessage, useNativeSelection } from './useNativeSelection.js';

type Inspection = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; location: string; value: ProjectFolderInspection } | { status: 'error'; location: string };

/** `owner/name` from a GitHub URL, used only as a label while no inspection has named the repository. */
export function repositoryLabel(repositoryUrl: string | undefined): string | null {
  const match = repositoryUrl ? /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(repositoryUrl.trim()) : null;
  return match ? `${match[1]}/${match[2]}` : null;
}

export function folderInspectionLabels(inspection: ProjectFolderInspection, fallbackRepository: string | null): { clone: string; checkout: string | null; ok: boolean } {
  const repository = inspection.repository ?? fallbackRepository ?? 'este repositório';
  const checkout = inspection.checkout === null ? null : inspection.checkout.kind === 'branch' ? `Em checkout: ${inspection.checkout.name}` : 'Em checkout: detached HEAD';
  switch (inspection.clone) {
    case 'same_repository': return { clone: `Clone de ${repository}`, checkout, ok: true };
    case 'unavailable': return { clone: 'Pasta indisponível para leitura. Confira o caminho e o acesso.', checkout: null, ok: false };
    default: return { clone: `Não é clone de ${repository}`, checkout, ok: false };
  }
}

export function ProjectFolderField({ projectId, location, kind, repositoryUrl, disabled, error, onSelect }: {
  projectId: string; location: string; kind: 'local' | 'github'; repositoryUrl: string | undefined; disabled: boolean; error: string | null; onSelect: (location: string) => void;
}) {
  const selection = useNativeSelection();
  const [inspection, setInspection] = useState<Inspection>({ status: 'idle' });
  const hasFolder = kind === 'local' && location.trim() !== '';

  useEffect(() => {
    if (selection.state.status === 'selected' && selection.state.kind === 'project_directory') onSelect(selection.state.path);
  }, [selection.state]);

  useEffect(() => {
    if (!hasFolder) { setInspection({ status: 'idle' }); return; }
    const controller = new AbortController();
    setInspection({ status: 'loading' });
    requestJson<ProjectFolderInspection>(`/api/v1/projects/${encodeURIComponent(projectId)}/folder-inspection`, {
      method: 'POST', body: JSON.stringify({ location }), signal: controller.signal,
    }).then((value) => setInspection({ status: 'ready', location, value }))
      .catch(() => { if (!controller.signal.aborted) setInspection({ status: 'error', location }); });
    return () => controller.abort();
  }, [projectId, location, hasFolder]);

  const fallback = repositoryLabel(repositoryUrl);
  const labels = inspection.status === 'ready' && inspection.location === location ? folderInspectionLabels(inspection.value, fallback) : null;
  const message = nativeSelectionMessage(selection.state);
  return <div className="form-field field-full registration-folder-field">
    <label htmlFor="project-folder">Pasta do projeto</label>
    <div className="registration-folder-row">
      <input id="project-folder" value={hasFolder ? location : ''} readOnly placeholder="Nenhuma pasta selecionada" aria-invalid={Boolean(error)} aria-describedby="project-folder-help project-folder-status" />
      <button type="button" disabled={disabled || selection.state.status === 'selecting'} onClick={() => void selection.select('project_directory')}>{selection.state.status === 'selecting' ? 'Abrindo janela…' : hasFolder ? 'Trocar pasta' : 'Selecionar pasta'}</button>
    </div>
    <FieldHelp id="project-folder-help" label="Pasta do projeto" />
    {error && <span className="error" role="alert">{error}</span>}
    <div id="project-folder-status" aria-live="polite">
      {kind === 'github' && <p className="notice" role="status">Pasta do projeto ausente. Selecione a pasta que contém o clone deste repositório e salve.</p>}
      {inspection.status === 'loading' && <small>Conferindo a pasta…</small>}
      {inspection.status === 'error' && inspection.location === location && <small role="status">Não foi possível conferir a pasta agora. O salvamento valida o clone novamente.</small>}
      {labels && <small><span className={`pill ${labels.ok ? '' : 'warn'}`}>{labels.clone}</span>{labels.checkout && <> <span className="pill">{labels.checkout}</span></>}</small>}
      {message && <p role="status">{message}</p>}
    </div>
    {repositoryUrl && <div className="project-repository-info"><span className="muted">Repositório</span> <code>{repositoryUrl}</code><small className="field-guidance muted"> Somente informação. Para usar outro repositório, cadastre outro projeto.</small></div>}
  </div>;
}
