import { useEffect, useState } from 'react';
import type { HttpDeliveryDetail as DeliveryDetail } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';

type DeliveryState = { id: string | null; value: DeliveryDetail | null; status: 'loading' | 'ready' | 'not-captured' | 'error'; error: string | null; errorDetails: { code: string; requestId: string | null; facts: Readonly<Record<string, string | number | boolean | null>> | null; affectedRequirements: readonly string[] } | null };

export function useDelivery(deliveryId: string | null, reload: number): { delivery: DeliveryDetail | null; status: DeliveryState["status"]; error: string | null; errorDetails: DeliveryState['errorDetails'] } {
  const [state, setState] = useState<DeliveryState>({ id: null, value: null, status: 'loading', error: null, errorDetails: null });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!deliveryId) { setState({ id: null, value: null, status: 'not-captured', error: null, errorDetails: null }); return () => { active = false; controller.abort(); }; }
    setState((current) => ({ id: deliveryId, value: current.id === deliveryId ? current.value : null, status: 'loading', error: null, errorDetails: null }));
    void requestJsonWithMetadata<DeliveryDetail>(`/api/v1/deliveries/${encodeURIComponent(deliveryId)}`, { signal: controller.signal }).then(({ data }) => {
      if (!active) return;
      setState({ id: deliveryId, value: data, status: data.delivery.capture_state === 'captured' ? 'ready' : 'not-captured', error: data.delivery.diagnostic, errorDetails: data.delivery.diagnostic ? { code: data.delivery.diagnostic, requestId: null, facts: null, affectedRequirements: [] } : null });
    }).catch((reason: unknown) => {
      if (!active || (reason instanceof DOMException && reason.name === 'AbortError')) return;
      if (reason instanceof HttpError && reason.status === 404) setState({ id: deliveryId, value: null, status: 'not-captured', error: null, errorDetails: null });
      else setState({
        id: deliveryId,
        value: null,
        status: 'error',
        error: reason instanceof HttpError ? reason.message : 'Não foi possível consultar a versão selecionada.',
        errorDetails: reason instanceof HttpError ? { code: reason.code, requestId: reason.requestId, facts: reason.facts, affectedRequirements: reason.affectedRequirements } : null,
      });
    });
    return () => { active = false; controller.abort(); };
  }, [deliveryId, reload]);
  const current = state.id === deliveryId ? state : { id: deliveryId, value: null, status: 'loading' as const, error: null, errorDetails: null };
  return { delivery: current.value, status: current.status, error: current.error, errorDetails: current.errorDetails };
}
