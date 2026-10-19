import type { ReactNode } from 'react';
import { diagnosticCopyFor, operatorFactLabel, operatorFactValue, operatorState } from './operator-language.js';

type SupportProps = {
  code?: string | null | undefined;
  state?: string | null | undefined;
  requestId?: string | null | undefined;
  operationId?: string | null | undefined;
  etag?: string | null | undefined;
  revision?: string | number | null | undefined;
  eventCursor?: string | null | undefined;
  entityType?: string | null | undefined;
  entityId?: string | null | undefined;
  affectedRequirements?: readonly string[] | undefined;
  facts?: Readonly<Record<string, unknown>> | null | undefined;
  technicalNotes?: readonly { label: string; value: string | number | null | undefined }[] | undefined;
  children?: ReactNode | undefined;
};

export function TechnicalDetails({
  code, state, requestId, operationId, etag, revision, eventCursor, entityType, entityId,
  affectedRequirements, facts, technicalNotes, children,
}: SupportProps) {
  const receipt = operationId !== null && operationId !== undefined
    && revision !== null && revision !== undefined
    && eventCursor !== null && eventCursor !== undefined;
  const entries = Object.entries(facts ?? {}).filter(([key, value]) =>
    value !== undefined && !/(token|secret|password|credential|transcript|request_body)/i.test(key),
  );
  const notes = (technicalNotes ?? []).filter((item) => item.value !== null && item.value !== undefined);
  const hasDetails = Boolean(code || state || requestId || operationId || etag || revision !== null && revision !== undefined || eventCursor || entityType || entityId || affectedRequirements?.length || entries.length || notes.length || children);
  if (!hasDetails) return null;

  return <details className="technical-support">
    <summary>Suporte técnico</summary>
    <dl>
      {code && <div><dt>Código</dt><dd>{code}</dd></div>}
      {state && <div><dt>Estado recebido</dt><dd>{state}</dd></div>}
      {requestId && <div><dt>Solicitação</dt><dd>{requestId}</dd></div>}
      {operationId && <div><dt>Operação</dt><dd>{operationId}</dd></div>}
      {etag && <div><dt>ETag</dt><dd>{etag}</dd></div>}
      {revision !== null && revision !== undefined && <div><dt>{receipt ? 'Revisão do recibo' : 'Revisão'}</dt><dd>{revision}</dd></div>}
      {eventCursor && <div><dt>{receipt ? 'Cursor do recibo' : 'Cursor de eventos'}</dt><dd className={receipt ? 'mono' : undefined}>{eventCursor}</dd></div>}
      {(entityType || entityId) && <div><dt>Entidade</dt><dd>{[entityType, entityId].filter(Boolean).join(' · ')}</dd></div>}
      {affectedRequirements && affectedRequirements.length > 0 && <div><dt>Requisitos associados</dt><dd>{affectedRequirements.join(', ')}</dd></div>}
      {notes.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{String(item.value)}</dd></div>)}
      {entries.map(([key, value]) => <div key={key}><dt>{operatorFactLabel(key)}</dt><dd>{operatorFactValue(value)}</dd></div>)}
    </dl>
    {children}
    <a href="#principal/registros">Abrir Registros e diagnóstico</a>
  </details>;
}

export function UnknownState({ value, className = 'muted' }: { value: string; className?: string }) {
  const state = operatorState(value);
  if (state.known) return null;
  return <span className={className}>O controlador retornou um estado que esta tela não reconhece. <a href="#principal/registros">Abrir Registros e diagnóstico</a>.</span>;
}

export function OperatorState({ value }: { value: string | null | undefined }) {
  const state = operatorState(value);
  return <>{state.label}{!state.known && value && <><UnknownState value={value} /><TechnicalDetails state={value} /></>}</>;
}

export function OperatorDiagnosticCard({
  code, state, cause, recovery, facts, affectedRequirements, checkLabel, observedAtMs, previous = false, projectId,
}: {
  code: string;
  state: string;
  cause?: string | null;
  recovery?: string | null;
  facts?: Readonly<Record<string, unknown>> | null;
  affectedRequirements?: readonly string[];
  checkLabel?: string;
  observedAtMs?: number;
  previous?: boolean;
  projectId?: string | null;
}) {
  const copy = diagnosticCopyFor(code, state, cause, recovery);
  const status = operatorState(state);
  return <article className={`diagnostic-record${previous ? ' is-previous' : ''}`}>
    <div className="line"><b>{copy.title}</b><span className={`pill ${state === 'passed' ? '' : 'warn'}`}>{status.label}{previous ? ' · anterior' : ''}</span></div>
    <p>{copy.cause}</p>
    <p className="muted"><strong>Próxima ação:</strong> {copy.nextAction}</p>
    {['PROJECT_REQUIRED', 'REMOTE_UNCONFIRMED', 'PROFILES_REQUIRED', 'PROFILE_REQUIRED', 'PROJECT_NOT_READY', 'KANBAN_DIVERGENCE'].includes(code) && <a className="button-link" href={projectId ? `#principal/configuracao?projectId=${encodeURIComponent(projectId)}` : '#principal/projetos'}>{projectId ? 'Configurar este projeto' : 'Escolher projeto para configurar'}</a>}
    {!status.known && <UnknownState value={state} />}
    <TechnicalDetails
      code={code}
      state={state}
      facts={facts}
      affectedRequirements={affectedRequirements}
      technicalNotes={[
        ...(checkLabel ? [{ label: 'Checagem', value: checkLabel }] : []),
        ...(observedAtMs !== undefined ? [{ label: 'Observado em', value: new Date(observedAtMs).toLocaleString('pt-BR') }] : []),
        ...(cause ? [{ label: 'Descrição recebida', value: cause }] : []),
        ...(recovery ? [{ label: 'Orientação recebida', value: recovery }] : []),
      ]}
    />
  </article>;
}
