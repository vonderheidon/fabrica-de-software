import { createHash, randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { EffectView } from '#contracts';
import { createEffectWriter } from './effects.js';
import { GraphQLReader } from './transport.js';
import { createGitHub } from './index.js';

function fixture() {
  const marker = '<!-- factory:icr:install:attempt:delivery -->'; const body = marker+'\nApproved tree and artifact references.';
  const effect: EffectView = { operationId: randomUUID(),attemptId: randomUUID(),creationId: null,deliveryId: randomUUID(),kind: 'issue_comment',scopeKey: 'result',state: 'running',
    expectedIdentity: { repositoryId: 'R',issueId: 'I',marker,bodyHash: createHash('sha256').update(body).digest('hex') },confirmedIdentity: null,receipt: null,
    reason: null,authorized: true,revision: 2,sentAtMs: 1,confirmedAtMs: null };
  const authorization = { accountId: 'A',repositoryIds: ['R'],projectIds: ['P'] };
  const run = vi.fn(async (input: string, onSend?: () => void) => {
    const request = JSON.parse(input) as { variables: { input: { clientMutationId: string } } };
    onSend?.();
    return { exitCode: 0,stdout: 'HTTP/2.0 200 OK\r\ncontent-type: application/json\r\n\r\n'+JSON.stringify({ data: { addComment: { clientMutationId: request.variables.input.clientMutationId,
      commentEdge: { node: { id: 'C',url: 'https://github.com/org/repo/issues/1#issuecomment-1',body,issue: { id: 'I' },repository: { id: 'R' } } } } } }) };
  });
  return { body,effect,authorization,run,reader: new GraphQLReader(run) };
}
it('requires trusted target/account authorization before any mutation and validates the exact comment body hash', async () => {
  const f = fixture();
  expect(await createEffectWriter(f.reader)({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ state: 'failed_known',reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(await createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'OTHER',body: f.body })).toMatchObject({ state: 'failed_known' });
  expect(await createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'A',body: f.body+'changed' })).toMatchObject({ state: 'failed_known',reason: 'EFFECT_INPUT_INVALID' });
  expect(f.run).not.toHaveBeenCalled();
  const writer = createEffectWriter(f.reader,f.authorization);
  expect(await writer({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ state: 'confirmed',receipt: { id: 'C' } });
  const request = JSON.parse(f.run.mock.calls[0]![0]) as { query: string; variables: { input: object } };
  expect(request.query).toContain('addComment');
  expect(request.variables.input).toEqual({ subjectId: 'I',body: f.body,clientMutationId: f.effect.operationId });
});
it.each(['timeout','malformed','partial','wrong_subject','wrong_correlation'])('preserves unknown after a sent mutation with %s instead of assuming failure', async scenario => {
  const f = fixture();
  if (scenario === 'timeout') f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); throw new Error('PRIVATE_NATIVE_MESSAGE'); });
  else if (scenario === 'malformed') f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); return { exitCode: 0,stdout: 'not HTTP' }; });
  else if (scenario === 'partial') f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); return { exitCode: 1,stdout: 'HTTP/2 200 OK\r\nx:test\r\n\r\n'+JSON.stringify({ data: { addComment: null },errors: [{ type: 'INTERNAL',message: 'PRIVATE_REMOTE_MESSAGE' }] }) }; });
  else {
    const response = await f.run(''+JSON.stringify({ variables: { input: { clientMutationId: f.effect.operationId } } })); f.run.mockClear();
    f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); return { ...response,stdout: scenario === 'wrong_subject' ? response.stdout.replace('"id":"I"','"id":"OTHER"') : response.stdout.replace(f.effect.operationId,randomUUID()) }; });
  }
  const result = await createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'A',body: f.body });
  expect(result.state).toBe('unknown'); expect(result.receipt).toBeNull(); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});
it('requires project authorization and only sends the exact mapped single-select field, with mandatory readback', async () => {
  const f = fixture();
  const effect: EffectView = { ...f.effect,kind: 'project_status',expectedIdentity: { repositoryId: 'R',issueId: 'I',projectId: 'P',itemId: 'ITEM',fieldId: 'FIELD',optionId: 'DELIVERED',previousOptionId: 'REVIEW' } };
  const writer = createEffectWriter(f.reader,f.authorization);
  f.run.mockResolvedValueOnce({ exitCode: 0,stdout: 'HTTP/2 200 OK\r\nx:test\r\n\r\n'+JSON.stringify({ data: { updateProjectV2ItemFieldValue: { clientMutationId: effect.operationId,projectV2Item: { id: 'ITEM' } } } }) });
  expect(await writer({ effect,accountId: 'A' })).toMatchObject({ state: 'unknown',reason: 'STATUS_READBACK_REQUIRED' });
  const request = JSON.parse(f.run.mock.calls[0]![0]) as { query: string; variables: { input: object } };
  expect(request.query).toContain('updateProjectV2ItemFieldValue');
  expect(request.variables.input).toEqual({ projectId: 'P',itemId: 'ITEM',fieldId: 'FIELD',value: { singleSelectOptionId: 'DELIVERED' },clientMutationId: effect.operationId });
  expect(request.query).not.toContain('updateIssue');
});
it('shares query rate-limit cooldown with mutations and does not send a second request during the delay', async () => {
  const f = fixture(); f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); return { exitCode: 1,stdout: 'HTTP/2 429 Too Many Requests\r\nretry-after: 120\r\n\r\n{}' }; });
  const writer = createEffectWriter(f.reader,f.authorization);
  expect((await writer({ effect: f.effect,accountId: 'A',body: f.body })).state).toBe('unknown');
  expect(await writer({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ state: 'failed_known',reason: 'RATE_LIMITED' });
  expect(f.run).toHaveBeenCalledOnce();
});
it('fails before IO when the real adapter has no authorized host context', async () => {
  const f = fixture();
  expect(await createGitHub({ mutationAuthorization: f.authorization }).mutateEffect({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ state: 'failed_known',reason: 'CONTEXT_UNAVAILABLE' });
});
