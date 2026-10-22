import { CustomSelect } from '../../app/CustomSelect.js';
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
  const selectedName = projects.page?.items.find(item => item.id === value)?.name ?? (selected?.id === value ? selected.name : selectionError ? 'Projeto indisponível' : 'Consultando projeto…');
  return <div className="form-field">
    <label htmlFor={id}>Projeto</label>
    <CustomSelect id={id} value={value} searchValue={search} onSearchChange={setSearch} searchLabel="Buscar projeto" loading={projects.loading} onChange={event => {
      const projectId = event.currentTarget.value;
      const project = projects.page?.items.find(item => item.id === projectId);
      if (project) setSelected({ id: project.id, name: project.name });
      onChange(projectId);
      setSearch('');
    }} footer={<>
      {projects.error && <div role="alert"><p>{projects.error.message}</p><button type="button" onClick={projects.retry}>Tentar novamente</button></div>}
      {projects.page?.has_more && <button type="button" disabled={projects.loading} onClick={() => void projects.loadMore()}>Carregar mais projetos</button>}
    </>}>
      <option value="">{emptyLabel}</option>
      {value && !listed && <option value={value}>{selectedName}</option>}
      {projects.page?.items.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
    </CustomSelect>
  </div>;
}
