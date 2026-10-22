import type { HttpEventListQuery, HttpQueueCommand, HttpQueueObservation, HttpQueueQuery, HttpCreateScaffold, HttpScaffoldPlanned } from '#contracts';

export function eventListQuery(filters: { projectId: string; attemptId: string; operationId: string }, cursor: string | null, includeTechnical = true): string {
  const query: HttpEventListQuery = { limit: '25',
    include_technical: String(includeTechnical) as 'true' | 'false',
    ...(filters.projectId ? { project_id: filters.projectId } : {}),
    ...(filters.attemptId ? { attempt_id: filters.attemptId } : {}),
    ...(filters.operationId ? { operation_id: filters.operationId } : {}),
    ...(cursor ? { cursor } : {}),
  };
  return new URLSearchParams(query).toString();
}

export function queueQuery(projectId: string | null, cursor: string | null): string {
  const query: HttpQueueQuery = { limit: '25', ...(projectId ? { project_id: projectId } : {}), ...(cursor ? { cursor } : {}) };
  return new URLSearchParams(query).toString();
}

export function enableQueueRequest(observation: HttpQueueObservation): HttpQueueCommand {
  return { enabled: true, scope: observation.scope,
    ...(observation.observation_id === null ? {} : { observation_id: observation.observation_id }),
    ...(observation.summary_hash === null ? {} : { authorized_summary_hash: observation.summary_hash }),
  };
}

export function createScaffoldRequest(planned: HttpScaffoldPlanned): HttpCreateScaffold {
  return { plan_hash: planned.plan_hash, plan: planned.plan, authorized: true };
}
