import type { AttemptComparisonQuery, AttemptDetailQuery, AttemptListQuery, DeliveryDetailQuery } from '#contracts';
import type { Storage } from '../storage/index.js';

/** Read-only projections. Each storage call reads data and event cursor in one consistent snapshot. */
export function createQueries(storage: Storage) {
  return {
    listAttempts: (query: AttemptListQuery) => storage.listAttempts(query),
    getAttempt: (id: string, query: AttemptDetailQuery) => storage.getAttemptDetail(id,query),
    compareAttempts: (query: AttemptComparisonQuery) => storage.getAttemptComparison(query),
    getDelivery: (id: string, query: DeliveryDetailQuery) => storage.getDeliveryDetail(id,query),
    getOperation: (query: import('#contracts').OperationSummaryQuery) => storage.getOperationSummary(query),
  };
}
export type Queries = ReturnType<typeof createQueries>;
