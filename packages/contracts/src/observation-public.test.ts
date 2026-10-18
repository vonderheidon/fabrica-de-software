import { expect, it } from 'vitest';
import type { TSchema } from '@sinclair/typebox';
import { TypeGuard } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { DiagnosticCheck, HttpDiagnosticCheck, DiagnosticContext, HttpDiagnosticContext, DiagnosticChecks, HttpDiagnosticChecks, DiagnosticRequest, HttpDiagnosticRequest, ContextDiagnostic, HttpContextDiagnostic, DiagnosticReport, HttpDiagnosticReport, DiagnosticsView, HttpDiagnosticsView, OperationSummaryQuery, HttpOperationSummaryQuery, OperationSummary, HttpOperationSummary, QueueScope, HttpQueueScope, QueueReason, HttpQueueReason, QueueItem, HttpQueueItem, QueueDiagnostic, HttpQueueDiagnostic, QueueObservation, HttpQueueObservation, QueueQuery, HttpQueueQuery, QueueCommand, HttpQueueCommand, QueueSaved, HttpQueueSaved, QueueConflict, HttpQueueConflict, CreationMode, HttpCreationMode, ScaffoldInput, HttpScaffoldInput, ScaffoldFile, HttpScaffoldFile, ScaffoldAccount, HttpScaffoldAccount, ScaffoldEngineering, HttpScaffoldEngineering, ScaffoldPlan, HttpScaffoldPlan, ScaffoldPlanned, HttpScaffoldPlanned, ScaffoldOptions, HttpScaffoldOptions, CreateScaffold, HttpCreateScaffold, HttpCreationParams, CreationStep, HttpCreationStep, ProjectCreation, HttpProjectCreation, CreationEffectIdentity, HttpCreationEffectIdentity, CreationEffect, HttpCreationEffect, CreationView, HttpCreationView, ControllerEvent, HttpControllerEvent, EventQuery, HttpEventQuery, EventListQuery, HttpEventListQuery, EventStreamQuery, HttpEventStreamQuery, EventPage, HttpEventPage, HttpControllerEventFrame } from './index.js';

// Test-only schema comparison: keywords and constraints stay verbatim; only declared JSON property names change.
function expectedHttpSchema(schema: TSchema): unknown {
  const rename = (key: string): string => key.replace(/[A-Z]/g, letter => '_'+letter.toLowerCase());
  if (TypeGuard.IsObject(schema)) return { ...schema,
    properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [rename(key), expectedHttpSchema(value)])),
    ...(schema.required ? { required: schema.required.map(rename) } : {}) };
  if (TypeGuard.IsArray(schema)) return { ...schema, items: expectedHttpSchema(schema.items) };
  if (TypeGuard.IsUnion(schema)) return { ...schema, anyOf: schema.anyOf.map((item: TSchema) => expectedHttpSchema(item)) };
  return schema;
}
const pairs: readonly (readonly [string, TSchema, TSchema])[] = [
  ['DiagnosticCheck', DiagnosticCheck, HttpDiagnosticCheck],
  ['DiagnosticContext', DiagnosticContext, HttpDiagnosticContext],
  ['DiagnosticChecks', DiagnosticChecks, HttpDiagnosticChecks],
  ['DiagnosticRequest', DiagnosticRequest, HttpDiagnosticRequest],
  ['ContextDiagnostic', ContextDiagnostic, HttpContextDiagnostic],
  ['DiagnosticReport', DiagnosticReport, HttpDiagnosticReport],
  ['DiagnosticsView', DiagnosticsView, HttpDiagnosticsView],
  ['OperationSummaryQuery', OperationSummaryQuery, HttpOperationSummaryQuery],
  ['OperationSummary', OperationSummary, HttpOperationSummary],
  ['QueueScope', QueueScope, HttpQueueScope],
  ['QueueReason', QueueReason, HttpQueueReason],
  ['QueueItem', QueueItem, HttpQueueItem],
  ['QueueDiagnostic', QueueDiagnostic, HttpQueueDiagnostic],
  ['QueueObservation', QueueObservation, HttpQueueObservation],
  ['QueueQuery', QueueQuery, HttpQueueQuery],
  ['QueueCommand', QueueCommand, HttpQueueCommand],
  ['QueueSaved', QueueSaved, HttpQueueSaved],
  ['QueueConflict', QueueConflict, HttpQueueConflict],
  ['CreationMode', CreationMode, HttpCreationMode],
  ['ScaffoldInput', ScaffoldInput, HttpScaffoldInput],
  ['ScaffoldFile', ScaffoldFile, HttpScaffoldFile],
  ['ScaffoldAccount', ScaffoldAccount, HttpScaffoldAccount],
  ['ScaffoldEngineering', ScaffoldEngineering, HttpScaffoldEngineering],
  ['ScaffoldPlan', ScaffoldPlan, HttpScaffoldPlan],
  ['ScaffoldPlanned', ScaffoldPlanned, HttpScaffoldPlanned],
  ['ScaffoldOptions', ScaffoldOptions, HttpScaffoldOptions],
  ['CreateScaffold', CreateScaffold, HttpCreateScaffold],
  ['CreationStep', CreationStep, HttpCreationStep],
  ['ProjectCreation', ProjectCreation, HttpProjectCreation],
  ['CreationEffectIdentity', CreationEffectIdentity, HttpCreationEffectIdentity],
  ['CreationEffect', CreationEffect, HttpCreationEffect],
  ['CreationView', CreationView, HttpCreationView],
  ['ControllerEvent', ControllerEvent, HttpControllerEvent],
  ['EventQuery', EventQuery, HttpEventQuery],
  ['EventListQuery', EventListQuery, HttpEventListQuery],
  ['EventStreamQuery', EventStreamQuery, HttpEventStreamQuery],
  ['EventPage', EventPage, HttpEventPage],
];
it.each(pairs)('preserves all constraints and closes the HTTP representation of %s', (_name, internal, http) => {
  expect(http).toEqual(expectedHttpSchema(internal));
});

const id = '11111111-1111-4111-8111-111111111111';
const queries: readonly (readonly [TSchema, Record<string, unknown>, string, string])[] = [
  [HttpOperationSummaryQuery, { project_id: id }, 'project_id', 'projectId'],
  [HttpEventListQuery, { operation_id: id }, 'operation_id', 'operationId'],
  [HttpEventListQuery, { project_id: id }, 'project_id', 'projectId'],
  [HttpEventStreamQuery, { attempt_id: id }, 'attempt_id', 'attemptId'],
  [HttpQueueQuery, { project_ids: id }, 'project_ids', 'projectIds'],
  [HttpScaffoldInput, { name: 'Name', template_id: 'template', template_digest: 'a'.repeat(64), destination_relative: 'folder', creation_mode: 'local', base_branch: 'main', triage_enabled: false }, 'template_id', 'templateId'],
  [HttpQueueCommand, { enabled: true, scope: { kind: 'account', project_ids: [id] }, observation_id: id, authorized_summary_hash: 'hash' }, 'observation_id', 'observationId'],
];
it.each(queries)('rejects aliases alone and alongside canonical fields %#', (schema, canonical, key, alias) => {
  expect(Value.Check(schema, canonical)).toBe(true);
  expect(Value.Check(schema, { ...canonical, [alias]: canonical[key] })).toBe(false);
  const { [key]: value, ...rest } = canonical;
  expect(Value.Check(schema, { ...rest, [alias]: value })).toBe(false);
});
it('keeps paginated events and SSE frames distinct and closed', () => {
  const frame = { entity: { type: 'project', id }, revision: 1, operation_id: id, event_type: 'settings.updated', facts: {} };
  expect(Value.Check(HttpControllerEventFrame, frame)).toBe(true);
  expect(Value.Check(HttpControllerEvent, frame)).toBe(false);
  for (const extra of [{ seq: '1' }, { occurred_at_ms: 0 }, { operationId: id }, { eventType: 'settings.updated' }, { facts: { projectId: 'external text' } }]) {
    expect(Value.Check(HttpControllerEventFrame, { ...frame, ...extra })).toBe(false);
  }
  expect(Value.Check(HttpCreationParams, { creationId: id })).toBe(true);
  expect(Value.Check(HttpCreationParams, { creation_id: id })).toBe(false);
});
