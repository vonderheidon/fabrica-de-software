import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HttpAttemptDetail, HttpAttemptPage, HttpQuestion } from '#contracts';
import { requestJson } from '../../api/http.js';
import { QuestionDecisionCard } from './QuestionDecisionCard.js';
import './decision-notification.css';

type PendingDecision = { attemptId: string; questionId: string; issue: string };

export function openPendingDecision(attemptId: string, questionId: string): void {
  window.dispatchEvent(new CustomEvent('factory-open-decision', { detail: { attemptId, questionId } }));
}

export function DecisionNotification() {
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [questionState, setQuestionState] = useState<HttpQuestion['state']>('pending');
  const current = useRef(pending);
  current.current = pending;
  const modal = useRef<HTMLDialogElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    let reading = false;
    const controller = new AbortController();
    const read = async () => {
      if (reading) return;
      reading = true;
      try {
        const page = await requestJson<HttpAttemptPage>('/api/v1/attempts?result=active&limit=100', { signal: controller.signal });
        const candidate = page.items.find(item => item.suspension === 'HUMAN_DECISION');
        if (!candidate) return;
        const attempt = await requestJson<HttpAttemptDetail>(`/api/v1/attempts/${encodeURIComponent(candidate.id)}`, { signal: controller.signal });
        if (!active || !attempt.pending_question_id || attempt.result !== null) return;
        if (current.current?.questionId === attempt.pending_question_id) return;
        const next = { attemptId: attempt.id, questionId: attempt.pending_question_id,
          issue: candidate.issue_number ? `Issue #${candidate.issue_number}` : 'Tentativa em andamento' };
        current.current = next;
        setPending(next);
        setQuestionState('pending');
        setExpanded(true);
      } catch {
        // A failed observation cannot dismiss a decision or authorize another response.
      } finally { reading = false; }
    };
    const open = (event: Event) => {
      const target = (event as CustomEvent<{ attemptId: string; questionId: string }>).detail;
      if (target?.questionId === current.current?.questionId && target.attemptId === current.current.attemptId) setExpanded(true);
      else void read();
    };
    void read();
    const timer = window.setInterval(() => void read(), 5_000);
    window.addEventListener('factory-controller-event', read);
    window.addEventListener('factory-controller-resync', read);
    window.addEventListener('factory-open-decision', open);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('factory-controller-event', read);
      window.removeEventListener('factory-controller-resync', read);
      window.removeEventListener('factory-open-decision', open);
    };
  }, []);

  useEffect(() => {
    const dialog = modal.current;
    if (!dialog) return;
    if (expanded && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!expanded && dialog.open) {
      dialog.close();
      if (fab.current) fab.current.focus();
      else returnFocus.current?.focus();
    }
  }, [expanded, pending?.questionId]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  if (!pending) return null;
  const resolved = ['delivered', 'expired', 'cancelled'].includes(questionState);
  return createPortal(<>
    {!resolved && <div className="decision-announcement" role="status">{questionState === 'pending' ? 'Uma tentativa aguarda sua decisão.' : 'Resposta em acompanhamento.'} {pending.issue}.</div>}
    {!expanded && !resolved && <button ref={fab} type="button" className="decision-fab" aria-label={`Abrir decisão da ${pending.issue}`} aria-haspopup="dialog" onClick={() => setExpanded(true)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M12 7v5m0 2v1" /></svg>
      <span>{questionState === 'pending' ? 'Decisão pendente' : 'Acompanhar resposta'}<small>{pending.issue}</small></span>
      <span className="decision-fab-dot" aria-hidden="true" />
    </button>}
    <dialog ref={modal} className="decision-modal" aria-labelledby="pending-decision-title" onCancel={event => { event.preventDefault(); setExpanded(false); }}>
      <header className="decision-modal-header"><div><span className="eyebrow">{pending.issue} · {questionState === 'pending' ? 'Sua atenção' : 'Acompanhamento'}</span><h2 id="pending-decision-title">{questionState === 'pending' ? 'O agente precisa da sua decisão' : 'Estado da decisão'}</h2></div>
        <button type="button" className="decision-minimize" aria-label="Minimizar decisão" title="Minimizar decisão" onClick={() => setExpanded(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 17h14" /></svg></button>
      </header>
      <div className="decision-modal-body"><QuestionDecisionCard key={`${pending.attemptId}:${pending.questionId}`} attemptId={pending.attemptId} summary={{ id: pending.questionId, state: 'pending' }} onStateChange={setQuestionState} /></div>
    </dialog>
  </>, document.body);
}
