import { Type, type Static } from '@sinclair/typebox';
import { DeliveryMode, OperationId } from './base.js';
import { GitObjectId } from './deliveries.js';

const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const count = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const DeliverySummaryView = Type.Object({
  attempt_id: OperationId, delivery_id: OperationId, original_mode: DeliveryMode, authorized_mode: DeliveryMode,
  review_state: nullable(Type.Union(['pending','approved','rejected'].map(v => Type.Literal(v)))),
  outcome: Type.Union(['pending','blocked','icr_approved','partial','complete','unavailable'].map(v => Type.Literal(v))),
  content_identity: nullable(GitObjectId), approved_ref: nullable(text(4096)),
  code_location: nullable(text(32768)), local_repository: nullable(text(32768)), branch_ref: nullable(text(1024)),
  commit_sha: nullable(GitObjectId), pull_request_url: nullable(text(4096)), checkout_updated: Type.Literal(false),
  pending_effects: Type.Array(text(128), { maxItems: 10 }), limitations: Type.Array(text(2048), { maxItems: 10 }),
   criteria_satisfied: count, criteria_total: count,
  resolved_findings: count, details_url: text(512),
}, { additionalProperties: false });
export type DeliverySummaryView = Static<typeof DeliverySummaryView>;
