import { useEffect, useState } from 'react';
import type { ProjectDetail } from '#contracts';
import { requestJson } from '../../api/http.js';
import { useProjects } from './useProjects.js';

export function ProjectPicker({ id, value, onChange, emptyLabel = 'Todos os projetos' }: {
  id: string; value: string; onChange: (value: string) => void; emptyLabel?: string;
}) {
  const [search, setSearch] = useState('');
  const projects = useProjects(search);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [selectionError, setSelectionError] = useState(false);
  const listed = projects.page?.items.some((item) => item.id === value);
  useEffect(() => {
    if (!value || listed) return;
    setSelectionError(false);
    const controller = new AbortController();
    void requestJson<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(value)}`, { signal: controller.signal }).then((detail) => {
      if (!controller.signal.aborted) setSelected(detail.project);
    }).catch(() => { if (!controller.signal.aborted) { setSelected(null); setSelectionError(true); } });
    return () => controller.abort();
  }, [value, listed]);
  return <div className="form-field">
    <label htmlFor={`${id}-search`}>Buscar projeto por nome</label><input id={`${id}-search`} value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
    <label htmlFor={id}>Projeto</label><select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
      <option value="">{emptyLabel}</option>
      {value && !listed && <option value={value}>{selected?.id === value ? selected.name : selectionError ? 'Nome do projeto indisponível nesta consulta' : 'Consultando projeto selecionado…'}</option>}
      {projects.page?.items.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
    </select>
    {projects.loading && <small role="status">Consultando projetos…</small>}
    {projects.error && <div role="alert"><p>{projects.error.message}</p><button type="button" onClick={projects.retry}>Consultar projetos novamente</button></div>}
    {projects.page?.has_more && <button type="button" disabled={projects.loading} onClick={() => void projects.loadMore()}>Carregar mais projetos</button>}
  </div>;
}
