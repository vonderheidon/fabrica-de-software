// Public HTTP DTOs; private documents retain their versioned representation.
import { Type, type Static } from '@sinclair/typebox';
import { Capability, OperationId } from '../base.js';
import { Prerequisite } from '../projects.js';
import { EffectReceipt } from '../http-execution/publication.js';
const closed = { additionalProperties: false } as const;
const text = (maxLength = 4096) => Type.String({ minLength: 1, maxLength });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const nullable = Type.Union([text(), Type.Null()]);
export const CreationMode = Type.Union([Type.Literal('local'), Type.Literal('remote_no_push'), Type.Literal('remote_push')]);
export type CreationMode = Static<typeof CreationMode>;
export const ScaffoldInput = Type.Object({
    name: text(256), template_id: text(128), template_digest: digest, destination_relative: text(1024),
    creation_mode: CreationMode, base_branch: text(256), triage_enabled: Type.Boolean(),
    remote: Type.Optional(Type.Object({ owner_id: text(256), name: text(100), visibility: Type.Union([Type.Literal('private'), Type.Literal('public')]) }, closed)),
}, closed);
export type ScaffoldInput = Static<typeof ScaffoldInput>;
export const ScaffoldFile = Type.Object({ path: text(1024), bytes: Type.Integer({ minimum: 0, maximum: 65536 }), sha256: digest }, closed);
export const ScaffoldAccount = Type.Object({ state: text(128), id: nullable, login: nullable }, closed);
export const ScaffoldEngineering = Type.Object({ tracker: Type.Literal('github'), domain: Type.Literal('single-context'), instruction_file: Type.Literal('AGENTS.md'), triage_enabled: Type.Boolean(), installs_skills: Type.Literal(false), creates_labels: Type.Literal(false) }, closed);
export const ScaffoldPlan = Type.Object({
    format_version: Type.Literal(1), input: ScaffoldInput, installation_id: OperationId, settings_e_tag: text(256),
    projects_root: text(), destination: text(), parent_identity: digest, template_digest: digest,
    files: Type.Array(ScaffoldFile, { minItems: 1, maxItems: 50 }), engineering: ScaffoldEngineering,
    account: ScaffoldAccount, owner_id: Type.Union([text(256), Type.Null()]),
    owner_login: Type.Optional(text(100)), effects: Type.Array(text(128), { maxItems: 10 }),
}, closed);
export type ScaffoldPlan = Static<typeof ScaffoldPlan>;
export const ScaffoldPlanned = Type.Object({ plan_hash: digest, plan: ScaffoldPlan, prerequisites: Type.Array(Prerequisite, { maxItems: 100 }) }, closed);
export type ScaffoldPlanned = Static<typeof ScaffoldPlanned>;
export const ScaffoldOptions = Type.Object({
    catalog: Type.Object({ id: text(128), version: Type.Literal(1), digest }, closed),
    templates: Type.Array(Type.Object({ id: text(128), digest, label: text(256), engineering_summary: text() }, closed), { maxItems: 20 }),
    projects_root: nullable, creation_modes: Type.Array(Type.Object({ mode: CreationMode, capability: Capability }, closed), { maxItems: 3 }),
    account: ScaffoldAccount, prerequisites: Type.Array(Prerequisite, { maxItems: 100 }), event_cursor: Type.String({ pattern: '^[0-9]+$' }),
}, closed);
export type ScaffoldOptions = Static<typeof ScaffoldOptions>;
export const CreateScaffold = Type.Object({ plan_hash: digest, plan: ScaffoldPlan, authorized: Type.Literal(true) }, closed);
export type CreateScaffold = Static<typeof CreateScaffold>;
export const CreationParams = Type.Object({ creationId: OperationId }, closed);
export const CreationStep = Type.Object({ step: Type.Union([Type.Literal('directory'), Type.Literal('files'), Type.Literal('git'), Type.Literal('baseline'), Type.Literal('registration')]), state: Type.Union([Type.Literal('not_started'), Type.Literal('running'), Type.Literal('confirmed'), Type.Literal('unknown')]) }, closed);
export type CreationStep = Static<typeof CreationStep>;
export const ProjectCreation = Type.Object({
    id: OperationId, operation_id: OperationId, project_id: Type.Union([OperationId, Type.Null()]), plan_hash: digest, plan: ScaffoldPlan,
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
export const CreationView = Type.Object({ creation: ProjectCreation, confirmed_effects: Type.Array(CreationStep), pending_effects: Type.Array(CreationStep), effects: Type.Array(CreationEffect, { maxItems: 3 }),
    remote_effects: Type.Array(Type.Object({ kind: Type.Union([Type.Literal('create_repository'), Type.Literal('associate_origin'), Type.Literal('baseline_push')]),
        state: CreationEffect.properties.state, operation_id: Type.Union([OperationId, Type.Null()]), identity: CreationEffectIdentity, reason: Type.Union([text(128), Type.Null()]) }, closed), { maxItems: 3 }),
    prerequisites: Type.Array(Prerequisite), diagnostics: Type.Array(text(128)), event_cursor: Type.String({ pattern: '^[0-9]+$' }) }, closed);
export type CreationView = Static<typeof CreationView>;
