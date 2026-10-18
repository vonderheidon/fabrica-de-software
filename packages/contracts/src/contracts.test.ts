import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { Capability, ConfiguredLimit, DeliveryMode, ErrorResponse, MeasuredValue } from './index.js';

describe('shared contracts', () => {
  it('keeps delivery modes distinct from scaffold modes', () => {
    for (const mode of ['icr', 'commit', 'pr']) expect(Value.Check(DeliveryMode, mode)).toBe(true);
    for (const mode of ['local', 'remote_push', 'ICR', 'merge']) expect(Value.Check(DeliveryMode, mode)).toBe(false);
  });
  it('distinguishes measured zero, unavailable and not applicable', () => {
    expect(Value.Check(MeasuredValue, { state: 'measured', value: 0, unit: 'ms' })).toBe(true);
    expect(Value.Check(MeasuredValue, { state: 'unavailable', reason: 'No sample', affected_requirements: ['RNF-16'] })).toBe(true);
    expect(Value.Check(MeasuredValue, { state: 'not_applicable', reason: 'No provider call' })).toBe(true);
    expect(Value.Check(MeasuredValue, { state: 'unavailable', value: 0, unit: 'ms' })).toBe(false);
    expect(Value.Check(MeasuredValue, { state: 'measured', value: -1, unit: 'ms' })).toBe(false);
    expect(Value.Check(ConfiguredLimit, { state: 'not_configured' })).toBe(true);
    expect(Value.Check(ConfiguredLimit, { state: 'configured', value: 0, unit: 'USD' })).toBe(true);
  });
  it('bounds error payloads and rejects unexpected fields', () => {
    const error = { code: 'VALIDATION_FAILED', message: 'Invalid request.', request_id: 'request-id' } satisfies ErrorResponse;
    expect(Value.Check(ErrorResponse, error)).toBe(true);
    expect(Value.Check(ErrorResponse, { ...error, stack: 'private' })).toBe(false);
    expect(Value.Check(ErrorResponse, { ...error, message: '' })).toBe(false);
    expect(Value.Check(Capability, { available: false, reason_code: 'NOT_CONFIGURED', reason: 'Configure the host.' })).toBe(true);
    expect(Value.Check(Capability, { available: true, token: 'private' })).toBe(false);
  });
});
