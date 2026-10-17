import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';

const closed = { additionalProperties: false } as const;
const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
export const CheckState = Type.Union(['pending', 'running', 'passed', 'failed', 'error', 'not_applicable'].map(x => Type.Literal(x)));
export const Artifact = Type.Object({
  id: OperationId, attemptId: OperationId, deliveryId: OperationId, checkId: OperationId,
  kind: Type.Literal('check_log'), pathRelative: Type.String({ maxLength: 256 }),
  sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }), sizeBytes: Type.Integer({ minimum: 0, maximum: 1_048_576 }),
}, closed);
export type Artifact = Static<typeof Artifact>;
export const CheckRun = Type.Object({
  id: OperationId, verificationId: OperationId, deliveryId: OperationId, contentIdentity: Type.String(),
  checkDefinitionId: Type.String({ maxLength: 128 }), runNumber: Type.Integer({ minimum: 1 }),
  command: Type.String({ maxLength: 4096 }), cwdRelative: Type.String({ maxLength: 4096 }), timeoutMs: Type.Integer({ minimum: 1 }),
  state: CheckState, exitCode: nullable(Type.Integer()), startedAtMs: nullable(Type.Integer({ minimum: 0 })),
  endedAtMs: nullable(Type.Integer({ minimum: 0 })), durationMs: nullable(Type.Integer({ minimum: 0 })),
  diagnostic: nullable(Type.String({ maxLength: 128 })), executionDiagnostic: nullable(Type.String({ maxLength: 128 })), artifacts: Type.Array(Artifact, { maxItems: 1 }),
}, closed);
export type CheckRun = Static<typeof CheckRun>;
export const VerificationSummary = Type.Object({
  id: OperationId, deliveryId: OperationId, contentIdentity: Type.String(), runNumber: Type.Integer({ minimum: 1 }),
  state: CheckState, diagnostic: nullable(Type.String({ maxLength: 128 })),
  startedAtMs: Type.Integer({ minimum: 0 }), endedAtMs: nullable(Type.Integer({ minimum: 0 })),
  checkCount: Type.Integer({ minimum: 0, maximum: 50 }),
}, closed);
export type VerificationSummary = Static<typeof VerificationSummary>;
export const CheckHistoryQuery = Type.Object({
  cursor: Type.Optional(Type.String({ maxLength: 1024 })),
  limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
}, closed);
export type CheckHistoryQuery = Static<typeof CheckHistoryQuery>;
export const CheckHistory = Type.Object({
  entries: Type.Array(CheckRun, { maxItems: 100 }), nextCursor: nullable(Type.String()), hasMore: Type.Boolean(),
}, closed);
export type CheckHistory = Static<typeof CheckHistory>;
export const ArtifactParams = Type.Object({ artifactId: OperationId }, closed);
