import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { OperationId } from './base.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const timestamp = Type.Integer({ minimum: 0 });

/** Registration by GitHub URL: the factory clones (or adopts) the repository into `<projects_root>/<folder_name>`. */
export const ProjectImportRequest = Type.Object({
  name: text(256),
  repository_url: text(4096),
  folder_name: text(255),
  /** Omitted: the repository default branch observed on GitHub. */
  base_branch: Type.Optional(text(1024)),
}, closed);
export type ProjectImportRequest = Static<typeof ProjectImportRequest>;

export const ProjectImportStepName = Type.Union((['repository', 'reservation', 'clone', 'verification', 'registration'] as const).map(step => Type.Literal(step)));
export type ProjectImportStepName = Static<typeof ProjectImportStepName>;
export const ProjectImportStepState = Type.Union((['not_started', 'running', 'confirmed', 'skipped', 'failed'] as const).map(state => Type.Literal(state)));
export type ProjectImportStepState = Static<typeof ProjectImportStepState>;
export const ProjectImportStep = Type.Object({ step: ProjectImportStepName, state: ProjectImportStepState }, closed);
export type ProjectImportStep = Static<typeof ProjectImportStep>;

export const ProjectImportState = Type.Union((['accepted', 'running', 'completed', 'failed'] as const).map(state => Type.Literal(state)));
export type ProjectImportState = Static<typeof ProjectImportState>;
/** `removed`: a folder the factory created in this operation was deleted after a failure. Adopted folders are never removed. */
export const ProjectImportCleanup = Type.Union((['not_needed', 'removed', 'failed'] as const).map(state => Type.Literal(state)));

export const ProjectImportParams = Type.Object({ importId: OperationId }, closed);
export const ProjectImportView = Type.Object({
  id: OperationId, operation_id: OperationId, state: ProjectImportState,
  name: text(256), repository_url: text(4096), repository_id: nullable(text(256)),
  base_branch: nullable(text(1024)), destination: text(32768),
  /** The destination already was a clone of the same repository and was registered without cloning. */
  adopted: Type.Boolean(),
  steps: Type.Array(ProjectImportStep, { minItems: 5, maxItems: 5 }),
  project_id: nullable(OperationId), diagnostic: nullable(Type.String({ pattern: '^[A-Z0-9_]{1,128}$' })), cleanup: ProjectImportCleanup,
  revision: Type.Integer({ minimum: 1 }), created_at_ms: timestamp, updated_at_ms: timestamp,
}, closed);
export type ProjectImportView = Static<typeof ProjectImportView>;

/** Light, on-demand reading of a candidate Pasta do projeto for Configurar projeto. Never writes. */
export const ProjectFolderInspectionRequest = Type.Object({ location: text(32768) }, closed);
export type ProjectFolderInspectionRequest = Static<typeof ProjectFolderInspectionRequest>;
export const ProjectFolderInspection = Type.Object({
  location: text(32768),
  /** `same_repository`: a Git checkout whose single remote resolves on GitHub to the project's repository_id. */
  clone: Type.Union((['same_repository', 'other_repository', 'not_clone', 'unavailable'] as const).map(value => Type.Literal(value))),
  /** `owner/name` of the project's repository, for the "Clone de <repo>" label. */
  repository: nullable(text(512)),
  checkout: nullable(Type.Union([
    Type.Object({ kind: Type.Literal('branch'), name: text(1024) }, closed),
    Type.Object({ kind: Type.Literal('detached') }, closed),
  ])),
  diagnostic: nullable(Type.String({ pattern: '^[A-Z0-9_]{1,128}$' })),
  observed_at_ms: timestamp,
}, closed);
export type ProjectFolderInspection = Static<typeof ProjectFolderInspection>;
