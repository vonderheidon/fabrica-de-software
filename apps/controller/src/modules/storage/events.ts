import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { ControllerEvent, EventQuery, type EventPage } from '#contracts';
import { readSettings } from './settings.js';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';

interface EventRow {
  seq: number; entity_type: string; entity_id: string; operation_id: string;
  event_type: string; entity_revision: number; occurred_at_ms: number;
}
export function readEvents(db: Database.Database, query: EventQuery): EventPage {
  if (!Value.Check(EventQuery, query)) throw new OperationError(400, 'CURSOR_INVALID', 'Event query is invalid.');
  const cursor = Number(query.cursor ?? '0');
  if (!Number.isSafeInteger(cursor)) throw new OperationError(400, 'CURSOR_INVALID', 'Event cursor is invalid.');
  try {
    return db.transaction(() => {
      const settings = readSettings(db);
      const scope = ' FROM events e JOIN operation_requests o ON o.operation_id = e.operation_id WHERE o.installation_id = ? AND o.account_id IS ?';
      const current = db.prepare<[string, string | null], { seq: number }>(`SELECT coalesce(max(e.seq), 0) AS seq${scope}`).get(settings.installationId, settings.accountId)?.seq ?? 0;
      if (cursor > current || (cursor > 0 && !db.prepare(`SELECT e.seq${scope} AND e.seq = ?`).get(settings.installationId, settings.accountId, cursor))) {
        throw new OperationError(409, 'EVENT_RESYNC_REQUIRED', 'Reload the current snapshot before reconnecting.');
      }
      const limit = Number(query.limit ?? '25');
      const rows = db.prepare(`SELECT e.*${scope} AND e.seq > ? AND (? IS NULL OR e.operation_id = ?) ORDER BY e.seq LIMIT ?`)
        .all(settings.installationId, settings.accountId, cursor, query.operationId ?? null, query.operationId ?? null, limit + 1) as EventRow[];
      const items = rows.slice(0, limit).map((row) => {
        const event = {
          seq: String(row.seq), entityType: row.entity_type, entityId: row.entity_id, operationId: row.operation_id,
          eventType: row.event_type, entityRevision: row.entity_revision, occurredAtMs: row.occurred_at_ms, facts: {},
        };
        if (!Value.Check(ControllerEvent, event)) throw new StorageError('OPERATION_DATA_INVALID');
        return event;
      });
      const hasMore = rows.length > limit;
      return { items, nextCursor: hasMore ? items.at(-1)?.seq ?? null : null, hasMore, eventCursor: String(current) };
    })();
  } catch (error) {
    if (error instanceof OperationError || error instanceof StorageError) throw error;
    throw new StorageError('OPERATION_DATA_INVALID', { cause: error });
  }
}
