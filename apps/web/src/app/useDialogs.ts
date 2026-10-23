import { useCallback, useEffect, useState } from 'react';
import { buildHash, dialogIds, type DialogId, type HashRoute } from './hash-route.js';

export function useDialogs(route: HashRoute) {
  const [dialog, setDialog] = useState<DialogId | null>(null);

  useEffect(() => {
    const requested = route.params.get('dialog');
    setDialog(requested && dialogIds.some((id) => id === requested) ? requested as DialogId : null);
  }, [route.params]);

  const open = useCallback((id: string, context?: { projectId?: string; previousAttemptId?: string; attemptId?: string; profileId?: string; issueId?: string }) => {
    if (!dialogIds.some((allowed) => allowed === id)) return;
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    params.set('dialog', id);
    if (id === 'detail') { params.delete('deliveryId'); params.delete('roundId'); }
    params.delete('issueId');
    if (id === 'preparation') {
      params.delete('attemptId');
      if (context?.issueId) params.set('issueId', context.issueId);
    }
    if (id === 'create') params.delete('creationId');
    if (id !== 'profile' || !context?.profileId) params.delete('profileId');
    if (context?.projectId) params.set('projectId', context.projectId);
    if (context?.profileId) params.set('profileId', context.profileId);
    if (context?.previousAttemptId) params.set('attemptId', context.previousAttemptId);
    if (context?.attemptId) params.set('attemptId', context.attemptId);
    window.location.hash = buildHash(route.tab, params);
  }, [route.tab]);

  const close = useCallback(() => {
    setDialog(null);
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    params.delete('dialog');
    params.delete('profileId');
    params.delete('creationId');
    params.delete('issueId');
    window.history.pushState(null, '', buildHash(route.tab, params));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [route.tab]);

  return { dialog, setDialog, open, close };
}
