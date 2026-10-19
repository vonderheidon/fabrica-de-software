import { useEffect, useRef, useState } from 'react';
import type { NativeSelectionRequest, NativeSelectionResult } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';

export type NativeSelectionKind = NativeSelectionRequest['kind'];

export type NativeSelectionState =
  | { status: 'idle' }
  | { status: 'selecting'; kind: NativeSelectionKind }
  | { status: 'selected'; kind: NativeSelectionKind; path: string; observedAtMs: number }
  | { status: 'cancelled'; kind: NativeSelectionKind }
  | { status: 'concurrent'; kind: NativeSelectionKind; message: string }
  | { status: 'expired'; kind: NativeSelectionKind; closeConfirmed: false }
  | { status: 'unavailable'; kind: NativeSelectionKind; diagnostic: string; closeConfirmed: boolean };

export type NativeSelectionController = {
  state: NativeSelectionState;
  candidates: Readonly<Record<NativeSelectionKind, string | null>>;
  select: (kind: NativeSelectionKind) => Promise<void>;
  clearCandidate: (kind: NativeSelectionKind) => void;
};

const initialCandidates: Record<NativeSelectionKind, string | null> = {
  projects_root: null,
  gh_executable: null,
};

export function nativeSelectionMessage(state: NativeSelectionState): string | null {
  switch (state.status) {
    case 'idle': return null;
    case 'selecting': return state.kind === 'projects_root' ? 'Aguardando a seleção da pasta…' : 'Aguardando a seleção do executável…';
    case 'selected': return state.kind === 'projects_root' ? 'Pasta selecionada como candidata. Ela ainda não foi salva.' : 'Executável selecionado como candidato. Ele ainda não foi validado nem salvo.';
    case 'cancelled': return 'Seleção cancelada. O valor salvo e a edição atual foram mantidos.';
    case 'concurrent': return state.message;
    case 'expired': return 'A seleção excedeu 125 segundos. O fechamento da janela não foi confirmado; a fábrica não a abrirá novamente sem uma nova ação sua.';
    case 'unavailable': {
      const explanation = state.diagnostic === 'PROJECTS_ROOT_UNAVAILABLE'
        ? 'A pasta não pôde ser confirmada para leitura e gravação. Escolha outra pasta e salve novamente.'
        : state.diagnostic === 'GITHUB_EXECUTABLE_UNAVAILABLE'
          ? 'O executável selecionado não pôde ser confirmado. Localize o gh.exe correto e tente novamente.'
          : state.diagnostic === 'NATIVE_SELECTION_UNAVAILABLE'
            ? 'Este host não oferece a seleção nativa. Inicie a aplicação pelo host configurado para essa capacidade.'
            : state.diagnostic === 'NATIVE_SELECTION_TIMEOUT'
              ? 'A janela de seleção excedeu 125 segundos e foi encerrada. Inicie outra seleção somente por ação explícita.'
            : 'O host não conseguiu concluir a seleção. Confira o host e tente novamente quando a janela anterior tiver encerrado.';
      return state.closeConfirmed
        ? explanation
        : `${explanation} O fechamento da janela permanece incerto; a fábrica não a abrirá novamente sem uma nova ação sua.`;
    }
  }
  return null;
}

export function useNativeSelection(): NativeSelectionController {
  const [state, setState] = useState<NativeSelectionState>({ status: 'idle' });
  const [candidates, setCandidates] = useState<Record<NativeSelectionKind, string | null>>(initialCandidates);
  const inFlightRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, []);

  async function select(kind: NativeSelectionKind): Promise<void> {
    if (inFlightRef.current) {
      setState({ status: 'concurrent', kind, message: 'Outra seleção nativa está em andamento. Aguarde a janela atual encerrar e tente novamente manualmente.' });
      return;
    }

    inFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setState({ status: 'selecting', kind });

    try {
      const { data } = await requestJsonWithMetadata<NativeSelectionResult>('/api/v1/settings/selections', {
        method: 'POST', body: JSON.stringify({ kind }), signal: controller.signal,
      });
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (data.kind !== kind) {
        setState({ status: 'unavailable', kind, diagnostic: 'NATIVE_SELECTION_RESPONSE_MISMATCH', closeConfirmed: true });
        return;
      }
      if (data.state === 'selected') {
        setCandidates((current) => ({ ...current, [kind]: data.path }));
        setState({ status: 'selected', kind, path: data.path, observedAtMs: data.observed_at_ms });
      } else if (data.state === 'cancelled') {
        setState({ status: 'cancelled', kind });
      } else if (data.diagnostic === 'NATIVE_SELECTION_TIMEOUT' || data.diagnostic === 'NATIVE_SELECTION_CLOSE_UNCONFIRMED') {
        setState({ status: 'unavailable', kind, diagnostic: data.diagnostic, closeConfirmed: data.diagnostic !== 'NATIVE_SELECTION_CLOSE_UNCONFIRMED' });
      } else {
        setState({ status: 'unavailable', kind, diagnostic: data.diagnostic, closeConfirmed: true });
      }
    } catch (error: unknown) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (error instanceof DOMException && error.name === 'AbortError') {
        setState({ status: 'expired', kind, closeConfirmed: false });
      } else if (error instanceof HttpError && error.status === 409) {
        setState({ status: 'concurrent', kind, message: 'Outra janela de seleção continua ativa neste controlador. Aguarde o encerramento e tente novamente manualmente.' });
      } else {
        setState({ status: 'unavailable', kind, diagnostic: error instanceof HttpError ? error.code : 'NATIVE_SELECTION_FAILED', closeConfirmed: false });
      }
    } finally {
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false;
        activeControllerRef.current = null;
      }
    }
  }

  function clearCandidate(kind: NativeSelectionKind): void {
    setCandidates((current) => ({ ...current, [kind]: null }));
    setState((current) => current.status === 'selected' && current.kind === kind ? { status: 'idle' } : current);
  }

  return { state, candidates, select, clearCandidate };
}
