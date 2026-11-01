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
  code, state, cause, recovery, previous = false, projectId, inProjectConfiguration = false,
}: {
  code: string;
  state: string;
  cause?: string | null;
  recovery?: string | null;
  previous?: boolean;
  projectId?: string | null;
  inProjectConfiguration?: boolean;
}) {
  const copy = diagnosticCopyFor(code, state, cause, recovery);
  const localAction = inProjectConfiguration ? ({
    PROJECT_REQUIRED: 'Confirme a origem acima e escolha o quadro e as opções de Status nos campos desta tela.',
    REMOTE_UNCONFIRMED: 'Confirme a origem GitHub nos campos desta tela antes de preparar uma issue.',
    PROJECT_NOT_READY: 'Confira a origem e o quadro nos campos desta tela e salve a configuração.',
    PROJECT_QUEUE_BLOCKED: 'Confira o quadro, o acesso e os perfis nesta tela. A consulta será repetida automaticamente.',
  } as Record<string, string>)[code] : undefined;
  const status = operatorState(state);
  return <article className={`diagnostic-record${previous ? ' is-previous' : ''}`}>
    <div className="line"><b>{copy.title}</b><span className={`pill ${state === 'passed' ? '' : 'warn'}`}>{status.label}{previous ? ' · anterior' : ''}</span></div>
    <p>{copy.cause}</p>
    <p className="muted"><strong>Próxima ação:</strong> {localAction ?? copy.nextAction}</p>
    {!inProjectConfiguration && ['PROJECT_REQUIRED', 'REMOTE_UNCONFIRMED', 'PROFILES_REQUIRED', 'PROFILE_REQUIRED', 'PROJECT_NOT_READY', 'PROJECT_QUEUE_BLOCKED', 'KANBAN_DIVERGENCE'].includes(code) && <a className="button-link" href={projectId ? `#principal/projetos?dialog=project-configuration&projectId=${encodeURIComponent(projectId)}` : '#principal/projetos'}>{projectId ? 'Configurar este projeto' : 'Escolher projeto para configurar'}</a>}
    {code === 'GLOBAL_AUTOMATION_PAUSED' && <a className="button-link" href="#principal/configuracao">Abrir Configuração</a>}
    {!status.known && <UnknownState value={state} />}
  </article>;
}
