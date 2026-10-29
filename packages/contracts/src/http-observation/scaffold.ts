// Public HTTP DTOs; private documents retain their versioned representation.
import { Type, type Static } from '@sinclair/typebox';
import { Capability, OperationId } from '../base.js';
import { Prerequisite } from '../projects.js';
import { EffectReceipt } from '../http-execution/publication.js';
import { CreationBoardOperation as InternalCreationBoardOperation } from '../scaffold.js';
const closed = { additionalProperties: false } as const;
const text = (maxLength = 4096) => Type.String({ minLength: 1, maxLength });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const nullable = Type.Union([text(), Type.Null()]);
export const CreationMode = Type.Literal('remote_push');
export type CreationMode = Static<typeof CreationMode>;
export const ScaffoldInput = Type.Object({
    name: text(256), template_id: text(128), template_digest: digest, destination_relative: text(1024),
    creation_mode: Type.Literal('remote_push'), base_branch: text(256), triage_enabled: Type.Boolean(),
    remote: Type.Object({ owner_id: text(256), name: text(100), visibility: Type.Union([Type.Literal('private'), Type.Literal('public')]) }, closed),
    board_name: text(256),
}, closed);
export type ScaffoldInput = Static<typeof ScaffoldInput>;
export const ScaffoldFile = Type.Object({ path: text(1024), bytes: Type.Integer({ minimum: 0, maximum: 65536 }), sha256: digest }, closed);
export const ScaffoldAccount = Type.Object({ state: text(128), id: nullable, login: nullable }, closed);
export const ScaffoldEngineering = Type.Object({ tracker: Type.Literal('github'), domain: Type.Literal('single-context'), instruction_file: Type.Literal('AGENTS.md'), triage_enabled: Type.Boolean(), installs_skills: Type.Literal(false), creates_labels: Type.Literal(false) }, closed);
const scaffoldPlanFields = {
    format_version: Type.Literal(1), installation_id: OperationId, settings_e_tag: text(256),
    projects_root: text(), destination: text(), parent_identity: digest, template_digest: digest,
    files: Type.Array(ScaffoldFile, { minItems: 1, maxItems: 50 }), engineering: ScaffoldEngineering,
    account: ScaffoldAccount, owner_id: Type.Union([text(256), Type.Null()]),
    owner_login: Type.Optional(text(100)), effects: Type.Array(text(128), { maxItems: 20 }),
} as const;
export const ScaffoldPlanV3 = Type.Object({ ...scaffoldPlanFields, input: ScaffoldInput }, closed);
export type ScaffoldPlanV3 = Static<typeof ScaffoldPlanV3>;
export const ScaffoldPlan = ScaffoldPlanV3;
export type ScaffoldPlan = ScaffoldPlanV3;
export const ScaffoldPlanned = Type.Object({ plan_hash: digest, plan: ScaffoldPlanV3, prerequisites: Type.Array(Prerequisite, { maxItems: 100 }) }, closed);
export type ScaffoldPlanned = Static<typeof ScaffoldPlanned>;
export const ScaffoldOptions = Type.Object({
    catalog: Type.Object({ id: text(128), version: Type.Literal(1), digest }, closed),
    templates: Type.Array(Type.Object({ id: text(128), digest, label: text(256), engineering_summary: text() }, closed), { maxItems: 20 }),
    projects_root: nullable, creation_modes: Type.Array(Type.Object({ mode: CreationMode, capability: Capability }, closed), { maxItems: 1 }),
    account: ScaffoldAccount, prerequisites: Type.Array(Prerequisite, { maxItems: 100 }), event_cursor: Type.String({ pattern: '^[0-9]+$' }),
}, closed);
export type ScaffoldOptions = Static<typeof ScaffoldOptions>;
export const CreateScaffold = Type.Object({ plan_hash: digest, plan: ScaffoldPlanV3, authorized: Type.Literal(true) }, closed);
export type CreateScaffold = Static<typeof CreateScaffold>;
export const CreationParams = Type.Object({ creationId: OperationId }, closed);
export const CreationStep = Type.Object({ step: Type.Union([Type.Literal('directory'), Type.Literal('files'), Type.Literal('git'), Type.Literal('baseline'), Type.Literal('registration')]), state: Type.Union([Type.Literal('not_started'), Type.Literal('running'), Type.Literal('confirmed'), Type.Literal('unknown')]) }, closed);
export type CreationStep = Static<typeof CreationStep>;
export const ProjectCreation = Type.Object({
    id: OperationId, operation_id: OperationId, project_id: Type.Union([OperationId, Type.Null()]), plan_hash: digest, plan: ScaffoldPlanV3,
    state: Type.Union(['pending', 'running', 'completed', 'partial', 'failed'].map(s => Type.Literal(s))),
    revision: Type.Integer({ minimum: 1 }), baseline_sha: Type.Union([Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }), Type.Null()]), baseline_ref: nullable,
    diagnostic: nullable, created_at_ms: Type.Integer({ minimum: 0 }),
}, closed);
export type ProjectCreation = Static<typeof ProjectCreation>;
export const CreationEffectIdentity = Type.Object({
    plan_hash: Type.Optional(digest), owner_id: Type.Optional(text(256)), repository_owner: Type.Optional(text(256)), repository_name: Type.Optional(text(100)),
    visibility: Type.Optional(Type.Union([Type.Literal('private'), Type.Literal('public')])), marker: Type.Optional(text(512)),
    repository_id: Type.Optional(text(256)), commit_sha: Type.Optional(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })), branch_ref: Type.Optional(text(1024)),
}, closed);
export const CreationEffect = Type.Object({
    operation_id: OperationId, attempt_id: Type.Null(), creation_id: Type.Union([OperationId, Type.Null()]), delivery_id: Type.Null(),
    kind: Type.Union([Type.Literal('create_repository'), Type.Literal('associate_origin'), Type.Literal('baseline_push')]), scope_key: text(256),
    state: Type.Union(['not_requested', 'not_started', 'running', 'confirmed', 'failed_known', 'unknown', 'not_applicable'].map(state => Type.Literal(state))),
    expected_identity: CreationEffectIdentity, confirmed_identity: Type.Union([EffectReceipt, Type.Null()]), receipt: Type.Union([EffectReceipt, Type.Null()]),
    reason: Type.Union([text(128), Type.Null()]), authorized: Type.Boolean(), revision: Type.Integer({ minimum: 1 }),
    sent_at_ms: Type.Union([Type.Integer(), Type.Null()]), confirmed_at_ms: Type.Union([Type.Integer(), Type.Null()]),
}, closed);
export type CreationEffect = Static<typeof CreationEffect>;
const boardKind = InternalCreationBoardOperation.properties.kind;
const boardState = InternalCreationBoardOperation.properties.state;
const boardReceipt = Type.Object({ format_version: Type.Literal(1), observed_at_ms: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    project_id: Type.Optional(text(256)), owner_id: Type.Optional(text(256)), title: Type.Optional(text(256)),
    project_url: Type.Optional(text(2048)),
    repository_ids: Type.Optional(Type.Array(text(256), { maxItems: 100 })), status_field_id: Type.Optional(text(256)),
    status_field_name: Type.Optional(text(256)), status_options: Type.Optional(Type.Array(Type.Object({ id: text(256), name: text(128) }, closed), { maxItems: 20 })),
    view_id: Type.Optional(text(256)), view_name: Type.Optional(text(256)), view_layout: Type.Optional(Type.Literal('BOARD_LAYOUT')),
    group_by_field_ids: Type.Optional(Type.Array(text(256), { maxItems: 20 })), visible_field_ids: Type.Optional(Type.Array(text(256), { maxItems: 100 })) }, closed);
export const CreationBoardOperation = Type.Object({ operation_id: OperationId, creation_id: OperationId, kind: boardKind, scope_key: text(512),
    state: boardState, revision: Type.Integer({ minimum: 1 }), request_hash: digest,
    authorization: Type.Object({ format_version: Type.Literal(1), source_operation_id: OperationId, plan_hash: digest, account_id: text(256),
        creation_id: OperationId, actions: Type.Array(boardKind, { minItems: 5, maxItems: 5 }) }, closed),
    expected_identity: Type.Object({ format_version: Type.Literal(1), owner_id: text(256), board_name: text(256), marker: text(512),
        repository_id: Type.Union([text(256), Type.Null()]), project_id: Type.Union([text(256), Type.Null()]), status_field_id: Type.Union([text(256), Type.Null()]),
        expected_status_names: Type.Array(text(128), { minItems: 5, maxItems: 5 }), view_id: Type.Union([text(256), Type.Null()]), view_name: text(256),
        view_layout: Type.Literal('BOARD_LAYOUT') }, closed),
    receipt: Type.Union([boardReceipt, Type.Null()]), reason: Type.Union([text(128), Type.Null()]), created_at_ms: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    sent_at_ms: Type.Union([Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }), Type.Null()]),
    confirmed_at_ms: Type.Union([Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }), Type.Null()]) }, closed);
export type CreationBoardOperation = Static<typeof CreationBoardOperation>;
export const CreationView = Type.Object({ creation: ProjectCreation, confirmed_effects: Type.Array(CreationStep), pending_effects: Type.Array(CreationStep), effects: Type.Array(CreationEffect, { maxItems: 3 }),
    remote_effects: Type.Array(Type.Object({ kind: Type.Union([Type.Literal('create_repository'), Type.Literal('associate_origin'), Type.Literal('baseline_push')]),
        state: CreationEffect.properties.state, operation_id: Type.Union([OperationId, Type.Null()]), identity: CreationEffectIdentity, reason: Type.Union([text(128), Type.Null()]) }, closed), { maxItems: 3 }),
    prerequisites: Type.Array(Prerequisite), diagnostics: Type.Array(text(128)), board_operations: Type.Array(CreationBoardOperation, { maxItems: 5 }),
    board_name: Type.Union([text(256), Type.Null()]), board_url: Type.Union([text(2048), Type.Null()]),
    next_action: Type.Union([Type.Literal('wait'), Type.Literal('reconcile'), Type.Literal('create_new_plan'), Type.Literal('review_effect'), Type.Literal('none')]),
    event_cursor: Type.String({ pattern: '^[0-9]+$' }) }, closed);
export type CreationView = Static<typeof CreationView>;
