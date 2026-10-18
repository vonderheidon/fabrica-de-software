import { Type, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  ArtifactPolicy, Capability, ConfiguredLimit, DeliveryMode, EmptyBody, EmptyQuery, ErrorResponse, FactorySettings,
  GlobalChanges, HealthResponse, MeasuredValue, OperationAccepted, OperationId, OperationParams, OperationReceipt,
  OperationResource, OperationView, Page, SessionResponse, TimeDefaults,
} from './index.js';

const id = 'abcdef12-1234-4123-8123-123456789012';
const times = { format_version: 1, polling_interval_ms: 1, polling_backoff_max_ms: 3, passage_active_time_ms: 2_147_483_647, question_ttl: { state: 'not_configured' } };
const policy = { format_version: 1, automatic_deletion: false };
const receipt = { revision: 1, event_cursor: '0' };
const resource = { type: 'settings', id: 'local' };
const settings = { id: 'local', installation_id: id, account_id: null, designated_host: null, projects_root: null,
  automation_enabled: false, time_defaults: times, artifact_policy: policy, revision: 1, created_at_ms: 0, updated_at_ms: 0 };
const error = { code: 'BLOCKED', message: 'Regularize a configuração.', request_id: id, field_errors: [{ field: 'time_defaults', message: 'Verifique este campo.' }],
  operation_id: id, resource, affected_requirements: ['RNF-18'], recovery: 'Consulte a operação.', facts: { operatorKey: 'preserved' } };

describe('public common JSON contracts', () => {
  const cases: [string, TSchema, Record<string, unknown>, string[]][] = [
    ['session', SessionResponse, { csrf_token: 'A'.repeat(43), instance_id: id }, ['csrfToken', 'instanceId']],
    ['error', ErrorResponse, error, ['requestId', 'fieldErrors', 'operationId', 'affectedRequirements']],
    ['receipt', OperationReceipt, receipt, ['eventCursor']],
    ['accepted', OperationAccepted, { operation_id: id, resource, status_url: `/api/v1/operations/${id}`, receipt, request_id: id }, ['operationId', 'statusUrl', 'requestId']],
    ['operation', OperationView, { operation_id: id, kind: 'settings.update', resource, state: 'unknown', receipt, error, request_id: id }, ['operationId', 'requestId']],
    ['page', Page(Type.String()), { items: [], next_cursor: null, has_more: false, event_cursor: '0' }, ['nextCursor', 'hasMore', 'eventCursor']],
    ['capability', Capability, { available: false, reason_code: 'UNAVAILABLE', reason: 'Indisponível.', recovery: 'Tente novamente.' }, ['reasonCode']],
    ['measurement', MeasuredValue, { state: 'unavailable', reason: 'Sem observação.', affected_requirements: ['RNF-18'] }, ['affectedRequirements']],
    ['times', TimeDefaults, times, ['formatVersion', 'pollingIntervalMs', 'pollingBackoffMaxMs', 'passageActiveTimeMs', 'questionTtl']],
    ['policy', ArtifactPolicy, policy, ['formatVersion', 'automaticDeletion']],
    ['settings', FactorySettings, settings, ['installationId', 'accountId', 'designatedHost', 'projectsRoot', 'automationEnabled', 'timeDefaults', 'artifactPolicy', 'createdAtMs', 'updatedAtMs']],
  ];
  it.each(cases)('validates %s and rejects aliases even alongside canonical fields', (_name, schema, value, aliases) => {
    expect(Value.Check(schema, value)).toBe(true);
    for (const alias of aliases) expect(Value.Check(schema, { ...value, [alias]: null })).toBe(false);
  });
  it('retains closed partial common schemas in aggregate requests', () => {
    expect(Value.Check(GlobalChanges, { time_defaults: { polling_interval_ms: 3 }, artifact_policy: { automatic_deletion: false } })).toBe(true);
    expect(Value.Check(GlobalChanges, { time_defaults: { polling_interval_ms: 3, pollingIntervalMs: 3 } })).toBe(false);
    for (const value of [0, -1, 1.5, 2_147_483_648, '1', null]) expect(Value.Check(GlobalChanges, { time_defaults: { polling_interval_ms: value } })).toBe(false);
    expect(Value.Check(FactorySettings, { ...settings, costDefaults: {} })).toBe(false);
    expect(Value.Check(FactorySettings, { ...settings, maestriSettings: {} })).toBe(false);
  });
  it('preserves IDs, path parameters, empty objects, scalar measures and limits', () => {
    expect(Value.Check(OperationParams, { operationId: id })).toBe(true);
    expect(Value.Check(OperationParams, { operation_id: id })).toBe(false);
    for (const value of ['bad', id.toUpperCase(), '']) expect(Value.Check(OperationId, value)).toBe(false);
    expect(Value.Check(OperationResource, resource)).toBe(true);
    expect(Value.Check(OperationResource, { ...resource, path: 'arbitrary' })).toBe(false);
    for (const schema of [EmptyBody, EmptyQuery]) { expect(Value.Check(schema, {})).toBe(true); expect(Value.Check(schema, { extra: true })).toBe(false); }
    expect(Value.Check(HealthResponse, { status: 'ok' })).toBe(true);
    for (const value of ['icr', 'commit', 'pr']) expect(Value.Check(DeliveryMode, value)).toBe(true);
    expect(Value.Check(MeasuredValue, { state: 'measured', value: 0, unit: 'ms' })).toBe(true);
    expect(Value.Check(ConfiguredLimit, { state: 'configured', value: 0, unit: 'ms' })).toBe(true);
    expect(Value.Check(ConfiguredLimit, { state: 'not_configured', value: 0 })).toBe(false);
    expect(Value.Check(ErrorResponse, { ...error, operation_id: 'invalid' })).toBe(false);
  });
});
