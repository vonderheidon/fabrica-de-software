import { useEffect, useState } from 'react';
import { Value } from '@sinclair/typebox/value';
import { HttpHistoricalEffectiveProfile, type HttpAttemptDetail } from '#contracts';
import { HttpError, requestJson } from '../../api/http.js';

type CapturedProfile = typeof HttpHistoricalEffectiveProfile.static;
type State = { status: 'idle' | 'loading' | 'ready' | 'error'; profiles: CapturedProfile[]; message: string };

export function HistoricalProfile({ attemptId }: { attemptId: string }) {
  const [requested, setRequested] = useState(false);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<State>({ status: 'idle', profiles: [], message: '' });
  useEffect(() => {
    if (!requested) return;
    let active = true;
    const controller = new AbortController();
    setState({ status: 'loading', profiles: [], message: '' });
    void requestJson<HttpAttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?section=profiles`, { signal: controller.signal }).then(data => {
      if (!active) return;
      const items = data.details?.items;
      if (data.id !== attemptId || data.details?.section !== 'profiles' || !items || data.details.has_more || items.length > 2 || !items.every(item => Value.Check(HttpHistoricalEffectiveProfile, item))) throw new Error('Composição histórica indisponível nesta resposta.');
      if (new Set(items.map(item => 'role' in item ? item.role : null)).size !== items.length) throw new Error('Papéis históricos duplicados.');
      setState({ status: 'ready', profiles: items.filter((item): item is CapturedProfile => Value.Check(HttpHistoricalEffectiveProfile, item)), message: '' });
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', profiles: [], message: error instanceof HttpError ? error.message : 'Não foi possível consultar os perfis capturados. Tente novamente.' });
    });
    return () => { active = false; controller.abort(); };
  }, [attemptId, requested, retry]);

  return <section className="card historical-profiles" aria-label="Perfis capturados da tentativa">
    <h3>Instruções usadas nesta tentativa</h3>
    <p>Esta composição foi capturada no início. Editar o perfil atual afeta novas tentativas e preserva este histórico.</p>
    <button type="button" aria-disabled={state.status === 'loading'} aria-busy={state.status === 'loading'} onClick={() => {
      if (state.status === 'loading') return;
      setRequested(true);
      setRetry(value => value + 1);
    }}>{state.status === 'error' ? 'Consultar histórico novamente' : requested ? 'Atualizar leitura histórica' : 'Consultar perfis capturados'}</button>
    {state.status === 'loading' && <p role="status">Consultando instruções históricas…</p>}
    {state.status === 'error' && <div role="alert"><p>{state.message}</p></div>}
    {state.status === 'ready' && <>
      {state.profiles.length === 0 && <p>Composição histórica indisponível para esta tentativa legada.</p>}
      {state.profiles.map(profile => <article key={profile.role}>
        <h4>{profile.role === 'implementer' ? 'Implementador' : 'Revisor'}</h4>
        <dl className="preparation-facts">
          <div><dt>Revisão capturada</dt><dd>{profile.profile_revision ?? 'Indisponível no histórico'}</dd></div>
          <div><dt>Versão da composição</dt><dd>{profile.composition_version ?? 'Indisponível no histórico'}</dd></div>
          <div><dt>Executor</dt><dd>{profile.executor}</dd></div>
          <div><dt>Provider / modelo</dt><dd>{profile.provider} / {profile.model}</dd></div>
          <div><dt>Esforço</dt><dd>{profile.effort ?? 'Não se aplica'}</dd></div>
        </dl>
        <h5>Instruções comportamentais</h5>
        <pre className="historical-profile-text" tabIndex={0} aria-label={`Instruções históricas do ${profile.role === 'implementer' ? 'Implementador' : 'Revisor'}`}>{profile.guidance || 'Instruções não registradas.'}</pre>
        <h5>Contexto capturado da tarefa</h5><pre className="historical-profile-text" tabIndex={0}>{profile.context_summary || 'Contexto indisponível no histórico.'}</pre>
        <p>{profile.technical_contract_summary}</p>
      </article>)}
    </>}
  </section>;
}
