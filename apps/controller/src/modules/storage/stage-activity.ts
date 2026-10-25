import type Database from 'better-sqlite3';
import type { StageActivity } from '#contracts';
import { readAttempt } from './attempts.js';

export function readStageActivity(db: Database.Database, id: string, now = Date.now()): StageActivity {
  const attempt = readAttempt(db, id);
  const stage = attempt.result !== null ? 'finished' : attempt.suspension === 'TRACKING_LOST' ? 'tracking_lost'
    : attempt.suspension !== null ? 'waiting_decision' : attempt.phase;
  const interval = db.prepare<[string], { stage: string; started_at_ms: number; ended_at_ms: number | null; deadline_at_ms: number | null }>(
    'SELECT stage,started_at_ms,ended_at_ms,deadline_at_ms FROM attempt_stage_intervals WHERE attempt_id=? ORDER BY started_at_ms DESC,source_event_seq DESC LIMIT 1',
  ).get(id);
  const last = db.prepare<[string], { time: number | null }>('SELECT max(last_activity_at_ms) AS time FROM attempt_stage_intervals WHERE attempt_id=?').get(id)!.time;
  const known = Boolean(interval && (stage === 'finished' ? interval.ended_at_ms !== null : interval.ended_at_ms === null && interval.stage === stage));
  const started = known ? stage === 'finished' ? interval!.ended_at_ms : interval!.started_at_ms : null;
  const deadline = known && stage !== 'finished' && stage !== 'tracking_lost' ? interval!.deadline_at_ms : null;
  return {
    stage, started_at_ms: started, elapsed_ms: started === null ? null : Math.max(0, (stage === 'finished' ? started : now) - started),
    last_activity_at_ms: last, observed_at_ms: now, deadline_at_ms: deadline,
    remaining_ms: deadline === null ? null : Math.max(0, deadline - now),
    tracking_state: stage === 'tracking_lost' ? 'lost' : attempt.tracking,
    availability: known ? 'known' : 'unavailable',
    reason: known ? stage === 'tracking_lost' ? 'Acompanhamento perdido. Inatividade não comprova parada física.' : null : 'Eventos insuficientes para determinar a duração desta etapa.',
  };
}
