import { Type, type Static } from '@sinclair/typebox';
import { Capability, OperationId } from './base.js';
import { Prerequisite } from './projects.js';
import { EffectReceipt } from './publication.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 4096) => Type.String({ minLength: 1, maxLength });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const nullable = Type.Union([text(), Type.Null()]);
export const CreationMode = Type.Union([Type.Literal('local'), Type.Literal('remote_no_push'), Type.Literal('remote_push')]);
export type CreationMode = Static<typeof CreationMode>;
export const ScaffoldInput = Type.Object({
  name: text(256), templateId: text(128), templateDigest: digest, destinationRelative: text(1024),
  creationMode: CreationMode, baseBranch: text(256), triageEnabled: Type.Boolean(),
  remote: Type.Optional(Type.Object({ ownerId: text(256), name: text(100), visibility: Type.Union([Type.Literal('private'), Type.Literal('public')]) }, closed)),
  boardName: Type.Optional(text(256)),
}, closed);
export type ScaffoldInput = Static<typeof ScaffoldInput>;
export const ScaffoldInputV3 = Type.Object({
  name: text(256), templateId: text(128), templateDigest: digest, destinationRelative: text(1024),
  creationMode: Type.Literal('remote_push'), baseBranch: text(256), triageEnabled: Type.Boolean(),
  remote: Type.Object({ ownerId: text(256), name: text(100), visibility: Type.Union([Type.Literal('private'), Type.Literal('public')]) }, closed),
  boardName: text(256),
}, closed);
export type ScaffoldInputV3 = Static<typeof ScaffoldInputV3>;
export const ScaffoldFile = Type.Object({ path: text(1024), bytes: Type.Integer({ minimum: 0, maximum: 65536 }), sha256: digest }, closed);
export const ScaffoldAccount = Type.Object({ state: text(128), id: nullable, login: nullable }, closed);
export const ScaffoldEngineering = Type.Object({ tracker: Type.Literal('github'), domain: Type.Literal('single-context'), instructionFile: Type.Literal('AGENTS.md'), triageEnabled: Type.Boolean(), installsSkills: Type.Literal(false), createsLabels: Type.Literal(false) }, closed);
const scaffoldPlanFields = {
  formatVersion: Type.Literal(1), installationId: OperationId, settingsETag: text(256),
  projectsRoot: text(), destination: text(), parentIdentity: digest, templateDigest: digest,
  files: Type.Array(ScaffoldFile, { minItems: 1, maxItems: 50 }), engineering: ScaffoldEngineering,
  account: ScaffoldAccount, ownerId: Type.Union([text(256), Type.Null()]),
  ownerLogin: Type.Optional(text(100)), effects: Type.Array(text(128), { maxItems: 20 }),
} as const;
export const ScaffoldPlanV3 = Type.Object({ ...scaffoldPlanFields, input: ScaffoldInputV3 }, closed);
export type ScaffoldPlanV3 = Static<typeof ScaffoldPlanV3>;
export const LegacyScaffoldPlan = Type.Object({ ...scaffoldPlanFields, input: ScaffoldInput }, closed);
export type LegacyScaffoldPlan = Static<typeof LegacyScaffoldPlan>;
export const ScaffoldPlan = Type.Union([ScaffoldPlanV3, LegacyScaffoldPlan]);
export type ScaffoldPlan = Static<typeof ScaffoldPlan>;
export const ScaffoldPlanned = Type.Object({ planHash: digest, plan: ScaffoldPlan, prerequisites: Type.Array(Prerequisite, { maxItems: 100 }) }, closed);
export type ScaffoldPlanned = Static<typeof ScaffoldPlanned>;
export const ScaffoldOptions = Type.Object({
  catalog: Type.Object({ id: text(128), version: Type.Literal(1), digest }, closed),
  templates: Type.Array(Type.Object({ id: text(128), digest, label: text(256), engineeringSummary: text() }, closed), { maxItems: 20 }),
  projectsRoot: nullable, creationModes: Type.Array(Type.Object({ mode: CreationMode, capability: Capability }, closed), { maxItems: 3 }),
  account: ScaffoldAccount, prerequisites: Type.Array(Prerequisite, { maxItems: 100 }), eventCursor: Type.String({ pattern: '^[0-9]+$' }),
}, closed);
export type ScaffoldOptions = Static<typeof ScaffoldOptions>;
export const CreateScaffold = Type.Object({ planHash: digest, plan: ScaffoldPlan, authorized: Type.Literal(true) }, closed);
export type CreateScaffold = Static<typeof CreateScaffold>;
export const CreationParams = Type.Object({ creationId: OperationId }, closed);
export const CreationStep = Type.Object({ step: Type.Union([Type.Literal('directory'), Type.Literal('files'), Type.Literal('git'), Type.Literal('baseline'), Type.Literal('registration')]), state: Type.Union([Type.Literal('not_started'), Type.Literal('running'), Type.Literal('confirmed'), Type.Literal('unknown')]) }, closed);
export type CreationStep = Static<typeof CreationStep>;
export const ProjectCreation = Type.Object({
  id: OperationId, operationId: OperationId, projectId: Type.Union([OperationId, Type.Null()]), planHash: digest, plan: ScaffoldPlan,
  state: Type.Union(['pending', 'running', 'completed', 'partial', 'failed'].map(s => Type.Literal(s))),
  revision: Type.Integer({ minimum: 1 }), baselineSha: Type.Union([Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }), Type.Null()]), baselineRef: nullable,
  diagnostic: nullable, createdAtMs: Type.Integer({ minimum: 0 }),
}, closed);
export type ProjectCreation = Static<typeof ProjectCreation>;
export const CreationEffectIdentity = Type.Object({
  planHash: Type.Optional(digest), ownerId: Type.Optional(text(256)), repositoryOwner: Type.Optional(text(256)), repositoryName: Type.Optional(text(100)),
  visibility: Type.Optional(Type.Union([Type.Literal('private'), Type.Literal('public')])), marker: Type.Optional(text(512)),
  repositoryId: Type.Optional(text(256)), commitSha: Type.Optional(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })), branchRef: Type.Optional(text(1024)),
}, closed);
export const CreationEffect = Type.Object({
  operationId: OperationId, attemptId: Type.Null(), creationId: Type.Union([OperationId, Type.Null()]), deliveryId: Type.Null(),
  kind: Type.Union([Type.Literal('create_repository'), Type.Literal('associate_origin'), Type.Literal('baseline_push')]), scopeKey: text(256),
  state: Type.Union(['not_requested', 'not_started', 'running', 'confirmed', 'failed_known', 'unknown', 'not_applicable'].map(state => Type.Literal(state))),
  expectedIdentity: CreationEffectIdentity, confirmedIdentity: Type.Union([EffectReceipt, Type.Null()]), receipt: Type.Union([EffectReceipt, Type.Null()]),
  reason: Type.Union([text(128), Type.Null()]), authorized: Type.Boolean(), revision: Type.Integer({ minimum: 1 }),
  sentAtMs: Type.Union([Type.Integer(), Type.Null()]), confirmedAtMs: Type.Union([Type.Integer(), Type.Null()]),
}, closed);
export type CreationEffect = Static<typeof CreationEffect>;
export const CreationBoardOperationKind = Type.Union([
  Type.Literal('create_board'), Type.Literal('configure_status'), Type.Literal('link_repository'),
  Type.Literal('configure_view'), Type.Literal('verify_board'),
]);
export type CreationBoardOperationKind = Static<typeof CreationBoardOperationKind>;
export const CreationBoardOperationState = Type.Union([
  Type.Literal('not_started'), Type.Literal('running'), Type.Literal('confirmed'), Type.Literal('failed_known'), Type.Literal('unknown'),
]);
export type CreationBoardOperationState = Static<typeof CreationBoardOperationState>;
const boardOption = Type.Object({ id: text(256), name: text(128) }, closed);
const boardReceipt = Type.Object({ format_version: Type.Literal(1), observed_at_ms: timestamp,
  project_id: Type.Optional(text(256)), owner_id: Type.Optional(text(256)), title: Type.Optional(text(256)),
  project_url: Type.Optional(text(2048)),
  repository_ids: Type.Optional(Type.Array(text(256), { maxItems: 100 })), status_field_id: Type.Optional(text(256)),
  status_field_name: Type.Optional(text(256)), status_options: Type.Optional(Type.Array(boardOption, { maxItems: 20 })),
  view_id: Type.Optional(text(256)), view_name: Type.Optional(text(256)), view_layout: Type.Optional(Type.Literal('BOARD_LAYOUT')),
  group_by_field_ids: Type.Optional(Type.Array(text(256), { maxItems: 20 })), visible_field_ids: Type.Optional(Type.Array(text(256), { maxItems: 100 })) }, closed);
export const CreationBoardOperation = Type.Object({
  operation_id: OperationId, creation_id: OperationId, kind: CreationBoardOperationKind, scope_key: text(512),
  state: CreationBoardOperationState, revision: Type.Integer({ minimum: 1 }), request_hash: digest,
  authorization: Type.Object({ format_version: Type.Literal(1), source_operation_id: OperationId, plan_hash: digest,
    account_id: text(256), creation_id: OperationId, actions: Type.Array(CreationBoardOperationKind, { minItems: 5, maxItems: 5 }) }, closed),
  expected_identity: Type.Object({ format_version: Type.Literal(1), owner_id: text(256), board_name: text(256), marker: text(512),
    repository_id: Type.Union([text(256), Type.Null()]), project_id: Type.Union([text(256), Type.Null()]),
    status_field_id: Type.Union([text(256), Type.Null()]), expected_status_names: Type.Array(text(128), { minItems: 5, maxItems: 5 }),
    view_id: Type.Union([text(256), Type.Null()]), view_name: text(256), view_layout: Type.Literal('BOARD_LAYOUT') }, closed),
  receipt: Type.Union([boardReceipt, Type.Null()]),
  reason: Type.Union([text(128), Type.Null()]), created_at_ms: timestamp,
  sent_at_ms: Type.Union([timestamp, Type.Null()]), confirmed_at_ms: Type.Union([timestamp, Type.Null()]),
}, closed);
export type CreationBoardOperation = Static<typeof CreationBoardOperation>;
export const CreationBoardMutationResult = Type.Union([
  Type.Object({ state: Type.Literal('confirmed'), receipt: boardReceipt, reason: Type.Null() }, closed),
  Type.Object({ state: Type.Literal('failed_known'), receipt: Type.Null(), reason: text(128) }, closed),
  Type.Object({ state: Type.Literal('unknown'), receipt: Type.Null(), reason: text(128) }, closed),
]);
export type CreationBoardMutationResult = Static<typeof CreationBoardMutationResult>;
export const CreationView = Type.Object({ creation: ProjectCreation, confirmedEffects: Type.Array(CreationStep), pendingEffects: Type.Array(CreationStep), effects: Type.Array(CreationEffect, { maxItems: 3 }),
  remoteEffects: Type.Array(Type.Object({ kind: Type.Union([Type.Literal('create_repository'),Type.Literal('associate_origin'),Type.Literal('baseline_push')]),
    state: CreationEffect.properties.state,operationId: Type.Union([OperationId,Type.Null()]),identity: CreationEffectIdentity,reason: Type.Union([text(128),Type.Null()]) },closed),{ maxItems: 3 }),
  prerequisites: Type.Array(Prerequisite), diagnostics: Type.Array(text(128)), board_operations: Type.Array(CreationBoardOperation, { maxItems: 5 }),
  eventCursor: Type.String({ pattern: '^[0-9]+$' }) }, closed);
export type CreationView = Static<typeof CreationView>;
