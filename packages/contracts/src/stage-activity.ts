import { Type, type Static } from '@sinclair/typebox';

const time = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const nullableTime = Type.Union([time, Type.Null()]);
export const StageActivity = Type.Object({
  stage: Type.Union(['preparing', 'implementing', 'verifying', 'reviewing', 'publishing', 'waiting_decision', 'tracking_lost', 'finished'].map(value => Type.Literal(value))),
  started_at_ms: nullableTime, elapsed_ms: nullableTime, last_activity_at_ms: nullableTime,
  observed_at_ms: time, deadline_at_ms: nullableTime, remaining_ms: nullableTime,
  tracking_state: Type.Union(['pending', 'tracked', 'lost'].map(value => Type.Literal(value))),
  availability: Type.Union([Type.Literal('known'), Type.Literal('unavailable')]),
  reason: Type.Union([Type.String({ minLength: 1, maxLength: 2048 }), Type.Null()]),
}, { additionalProperties: false });
export type StageActivity = Static<typeof StageActivity>;
