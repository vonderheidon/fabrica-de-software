import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { ControllerEvent, EventQuery, type EventPage } from '#contracts';
import { readSettings } from './settings.js';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';
import { readProject } from './configuration-reads.js';
import { readAttempt } from './attempts.js';

interface EventRow {
  seq: number; entity_type: string; entity_id: string; operation_id: string;
  event_type: string; entity_revision: number; occurred_at_ms: number;
  project_id: string | null; attempt_id: string | null;
  project_name: string | null; issue_number: number | null; issue_title: string | null; attempt_created_at_ms: number | null;
  event_round: number | null; event_role: 'implementer' | 'reviewer' | null;
}
export function readEvents(db: Database.Database, query: EventQuery, through?: string, order: 'asc' | 'desc' = 'asc', includeTechnical = true): EventPage {
  if (!Value.Check(EventQuery, query)) throw new OperationError(400, 'CURSOR_INVALID', 'Event query is invalid.');
  const cursor = Number(query.cursor ?? '0');
  if (!Number.isSafeInteger(cursor)) throw new OperationError(400, 'CURSOR_INVALID', 'Event cursor is invalid.');
  try {
    return db.transaction(() => {
      const settings = readSettings(db);
      if (query.projectId) readProject(db, query.projectId);
      if (query.attemptId) {
        const attempt = readAttempt(db, query.attemptId);
        if (query.projectId && attempt.projectId !== query.projectId) throw new OperationError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found in this project.');
      }
      const scope = ` FROM events e JOIN operation_requests o ON o.operation_id = e.operation_id
        LEFT JOIN attempts a ON a.id=e.attempt_id
        LEFT JOIN project_creations c ON e.entity_type='creation' AND c.id=e.entity_id
        LEFT JOIN projects p ON p.id=coalesce(e.project_id,a.project_id,c.project_id)
        WHERE o.installation_id = ? AND o.account_id IS ?`;
      const current = db.prepare<[string, string | null], { seq: number }>(`SELECT coalesce(max(e.seq), 0) AS seq${scope}`).get(settings.installation_id, settings.account_id)?.seq ?? 0;
      if (cursor > current || (cursor > 0 && !db.prepare(`SELECT e.seq${scope} AND e.seq = ?`).get(settings.installation_id, settings.account_id, cursor))) {
        throw new OperationError(409, 'EVENT_RESYNC_REQUIRED', 'Reload the current snapshot before reconnecting.');
      }
      const ceiling = through === undefined ? current : Number(through);
      if (!Number.isSafeInteger(ceiling) || ceiling < cursor || ceiling > current ||
        (ceiling > 0 && !db.prepare(`SELECT e.seq${scope} AND e.seq=?`).get(settings.installation_id, settings.account_id, ceiling))) {
        throw new OperationError(409, 'EVENT_RESYNC_REQUIRED', 'The event snapshot is no longer available.');
      }
      const limit = Number(query.limit ?? '25');
      const rows = db.prepare(`SELECT e.seq,e.entity_type,e.entity_id,e.operation_id,e.event_type,e.entity_revision,e.occurred_at_ms,
        coalesce(e.project_id,a.project_id,c.project_id) AS project_id,e.attempt_id,coalesce(p.name,json_extract(c.plan_json,'$.input.name')) AS project_name,
        json_extract(a.capture_json,'$.issue.number') AS issue_number,json_extract(a.capture_json,'$.issue.title') AS issue_title,
        a.created_at_ms AS attempt_created_at_ms,e.context_round AS event_round,e.context_role AS event_role${scope}
        ${includeTechnical ? '' : "AND e.event_type NOT IN ('cleanup-updated','attempt.authority-observed','effect.intended','effect.sent','effect.stage-superseded')"}
        AND ${order === 'desc' ? '(? = 0 OR e.seq < ?)' : 'e.seq > ?'} AND e.seq <= ? AND (? IS NULL OR e.operation_id = ?)
        AND (? IS NULL OR coalesce(e.project_id,a.project_id,c.project_id) = ?) AND (? IS NULL OR e.attempt_id = ?) ORDER BY e.seq ${order === 'desc' ? 'DESC' : 'ASC'} LIMIT ?`)
        .all(settings.installation_id, settings.account_id, ...(order === 'desc' ? [cursor, cursor] : [cursor]), ceiling, query.operationId ?? null, query.operationId ?? null,
          query.projectId ?? null, query.projectId ?? null, query.attemptId ?? null, query.attemptId ?? null, limit + 1) as EventRow[];
      const items = rows.slice(0, limit).map((row) => {
        const event = {
          seq: String(row.seq), entityType: row.entity_type, entityId: row.entity_id, operationId: row.operation_id,
          eventType: row.event_type, entityRevision: row.entity_revision, occurredAtMs: row.occurred_at_ms, facts: {},
          ...(row.project_id ? { projectId: row.project_id } : {}), ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
          context: {
            ...(row.project_name ? { projectName: row.project_name } : {}),
            ...(row.issue_number ? { issueNumber: row.issue_number } : {}), ...(row.issue_title ? { issueTitle: row.issue_title } : {}),
            ...(row.attempt_created_at_ms !== null ? { attemptCreatedAtMs: row.attempt_created_at_ms } : {}),
            ...(row.event_round !== null ? { round: row.event_round } : {}), ...(row.event_role ? { role: row.event_role } : {}),
          },
        };
        if (!Value.Check(ControllerEvent, event)) throw new StorageError('OPERATION_DATA_INVALID');
        return event;
      });
      const hasMore = rows.length > limit;
      return { items, next_cursor: hasMore ? items.at(-1)?.seq ?? null : null, has_more: hasMore, event_cursor: String(ceiling) };
    })();
  } catch (error) {
    if (error instanceof OperationError || error instanceof StorageError) throw error;
    throw new StorageError('OPERATION_DATA_INVALID', { cause: error });
  }
}
