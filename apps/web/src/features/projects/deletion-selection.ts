// Always inspect the current navigation, never the selection captured by a request.
export function selectionAfterProjectDeletion(params: URLSearchParams, projectId: string): URLSearchParams | null {
  if (params.get('projectId') !== projectId) return null;
  const next = new URLSearchParams(params);
  for (const key of ['projectId', 'attemptId', 'deliveryId', 'roundId', 'questionId', 'creationId', 'operationId', 'dialog']) next.delete(key);
  return next;
}
