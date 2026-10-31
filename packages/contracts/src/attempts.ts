import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';
import { CapturedPublicationTarget, Criterion, EffectiveConfiguration } from './preparations.js';
import { IssueContext } from './github.js';
import { RoleResourceReference } from './execution.js';
import { AttemptWorkspaceSnapshot } from './workspaces.js';

const closed = { additionalProperties: false } as const;
const hash = Type.String({ pattern: '^[a-f0-9]{64}$' });
const text = (maxLength = 256) => Type.String({ minLength: 1, maxLength });
export const StartAttempt = Type.Object({
  preparationId: OperationId, preparationRevision: Type.Integer({ minimum: 1 }),
  authorizedSummaryHash: hash, authorized: Type.Literal(true),
}, closed);
export type StartAttempt = Static<typeof StartAttempt>;
export const ToolObservation = Type.Object({
  tool: Type.Union(['node', 'git', 'gh', 'maestri', 'omp'].map(t => Type.Literal(t))),
  state: Type.Union([Type.Literal('observed'), Type.Literal('unavailable')]),
  version: Type.Union([text(), Type.Null()]), cause: Type.Union([text(), Type.Null()]),
  affectedRequirements: Type.Array(text(), { maxItems: 20 }), observedAtMs: Type.Integer({ minimum: 0 }),
}, closed);
export type ToolObservation = Static<typeof ToolObservation>;
export const AttemptCapture = Type.Object({
  formatVersion: Type.Literal(1), preparationId: OperationId, preparationRevision: Type.Integer({ minimum: 1 }),
  summaryHash: hash, accountId: text(), issue: IssueContext, baseSha: Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }),
  configuration: EffectiveConfiguration, criteria: Type.Array(Criterion, { minItems: 1, maxItems: 1000 }),
  criteriaDigest: hash, roleResources: Type.Array(RoleResourceReference, { minItems: 2, maxItems: 2 }),
  tools: Type.Array(ToolObservation, { minItems: 5, maxItems: 5 }), v3Delivery: Type.Optional(CapturedPublicationTarget),
  workspace: AttemptWorkspaceSnapshot,
}, closed);
export type AttemptCapture = Static<typeof AttemptCapture>;
export const AttemptParams = Type.Object({ attemptId: OperationId }, closed);
// Small operational view; the capture and criterion evidence are loaded through storage on demand.
export const AttemptStatus = Type.Object({
  id: OperationId, projectId: OperationId, operationId: OperationId, passageId: OperationId, round: Type.Integer({ minimum: 1, maximum: 6 }),
  phase: Type.Union(['preparing', 'implementing', 'verifying', 'reviewing', 'publishing', 'finished'].map(x => Type.Literal(x))),
  result: Type.Union([Type.Null(), ...['delivered', 'rejected', 'failed', 'cancelled', 'interrupted'].map(x => Type.Literal(x))]),
  suspension: Type.Union([Type.Null(), text()]), tracking: Type.Union(['pending', 'tracked', 'lost'].map(x => Type.Literal(x))),
  diagnostic: Type.Union([Type.Null(), text()]), resultReceiptId: Type.Union([Type.Null(), OperationId]),
  deliveryId: Type.Union([Type.Null(), OperationId]),
  pendingQuestionId: Type.Optional(Type.Union([Type.Null(), OperationId])),
  revision: Type.Integer({ minimum: 1 }), eventCursor: Type.String({ pattern: '^[0-9]+$' }),
}, closed);
export type AttemptStatus = Static<typeof AttemptStatus>;
