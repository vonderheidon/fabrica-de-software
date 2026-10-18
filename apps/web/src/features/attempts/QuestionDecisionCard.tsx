import { useEffect, useState } from 'react';
import type { HttpQuestion as Question } from '#contracts';
import { useDecision } from './useDecision.js';

type QuestionSummary = Pick<Question, 'id' | 'state'>;
type Props = { attemptId: string; summary: QuestionSummary };

const stateLabels: Record<QuestionSummary["state"], string> = {
  pending: 'Pendente', answer_recorded: 'Resposta gravada', sending: 'Enviando', delivered: 'Entregue',
  delivery_unknown: 'Entrega incerta', expired: 'Expirada', cancelled: 'Cancelada',
};
const operationStateLabels: Record<NonNullable<ReturnType<typeof useDecision>['operation']>["state"], string> = {
  accepted: 'Aceita', running: 'Em processamento', succeeded: 'Resposta registrada', failed: 'Falhou', unknown: 'Incerta',
};

function formatDuration(value: number): string {
  if (value < 60_000) return `${value} ms`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.floor((value % 60_000) / 1_000);
  return `${minutes} min ${seconds} s`;
}

export function QuestionDecisionCard({ attemptId, summary }: Props) {
  const decision = useDecision(attemptId, summary.id);
  const [now, setNow] = useState(Date.now());
  const question = decision.question;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  if (decision.loading && !question) return <article className="attempt-record" aria-busy="true"><h4>Pergunta</h4><p className="muted" role="status">Consultando estado e recibo…</p></article>;
  if (!question) return <article className="attempt-record"><h4>Pergunta</h4><p className="error" role="alert">{decision.error ?? 'A pergunta não está disponível.'}</p><button type="button" onClick={() => void decision.refresh()}>Consultar novamente</button></article>;

  const scopeChange = question.scope_change;
  const canAnswer = question.state === 'pending' && decision.etag !== null && decision.draft.trim().length > 0 &&
    (!scopeChange || decision.scopeChoice === 'keep_captured') && !decision.submitting && !decision.submissionLocked;

  return <article className="attempt-record decision-card" aria-labelledby={`question-title-${question.id}`}>
    <div className="line decision-card-heading">
      <h4 id={`question-title-${question.id}`}>{scopeChange ? 'Decisão sobre mudança de critérios' : 'Decisão da passagem'}</h4>
      <span className={`pill ${question.state === 'delivered' ? '' : question.state === 'pending' ? 'warn' : 'neutral'}`} aria-label={`Estado da pergunta: ${stateLabels[question.state]}`}>{stateLabels[question.state]}</span>
    </div>
    <p className="muted decision-binding">Pergunta <span className="mono">{question.id}</span> · passagem <span className="mono">{question.passage_id}</span></p>
    <h5>{question.question.decision}</h5>
    <p className="decision-context">{question.question.context}</p>
    <div className="decision-alternatives"><b>Alternativas apresentadas</b><ol>{question.question.alternatives.map((alternative, index) => <li key={`${index}:${alternative}`}>{alternative}</li>)}</ol></div>

    {scopeChange && <section className="decision-scope" aria-labelledby={`scope-title-${question.id}`}>
      <h5 id={`scope-title-${question.id}`}>Mudança relevante nos critérios</h5>
      {scopeChange.reasons.length > 0 && <ul>{scopeChange.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      <div className="decision-criteria-compare">
        <div><b>Capturados · {scopeChange.captured_criteria.length}</b><ul>{scopeChange.captured_criteria.map((criterion) => <li key={criterion.id}><span className="mono">{criterion.id}</span> · {criterion.text}</li>)}</ul></div>
        <div><b>Atuais · {scopeChange.current_criteria.length}</b><ul>{scopeChange.current_criteria.map((criterion) => <li key={criterion.id}><span className="mono">{criterion.id}</span> · {criterion.text}</li>)}</ul></div>
      </div>
      <fieldset className="decision-scope-choice" disabled={question.state !== 'pending'}>
        <legend>Como deseja prosseguir?</legend>
        <label><input type="radio" name={`scope-${question.id}`} checked={decision.scopeChoice === 'keep_captured'} onChange={() => decision.setScopeChoice('keep_captured')} /> Manter os critérios capturados nesta tentativa</label>
        <label><input type="radio" name={`scope-${question.id}`} checked={decision.scopeChoice === 'adopt_new'} onChange={() => decision.setScopeChoice('adopt_new')} /> Adotar os critérios atuais</label>
      </fieldset>
      {decision.scopeChoice === 'keep_captured' && <p className="decision-guidance" role="status">A resposta seguirá com os IDs e textos capturados, sem alterar o escopo desta tentativa.</p>}
      {decision.scopeChoice === 'adopt_new' && <p className="notice decision-guidance" role="status">Para adotar os critérios atuais, atualize a issue e prepare outra tentativa. Esta captura não será substituída.</p>}
    </section>}

    {question.state === 'pending' ? <form className="decision-answer" onSubmit={(event) => { event.preventDefault(); void decision.submit(); }}>
      <label htmlFor={`answer-${question.id}`}>Sua resposta
        <textarea id={`answer-${question.id}`} value={decision.draft} onChange={(event) => decision.setDraft(event.currentTarget.value)} maxLength={8192} required aria-describedby={`answer-help-${question.id}`} />
      </label>
      <small id={`answer-help-${question.id}`}>A resposta será enviada à passagem original. O texto digitado fica neste diálogo enquanto ele estiver aberto.</small>
      <button type="submit" className="primary" disabled={!canAnswer}>{decision.submitting ? 'Gravando resposta…' : 'Enviar resposta à passagem'}</button>
    </form> : question.answer !== null ? <div className="decision-answer-recorded"><b>Resposta registrada</b><p>{question.answer}</p>
      {decision.draft && <div className="decision-preserved-draft"><b>Rascunho local preservado · não enviado</b><p>{decision.draft}</p></div>}
    </div> : <div className="decision-answer-recorded"><b>Resposta não enviada</b><p>O estado da pergunta mudou e impede o envio deste rascunho.</p>
      {decision.draft && <div className="decision-preserved-draft"><b>Rascunho local preservado · não enviado</b><p>{decision.draft}</p></div>}
    </div>}

    {decision.error && <p className="error" role="alert">{decision.error}</p>}
    {decision.notice && <p className="decision-notice" role="status">{decision.notice}</p>}
    <dl className="decision-timing">
      <div><dt>Pergunta criada</dt><dd>{new Date(question.raised_at_ms).toLocaleString('pt-BR')}</dd></div>
      <div><dt>Espera observada</dt><dd>{formatDuration(Math.max(0, (question.answered_at_ms ?? now) - question.raised_at_ms))}</dd></div>
      <div><dt>TTL configurado</dt><dd>{question.ttl.state === 'configured' ? formatDuration(question.ttl.value) : 'Não configurado'}</dd></div>
      <div><dt>Resposta gravada em</dt><dd>{question.answered_at_ms === null ? 'Ainda não' : new Date(question.answered_at_ms).toLocaleString('pt-BR')}</dd></div>
      <div><dt>Expiração</dt><dd>{question.expired_at_ms === null ? question.ttl.state === 'configured' ? new Date(question.raised_at_ms + question.ttl.value).toLocaleString('pt-BR') : 'Sem TTL configurado' : new Date(question.expired_at_ms).toLocaleString('pt-BR')}</dd></div>
    </dl>
    {decision.operation && <p className="decision-operation">Operação <span className="mono">{decision.operation.operation_id}</span> · {operationStateLabels[decision.operation.state]}</p>}
    {question.delivery_receipt && question.state === 'delivered' ? <p className="decision-receipt" role="status">Entrega confirmada na passagem {question.delivery_receipt.passage_id} em {new Date(question.delivery_receipt.received_at_ms).toLocaleString('pt-BR')}. A suspensão desta pergunta foi resolvida.</p>
      : question.state === 'expired' ? <p className="notice" role="status">A pergunta expirou. A passagem continua suspensa até a coordenação encerrar ou resolver esse estado.</p>
        : question.state === 'cancelled' ? <p className="notice" role="status">A pergunta foi cancelada; a passagem não é reaberta por este diálogo.</p>
          : question.state === 'delivery_unknown' ? <p className="notice" role="status">A resposta foi gravada, mas a entrega ainda não foi confirmada. Consultar o recibo não envia a resposta novamente.</p>
            : question.state === 'answer_recorded' || question.state === 'sending' ? <p className="muted" role="status">Resposta persistida; aguardando recibo de entrega da mesma passagem.</p> : null}
    <button type="button" className="decision-refresh" onClick={() => void decision.refresh()} disabled={decision.loading}>{decision.loading ? 'Consultando…' : 'Consultar estado e recibo'}</button>
  </article>;
}
