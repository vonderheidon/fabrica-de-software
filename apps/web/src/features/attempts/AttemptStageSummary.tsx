import { useEffect, useState } from 'react';
import type { StageActivity } from '#contracts';

const labels: Record<StageActivity['stage'], string> = {
  preparing: 'Preparação em andamento', implementing: 'Implementação em andamento', verifying: 'Verificação em andamento',
  reviewing: 'Revisão em andamento', publishing: 'Publicação em andamento', waiting_decision: 'Aguardando decisão',
  tracking_lost: 'Acompanhamento perdido', finished: 'Tentativa encerrada',
};
export function formatStageDuration(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return hours ? `${hours} h ${minutes} min` : `${minutes} min ${seconds % 60} s`;
}

export function AttemptStageSummary({ activity, stale = false, blocked = false }: { activity: StageActivity | null | undefined; stale?: boolean; blocked?: boolean }) {
  const [now, setNow] = useState(Date.now);
  const ticking = Boolean(activity?.availability === 'known' && activity.stage !== 'finished' && !stale);
  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activity, ticking]);
  const delta = ticking && activity ? Math.max(0, now - activity.observed_at_ms) : 0;
  const elapsed = activity?.elapsed_ms === null || activity?.elapsed_ms === undefined ? null : activity.elapsed_ms + delta;
  const remaining = activity?.remaining_ms === null || activity?.remaining_ms === undefined ? null : Math.max(0, activity.remaining_ms - delta);
  return <section className="attempt-stage-summary" aria-label="Etapa e atividade da tentativa">
    <h3>{blocked ? 'Bloqueada por pré-requisito' : activity ? labels[activity.stage] : 'Etapa indisponível'}</h3>
    {stale && <p className="stale-note">Dados da consulta anterior. Consulte novamente para atualizar.</p>}
    {activity?.stage === 'tracking_lost' && <p>A última atividade observada não comprova parada física. Consulte o diagnóstico da tentativa.</p>}
    <dl className="preparation-facts">
      <div><dt>Tempo nesta etapa</dt><dd>{activity?.availability === 'known' && elapsed !== null ? formatStageDuration(elapsed) : 'Indisponível'}</dd></div>
      <div><dt>Última atividade confirmada</dt><dd>{activity?.last_activity_at_ms !== null && activity?.last_activity_at_ms !== undefined ? <time dateTime={new Date(activity.last_activity_at_ms).toISOString()}>{new Date(activity.last_activity_at_ms).toLocaleString('pt-BR')}</time> : 'Indisponível'}</dd></div>
      {activity?.deadline_at_ms !== null && activity?.deadline_at_ms !== undefined && remaining !== null && <div><dt>Prazo restante</dt><dd>{remaining === 0 ? 'Prazo atingido' : formatStageDuration(remaining)}</dd></div>}
    </dl>
    {activity?.availability === 'unavailable' && <p className="muted">{activity.reason ?? 'Sem observação suficiente para determinar a duração.'}</p>}
  </section>;
}
