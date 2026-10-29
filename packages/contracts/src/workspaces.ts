import { Type, type Static } from '@sinclair/typebox';
import { GitHubBranch, GitHubRepository, GitHubDiagnostic } from './github.js';
import { Capability, OperationId } from './base.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 4096) => Type.String({ minLength: 1, maxLength });
export const OriginSource = Type.Object({ kind: Type.Union([Type.Literal('local'), Type.Literal('github')]), location: text(32768) }, closed);
export type OriginSource = Static<typeof OriginSource>;
export const BranchOptionsRequest = Type.Object({ source: OriginSource }, closed);
export const BranchOptions = Type.Object({
  branches: Type.Array(Type.String({ minLength:1,maxLength:1024 }), { maxItems:5000 }),
  state: Type.Union([Type.Literal('complete'),Type.Literal('partial'),Type.Literal('unavailable')]),
  message: Type.Union([Type.String({ maxLength:2048 }),Type.Null()]),
}, closed);
export type BranchOptions = Static<typeof BranchOptions>;
export const OriginRequest = Type.Object({ source: OriginSource, baseBranch: text(1024), remoteName: Type.Optional(text(128)) }, closed);
export type OriginRequest = Static<typeof OriginRequest>;
export const OriginDiagnostic = Type.Object({
  code: Type.Union((['CONTEXT_UNAVAILABLE', 'ORIGIN_INVALID', 'BRANCH_INVALID', 'BRANCH_NOT_FOUND', 'GIT_UNAVAILABLE',
    'GIT_RESPONSE_INVALID', 'REMOTE_MISSING', 'REMOTE_AMBIGUOUS', 'REMOTE_UNSUPPORTED', 'REMOTE_UNCONFIRMED',
    'REMOTE_MISMATCH', 'HEAD_UNBORN', 'LOCAL_CHANGES_EXCLUDED', 'ORIGIN_CHANGED', 'PROJECT_REQUIRED'] as const).map((code) => Type.Literal(code))),
  message: text(), recovery: text(),
}, closed);
export type OriginDiagnostic = Static<typeof OriginDiagnostic>;
export const OriginInspection = Type.Object({
  state: Type.Union([Type.Literal('identified'), Type.Literal('unavailable'), Type.Literal('invalid')]),
  source: Type.Union([OriginSource, Type.Null()]),
  local: Type.Union([Type.Object({
    root: text(32768), headSha: Type.Union([Type.String({ pattern: '^[0-9a-f]{40,64}$' }), Type.Null()]),
    dirty: Type.Boolean(),
  }, closed), Type.Null()]),
  base: Type.Union([Type.Object({ branch: text(1024), sha: Type.String({ pattern: '^[0-9a-f]{40,64}$' }), observedFrom: Type.Union([Type.Literal('local'), Type.Literal('github')]) }, closed), Type.Null()]),
  remote: Type.Union([Type.Object({
    name: Type.Union([text(128), Type.Null()]), url: text(), confirmed: Type.Boolean(),
    repository: Type.Union([GitHubRepository, Type.Null()]), branch: Type.Union([GitHubBranch, Type.Null()]),
  }, closed), Type.Null()]),
  diagnostics: Type.Array(OriginDiagnostic),
  githubDiagnostics: Type.Array(GitHubDiagnostic),
  retryAtMs: Type.Union([Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }), Type.Null()]),
  /** Project membership is checked later against the issue; origin inspection never grants execution. */
  executionReady: Type.Literal(false),
}, closed);
export type OriginInspection = Static<typeof OriginInspection>;

const storagePath = Type.String({ minLength: 1, maxLength: 32768 });
export const ProjectStorageLocation = Type.Object({
  id: OperationId, location_key: Type.String({ minLength: 1, maxLength: 256 }),
  layout_version: Type.Integer({ minimum: 1 }), path: storagePath, current: Type.Boolean(),
  verified_at_ms: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
}, closed);
export type ProjectStorageLocation = Static<typeof ProjectStorageLocation>;
export const StorageTransitionPlan = Type.Object({
  location_key: Type.String({ minLength: 1, maxLength: 256 }), source_location_id: OperationId,
  destination_relative: storagePath, plan_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }), capability: Capability,
}, closed);
export type StorageTransitionPlan = Static<typeof StorageTransitionPlan>;
export const StorageTransitionCommand = Type.Object({ location_key: Type.String({ minLength: 1, maxLength: 256 }),
  source_location_id: OperationId, plan_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }), authorized: Type.Literal(true) }, closed);
export type StorageTransitionCommand = Static<typeof StorageTransitionCommand>;
export const ProjectStorageView = Type.Object({
  managed_root: Type.Union([storagePath, Type.Null()]), original_path: Type.Union([storagePath, Type.Null()]),
  locations: Type.Array(ProjectStorageLocation, { maxItems: 100 }), transition_plan: Type.Union([StorageTransitionPlan, Type.Null()]),
  active_transition_operation_id: Type.Union([OperationId, Type.Null()]),
  state: Type.Union([Type.Literal('current'), Type.Literal('transitioning'), Type.Literal('uncertain'), Type.Literal('blocked')]),
  cause: Type.Union([storagePath, Type.Null()]), recovery: Type.Union([storagePath, Type.Null()]),
}, closed);
export type ProjectStorageView = Static<typeof ProjectStorageView>;

/** Filesystem identity captured by the workspace adapter for an existing managed root. */
export const ProjectStorageObjectIdentity = Type.Object({
  format_version: Type.Literal(1), volume_id: Type.String({ minLength: 1, maxLength: 128 }),
  object_id: Type.String({ minLength: 1, maxLength: 128 }),
  ancestors: Type.Array(Type.Object({ volume_id: Type.String({ minLength: 1, maxLength: 128 }),
    object_id: Type.String({ minLength: 1, maxLength: 128 }) }, closed), { minItems: 1, maxItems: 64 }),
}, closed);
export type ProjectStorageObjectIdentity = Static<typeof ProjectStorageObjectIdentity>;
export const ProjectStorageRootObservation = Type.Object({
  project_id: OperationId, location_key: Type.String({ minLength: 1, maxLength: 256 }),
  layout_version: Type.Integer({ minimum: 1 }), root_relative: Type.String({ minLength: 1, maxLength: 32768 }),
  object_identity: ProjectStorageObjectIdentity, verified_at_ms: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
}, closed);
export type ProjectStorageRootObservation = Static<typeof ProjectStorageRootObservation>;
