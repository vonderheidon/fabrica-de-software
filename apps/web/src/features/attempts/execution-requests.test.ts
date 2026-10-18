import { expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { HttpStartAttempt, HttpAnswerQuestion, HttpCaptureRetry, HttpRemoveResource, HttpCompletePublication, HttpReconcilePublication, HttpAuthorizeUpgrade, HttpAttemptDetailQuery, HttpAttemptListQuery } from '#contracts';
import { startAttemptBody, answerQuestionBody, captureRetryBody, removeResourceBody, completePublicationBody, reconcilePublicationBody, authorizeUpgradeBody, setAttemptSelection, setAttemptProjectFilter } from './execution-requests.js';
const id = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);
it('builds the actual commands used by preparation, decision, recovery and publication consumers', () => {
  const text = '{"scopeChoice":"texto do operador"}';
  for (const [schema, body] of [
    [HttpStartAttempt, startAttemptBody(id, 3, hash)], [HttpAnswerQuestion, answerQuestionBody(text, 'keep_captured')],
    [HttpCaptureRetry, captureRetryBody(id)], [HttpRemoveResource, removeResourceBody(hash)],
    [HttpCompletePublication, completePublicationBody(id, 'commit')], [HttpReconcilePublication, reconcilePublicationBody(id)],
    [HttpAuthorizeUpgrade, authorizeUpgradeBody(id, 'icr', 'pr', hash)],
  ] as const) expect(Value.Check(schema, body)).toBe(true);
  expect(answerQuestionBody(text)).toEqual({ answer: text });
  expect(startAttemptBody(id, 3, hash)).toEqual({ preparation_id: id, preparation_revision: 3, authorized_summary_hash: hash, authorized: true });
  expect(authorizeUpgradeBody(id, 'icr', 'pr', hash)).toEqual({ delivery_id: id, current_mode: 'icr', target_mode: 'pr', authorized_additional_effects_hash: hash, authorized: true });
});
it('sends selected historical round and version with HTTP query keys while preserving caller identities', () => {
  const query = new URLSearchParams({ section: 'criteria', limit: '1', cursor: 'opaque' });
  setAttemptSelection(query, '2', id);
  expect(Value.Check(HttpAttemptDetailQuery, Object.fromEntries(query))).toBe(true);
  expect(query.get('round_id')).toBe('2'); expect(query.get('delivery_id')).toBe(id);
  expect(query.has('roundId')).toBe(false); expect(query.has('deliveryId')).toBe(false);
  const listQuery = new URLSearchParams({ result: 'active', limit: '25' });
  setAttemptProjectFilter(listQuery, id);
  expect(Value.Check(HttpAttemptListQuery, Object.fromEntries(listQuery))).toBe(true);
  expect(listQuery.get('project_id')).toBe(id); expect(listQuery.has('projectId')).toBe(false);
});
