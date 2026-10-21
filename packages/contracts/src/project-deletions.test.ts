import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  DeletionTarget, DeletionBlocker, DeletionPreview, DeletionPending, DeletionCompleted,
  DeletionStatus, DeletionSummary, DeletionConfirmation, DeletionResume, OperationViewWithDeletion,
  ProjectSummaryWithDeletion, ProjectDetailWithDeletion, ConfigurationViewWithDeletion,
} from './project-deletions.js';

const id = '11111111-1111-4111-8111-111111111111';
const target = { target_key: 'original', target_kind: 'original_directory', path: 'C:\\projetos\\ação', state: 'pending' };
const blocker = { reason: 'Há trabalho pendente.', recovery: 'Aguarde o encerramento.' };
const preview = { project_id: id, project_name: 'Projeto', project_revision: 1, authorization_digest: 'a'.repeat(64), source_kind: 'local', targets: [target], blockers: [], can_confirm: true };
const pending = { operation_id: id, project_id: id, project_name: 'Projeto', state: 'accepted', revision: 1, targets: [target], blockers: [], can_retry: false };
const completed = { operation_id: id, state: 'succeeded' };

describe('closed project deletion wire contracts', () => {
  it.each([
    [DeletionTarget, target], [DeletionBlocker, blocker], [DeletionPreview, preview],
    [DeletionPending, pending], [DeletionCompleted, completed], [DeletionStatus, pending],
    [DeletionStatus, completed], [DeletionSummary, { operation_id: id, state: 'pending', reason: null, recovery: null }],
    [DeletionConfirmation, { confirmed: true, authorization_digest: 'a'.repeat(64) }], [DeletionResume, {}],
  ] as const)('accepts the normative shape and rejects extra fields', (schema, value) => {
    expect(Value.Check(schema, value)).toBe(true);
    expect(Value.Check(schema, { ...value, extra: true })).toBe(false);
  });

  it.each(['', 'invalid', '11111111-1111-0111-8111-111111111111', '1'.repeat(36)])('rejects invalid UUID %s', operation_id => {
    expect(Value.Check(DeletionCompleted, { ...completed, operation_id })).toBe(false);
    expect(Value.Check(DeletionPreview, { ...preview, project_id: operation_id })).toBe(false);
  });
  it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'z'.repeat(64), 'A'.repeat(64)])('rejects invalid digest', authorization_digest => {
    expect(Value.Check(DeletionConfirmation, { confirmed: true, authorization_digest })).toBe(false);
    expect(Value.Check(DeletionPreview, { ...preview, authorization_digest })).toBe(false);
  });
  it.each([false, null, 'true', 1, undefined])('requires an explicit true confirmation', confirmed => {
    expect(Value.Check(DeletionConfirmation, { confirmed, authorization_digest: 'a'.repeat(64) })).toBe(false);
  });
  it.each(['project_id', 'project_name', 'targets', 'receipt', 'reason', 'request_id'])('keeps completed results minimal: %s', key => {
    const value = { ...completed, [key]: key === 'targets' ? [] : id };
    expect(Value.Check(DeletionStatus, value)).toBe(false);
    expect(Value.Check(OperationViewWithDeletion, value)).toBe(false);
  });
  it('rejects invalid states, revisions, text sizes and bodies without coercion', () => {
    for (const state of ['succeeded', 'cancelled', 'unknown', '']) expect(Value.Check(DeletionPending, { ...pending, state })).toBe(false);
    for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) expect(Value.Check(DeletionPending, { ...pending, revision })).toBe(false);
    for (const path of ['', ' ', 'a'.repeat(4097)]) expect(Value.Check(DeletionTarget, { ...target, path })).toBe(false);
    expect(Value.Check(DeletionTarget, { ...target, target_key: 'a'.repeat(129) })).toBe(false);
    expect(Value.Check(DeletionTarget, { ...target, target_kind: 'directory' })).toBe(false);
    expect(Value.Check(DeletionTarget, { ...target, state: 'succeeded' })).toBe(false);
    expect(Value.Check(DeletionPreview, { ...preview, project_name: 'a'.repeat(257) })).toBe(false);
    expect(Value.Check(DeletionBlocker, { ...blocker, reason: 'a'.repeat(2049) })).toBe(false);
    for (const body of [null, [], '', { confirmed: true }]) expect(Value.Check(DeletionResume, body)).toBe(false);
  });
  it('exports opt-in extensions without changing current required fields', () => {
    for (const schema of [ProjectSummaryWithDeletion, ProjectDetailWithDeletion, ConfigurationViewWithDeletion]) {
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toContain('deletion');
      expect(Value.Check(schema.properties.deletion, null)).toBe(true);
    }
    expect(Value.Check(OperationViewWithDeletion, completed)).toBe(true);
    expect(Value.Check(OperationViewWithDeletion, { operation_id: id, kind: 'settings.update', resource: { type: 'settings', id: 'local' }, state: 'succeeded', request_id: 'request' })).toBe(true);
  });
});
