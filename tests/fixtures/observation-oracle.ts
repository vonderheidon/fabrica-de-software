import type { HttpQueueObservation } from '#contracts';

// Opaque tokens and wall-clock values differ across independent databases.
export const observationNormalizations = {
  observation_id: 'opaque observation identity; presence checked by the journey',
  summary_hash: 'opaque digest; stability and invalidation checked by the journey',
  next_cursor: 'opaque continuation; all pages traversed and boundaries compared',
  event_cursor: 'database-local sequence; decimal shape checked by the journey',
  observed_at_ms: 'clock; checked for finite positive value',
  next_poll_at_ms: 'clock; checked relative to observation time',
} as const;

export function observationOracle(value: HttpQueueObservation, projectIds: readonly string[]): unknown {
  function normalize(input: unknown, key = ''): unknown {
    if (input === null) return null;
    if (Array.isArray(input)) return input.map(item => normalize(item));
    if (typeof input === 'object') return Object.fromEntries(Object.entries(input)
      .map(([field, item]) => [field, normalize(item, field)]));
    if (key in observationNormalizations) return `<${key}:${typeof input}>`;
    if (typeof input === 'string') {
      const project = projectIds.indexOf(input);
      if (project >= 0) return `project-${project}`;
    }
    return input;
  }
  return normalize(value);
}
