import { diagnosticCopyFor, operatorState } from './operator-language.js';

export function UnknownState({ value, className = 'muted' }: { value: string; className?: string }) {
  const state = operatorState(value);
  if (state.known) return null;
  return <span className={className}>Não foi possível interpretar este estado. Atualize os dados para consultar a situação atual.</span>;
}

export function OperatorState({ value }: { value: string | null | undefined }) {
  const state = operatorState(value);
  return <>{state.label}{!state.known && value && <UnknownState value={value} />}</>;
}

export function OperatorDiagnosticCard({
  code, state, cause, recovery, previous = false, projectId,
}: {
  code: string;
  state: string;
  cause?: string | null;
  recovery?: string | null;
  previous?: boolean;
  projectId?: string | null;
}) {
  const copy = diagnosticCopyFor(code, state, cause, recovery);
  const status = operatorState(state);
  return <article className={`diagnostic-record${previous ? ' is-previous' : ''}`}>
    <div className="line"><b>{copy.title}</b><span className={`pill ${state === 'passed' ? '' : 'warn'}`}>{status.label}{previous ? ' · anterior' : ''}</span></div>
    <p>{copy.cause}</p>
    <p className="muted"><strong>Próxima ação:</strong> {copy.nextAction}</p>
    {['PROJECT_REQUIRED', 'REMOTE_UNCONFIRMED', 'PROFILES_REQUIRED', 'PROFILE_REQUIRED', 'PROJECT_NOT_READY', 'PROJECT_QUEUE_BLOCKED', 'KANBAN_DIVERGENCE'].includes(code) && <a className="button-link" href={projectId ? `#principal/configuracao?projectId=${encodeURIComponent(projectId)}` : '#principal/projetos'}>{projectId ? 'Configurar este projeto' : 'Escolher projeto para configurar'}</a>}
    {code === 'GLOBAL_AUTOMATION_PAUSED' && <a className="button-link" href="#principal/fila">Abrir fila global</a>}
    {!status.known && <UnknownState value={state} />}
  </article>;
}
