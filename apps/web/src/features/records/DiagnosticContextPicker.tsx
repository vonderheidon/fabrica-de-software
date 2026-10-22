import { CustomSelect } from '../../app/CustomSelect.js';
import { useEffect, useState } from 'react';
import type { HttpAttemptPage, HttpCreationView, HttpEventPage } from '#contracts';
import { requestJson } from '../../api/http.js';
import { operatorState } from '../../app/operator-language.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';

type Choice = { id: string; label: string };
export function DiagnosticContextPicker({ scope, value, onChange }: {
  scope: 'project' | 'creation' | 'attempt'; value: string; onChange: (id: string) => void;
}) {
  const [choices, setChoices] = useState<Choice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (scope === 'project') return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    const params = new URLSearchParams({ limit: '25' });
    if (cursor) params.set('cursor', cursor);
    const load = async () => {
      if (scope === 'attempt') {
        const page = await requestJson<HttpAttemptPage>(`/api/v1/attempts?${params}`, { signal: controller.signal });
        return { choices: page.items.map((attempt) => ({ id: attempt.id, label: `Issue #${attempt.issue_number} · ${new Date(attempt.created_at_ms).toLocaleString('pt-BR')} · ${operatorState(attempt.result ?? attempt.phase).label}` })), next: page.has_more ? page.next_cursor : null };
      }
      const events = await requestJson<HttpEventPage>(`/api/v1/events?${params}`, { signal: controller.signal });
      const ids = [...new Set(events.items.filter((event) => event.entity_type === 'creation').map((event) => event.entity_id))];
      // Event history supplies creation identities; fetch names instead of exposing those identities.
      const results = await Promise.allSettled(ids.map((id) => requestJson<HttpCreationView>(`/api/v1/scaffold/creations/${encodeURIComponent(id)}`, { signal: controller.signal })));
      if (!controller.signal.aborted && results.some((result) => result.status === 'rejected')) setError('Algumas criações não puderam ser consultadas. As opções confirmadas continuam disponíveis.');
      const items = results.flatMap((result) => result.status === 'fulfilled' ? [{ id: result.value.creation.id, label: `${result.value.creation.plan.input.name} · ${new Date(result.value.creation.created_at_ms).toLocaleString('pt-BR')} · ${operatorState(result.value.creation.state).label}` }] : []);
      return { choices: items, next: events.has_more ? events.next_cursor : null };
    };
    void load().then((page) => {
      if (controller.signal.aborted) return;
      setChoices((current) => [...new Map([...(cursor ? current : []), ...page.choices].map((choice) => [choice.id, choice])).values()]);
      setNextCursor(page.next); setLoading(false);
    }).catch(() => { if (!controller.signal.aborted) { setError('Não foi possível consultar os contextos disponíveis.'); setLoading(false); } });
    return () => controller.abort();
  }, [scope, cursor, reload]);
  if (scope === 'project') return <ProjectPicker id="diagnostic-project" value={value} onChange={onChange} emptyLabel="Selecione o projeto" />;
  return <div className="form-field"><div className="form-field"><label htmlFor="diagnostic-context-choice">{scope === 'creation' ? 'Criação' : 'Tentativa'}</label><CustomSelect id="diagnostic-context-choice" value={value} onChange={(event) => onChange(event.currentTarget.value)}><option value="">Selecione pelo nome ou pela issue</option>{value && !choices.some((item) => item.id === value) && <option value={value}>Contexto selecionado na navegação</option>}{choices.map((choice) => <option value={choice.id} key={choice.id}>{choice.label}</option>)}</CustomSelect></div>
    {loading && <p role="status">Consultando contextos…</p>}{error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setReload((current) => current + 1)}>Consultar novamente</button></div>}
    {!loading && !error && choices.length === 0 && <p>Nenhum contexto encontrado nesta página de registros.</p>}
    {nextCursor && <button type="button" disabled={loading} onClick={() => setCursor(nextCursor)}>Carregar mais contextos</button>}
  </div>;
}
