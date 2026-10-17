import { Type, type Static } from '@sinclair/typebox';
import { Capability, OperationId } from './base.js';
import { Prerequisite } from './projects.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 4096) => Type.String({ minLength: 1, maxLength });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const nullable = Type.Union([text(), Type.Null()]);
export const CreationMode = Type.Union([Type.Literal('local'), Type.Literal('remote_no_push'), Type.Literal('remote_push')]);
export type CreationMode = Static<typeof CreationMode>;
export const ScaffoldInput = Type.Object({
  name: text(256), templateId: text(128), templateDigest: digest, destinationRelative: text(1024),
  creationMode: CreationMode, baseBranch: text(256), triageEnabled: Type.Boolean(),
  remote: Type.Optional(Type.Object({ ownerId: text(256), name: text(100), visibility: Type.Union([Type.Literal('private'), Type.Literal('public')]) }, closed)),
}, closed);
export type ScaffoldInput = Static<typeof ScaffoldInput>;
export const ScaffoldFile = Type.Object({ path: text(1024), bytes: Type.Integer({ minimum: 0, maximum: 65536 }), sha256: digest }, closed);
export const ScaffoldAccount = Type.Object({ state: text(128), id: nullable, login: nullable }, closed);
export const ScaffoldEngineering = Type.Object({ tracker: Type.Literal('github'), domain: Type.Literal('single-context'), instructionFile: Type.Literal('AGENTS.md'), triageEnabled: Type.Boolean(), installsSkills: Type.Literal(false), createsLabels: Type.Literal(false) }, closed);
export const ScaffoldPlan = Type.Object({
  formatVersion: Type.Literal(1), input: ScaffoldInput, installationId: OperationId, settingsETag: text(256),
  projectsRoot: text(), destination: text(), parentIdentity: digest, templateDigest: digest,
  files: Type.Array(ScaffoldFile, { minItems: 1, maxItems: 50 }), engineering: ScaffoldEngineering,
  account: ScaffoldAccount, ownerId: Type.Null(), effects: Type.Array(text(128), { maxItems: 10 }),
}, closed);
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
export const CreationView = Type.Object({ creation: ProjectCreation, confirmedEffects: Type.Array(CreationStep), pendingEffects: Type.Array(CreationStep), prerequisites: Type.Array(Prerequisite), diagnostics: Type.Array(text(128)), eventCursor: Type.String({ pattern: '^[0-9]+$' }) }, closed);
export type CreationView = Static<typeof CreationView>;
