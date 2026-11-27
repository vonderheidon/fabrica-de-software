import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';
import { GitHubId } from './github.js';

const closed = { additionalProperties: false } as const;
const targetNullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
export const DeliveryTaskType = Type.Union(['feat','fix','docs','refactor','test','chore','perf','build','ci','revert'].map(v => Type.Literal(v)));
export const DeliveryTargetLocalIdentity = Type.Object({
  branch_kind: Type.Optional(Type.Union([Type.Literal('new'), Type.Literal('existing')])),
  source_kind: Type.Optional(Type.Union([Type.Literal('local'), Type.Literal('github')])),
  format_version: Type.Literal(1), root_identity: Type.String({ minLength: 1, maxLength: 512 }), git_directory_identity: Type.String({ minLength: 1, maxLength: 512 }),
  remote_name: Type.String({ minLength: 1, maxLength: 128 }), remote_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  base_branch: Type.String({ minLength: 1, maxLength: 1024 }), base_sha: Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }),
  observed_head: Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }), observed_branch_ref: targetNullable(Type.String({ maxLength: 1024 })),
  working_state_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }), index_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  /** Allowlisted operator Git settings observed without isolation; reapplied on every write in the Pasta do projeto. */
  operator_config: Type.Optional(Type.Record(Type.String({ pattern: '^core\\.[a-z]{1,32}$' }), Type.String({ maxLength: 256 }), { maxProperties: 8 })),
}, closed);
export type DeliveryTargetLocalIdentity = Static<typeof DeliveryTargetLocalIdentity>;
export const DeliveryTarget = Type.Object({
  operation_id: OperationId, selection_operation_id: targetNullable(OperationId), delivery_id: OperationId, attempt_id: OperationId,
  repository_id: GitHubId, local_path: Type.String({ minLength: 1, maxLength: 32768 }), local_identity: DeliveryTargetLocalIdentity,
  branch_ref: Type.String({ minLength: 1, maxLength: 1024 }), task_type: DeliveryTaskType,
  task_description: Type.String({ minLength: 1, maxLength: 256 }), issue_number: Type.Integer({ minimum: 1 }),
  base_branch: Type.String({ minLength: 1, maxLength: 1024 }), base_sha: Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }),
  approved_ref: Type.String({ minLength: 1, maxLength: 1024 }), content_identity: Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }),
  format_version: Type.Literal(1), created_at_ms: Type.Integer({ minimum: 0 }),
}, closed);
export type DeliveryTarget = Static<typeof DeliveryTarget>;
