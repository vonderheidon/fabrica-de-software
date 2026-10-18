import { answerQuestionBody } from './execution-requests.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OperationAccepted, OperationView, HttpQuestion as Question } from '#contracts';
import { HttpError, requestJsonWithMetadata, requestJson } from '../../api/http.js';

type DecisionState = {
  question: Question | null;
  etag: string | null;
  operation: OperationView | null;
  loading: boolean;
  submitting: boolean;
  submissionLocked: boolean;
  error: string | null;
  notice: string | null;
};

const messageFor = (reason: unknown): string => reason instanceof HttpError ? reason.message : 'Não foi possível consultar a decisão.';

export function useDecision(attemptId: string, questionId: string): DecisionState & {
  draft: string;
  setDraft: (value: string) => void;
  scopeChoice: 'keep_captured' | 'adopt_new' | null;
  setScopeChoice: (value: 'keep_captured' | 'adopt_new') => void;
  submit: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<DecisionState>({ question: null, etag: null, operation: null, loading: true, submitting: false, submissionLocked: false, error: null, notice: null });
  const [draft, setDraft] = useState('');
  const [scopeChoice, setScopeChoice] = useState<'keep_captured' | 'adopt_new' | null>(null);
  const operationId = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await requestJsonWithMetadata<Question>(`/api/v1/attempts/${encodeURIComponent(attemptId)}/questions/${encodeURIComponent(questionId)}`);
      setState((current) => ({ ...current, question: result.data, etag: result.etag, loading: false, error: null,
        submissionLocked: current.submissionLocked || result.data.answer_operation_id !== null }));
      const currentOperationId = result.data.answer_operation_id ?? operationId.current;
      if (currentOperationId) {
        operationId.current = currentOperationId;
        try {
          const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(currentOperationId)}`);
          if (operation.operation_id === currentOperationId) setState((current) => ({ ...current, operation, notice: null }));
        } catch (reason: unknown) {
          setState((current) => ({ ...current, operation: null, notice: reason instanceof HttpError && reason.status === 404 ? 'A resposta ainda não tem recibo de operação consultável.' : 'Não foi possível consultar o recibo da operação. A resposta não será reenviada.' }));
        }
      }
    } catch (reason: unknown) {
      setState((current) => ({ ...current, loading: false, error: messageFor(reason) }));
    }
  }, [attemptId, questionId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      const current = stateRef.current.question;
      if (current && current.state !== 'delivered' && current.state !== 'expired' && current.state !== 'cancelled') void refresh();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const submit = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.question || current.question.state !== 'pending' || !current.etag || current.submitting || current.submissionLocked || !draft.trim()) return;
    if (current.question.scope_change && scopeChoice !== 'keep_captured') return;
    const id = operationId.current ?? crypto.randomUUID();
    operationId.current = id;
    setState((value) => ({ ...value, submitting: true, submissionLocked: true, error: null, notice: null }));
    try {
      const headers = new Headers({ 'Idempotency-Key': id, 'If-Match': current.etag });
      const result = await requestJsonWithMetadata<OperationAccepted>(
        `/api/v1/attempts/${encodeURIComponent(attemptId)}/questions/${encodeURIComponent(questionId)}/answer`,
        { method: 'POST', headers, body: JSON.stringify(answerQuestionBody(draft, current.question.scope_change ? scopeChoice ?? undefined : undefined)) },
      );
      if (result.data.operation_id !== id) throw new Error('O recibo retornou uma operação diferente.');
      setState((value) => ({ ...value, operation: null, notice: 'Resposta gravada. Aguardando confirmação de entrega na mesma passagem.' }));
      await refresh();
    } catch (reason: unknown) {
      if (reason instanceof HttpError && reason.status < 500) operationId.current = null;
      const message = reason instanceof HttpError && reason.code === 'NEW_ATTEMPT_REQUIRED'
        ? 'Para adotar os critérios atuais, atualize a issue e prepare uma nova tentativa.'
        : reason instanceof HttpError && reason.status === 412
          ? 'A pergunta mudou enquanto você respondia. Seu texto foi preservado; consulte o estado atual antes de continuar.'
          : reason instanceof HttpError && reason.status === 409
            ? reason.message
            : reason instanceof Error && !(reason instanceof HttpError)
              ? reason.message
              : 'Não foi possível confirmar o envio. Consulte o recibo; a resposta não será reenviada automaticamente.';
      setState((value) => ({ ...value, error: message, notice: 'Seu texto permanece neste diálogo.',
        submissionLocked: !(reason instanceof HttpError && reason.status < 500) }));
      if (!(reason instanceof HttpError && reason.status < 500)) await refresh();
    } finally {
      setState((value) => ({ ...value, submitting: false }));
    }
  }, [attemptId, questionId, draft, scopeChoice, refresh]);

  return { ...state, draft, setDraft, scopeChoice, setScopeChoice, submit, refresh };
}
