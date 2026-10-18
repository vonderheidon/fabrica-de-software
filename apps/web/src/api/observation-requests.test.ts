import { expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { HttpQueueCommand, HttpScaffoldInput, HttpCreateScaffold, type HttpQueueObservation, type HttpScaffoldPlan } from '#contracts';
import { eventListQuery, queueQuery, enableQueueRequest, createScaffoldRequest } from './observation-requests.js';
import { parsePayload } from '../app/useControllerEvents.js';

const id = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

it('builds scoped query strings without changing cursor bytes or navigation identifiers', () => {
  const cursor = 'scope_cursor-1';
  expect(Object.fromEntries(new URLSearchParams(eventListQuery({ projectId: id, attemptId: id, operationId: id }, cursor))))
    .toEqual({ limit: '25', project_id: id, attempt_id: id, operation_id: id, cursor });
  expect(Object.fromEntries(new URLSearchParams(queueQuery(id, cursor))))
    .toEqual({ limit: '25', project_id: id, cursor });
  expect(queueQuery(null, null)).toBe('limit=25');
});

it('sends the exact queue scope and authorization from the displayed observation', () => {
  const observation: HttpQueueObservation = {
    scope: { kind: 'project', project_ids: [id] }, enabled: false, valid: true, complete: true,
    observation_id: id, summary_hash: hash, observed_at_ms: 0, eligible_total: 0, modes_by_project: [{ project_id: id, mode: 'icr' }],
    account: { id: 'account', login: 'user' }, host: { expected: 'host', observed: 'host', matches: true },
    order: { criterion: 'position', description: 'Observed order' }, diagnostics: [], event_cursor: '0',
    page: { items: [], next_cursor: null, has_more: false, event_cursor: '0' },
    polling: { interval_ms: 1, backoff_max_ms: 3, retry_at_ms: null, next_poll_at_ms: 1 },
  };
  const body = enableQueueRequest(observation);
  expect(Value.Check(HttpQueueCommand, body)).toBe(true);
  expect(body).toEqual({ enabled: true, scope: observation.scope, observation_id: id, authorized_summary_hash: hash });
});

it('preserves the displayed scaffold plan and literal operator content in the creation command', () => {
  const plan: HttpScaffoldPlan = {
    format_version: 1, input: { name: 'projectId literal 😀', template_id: 'template', template_digest: hash,
      destination_relative: 'folder', creation_mode: 'local', base_branch: 'main', triage_enabled: false },
    installation_id: id, settings_e_tag: '"opaque"', projects_root: 'root', destination: 'root/folder', parent_identity: hash,
    template_digest: hash, files: [{ path: 'AGENTS.md', bytes: 0, sha256: hash }],
    engineering: { tracker: 'github', domain: 'single-context', instruction_file: 'AGENTS.md', triage_enabled: false, installs_skills: false, creates_labels: false },
    account: { state: 'complete', id: 'account', login: 'user' }, owner_id: null, effects: ['register_local_project'],
  };
  const body = createScaffoldRequest({ plan_hash: hash, plan, prerequisites: [] });
  expect(Value.Check(HttpScaffoldInput, plan.input)).toBe(true);
  expect(Value.Check(HttpCreateScaffold, body)).toBe(true);
  expect(body.plan).toBe(plan);
  expect(body.plan.input.name).toBe('projectId literal 😀');
  expect(body.plan.input).not.toHaveProperty('remote');
});

it('consumes only the shared SSE frame shape, preserving seq and refusing malformed or aliased frames', () => {
  const frame = { entity: { type: 'attempt', id }, revision: 1, operation_id: id, event_type: 'attempt.updated', attempt_id: id, facts: {} };
  const message = (value: unknown, seq = '9007199254740993') => new MessageEvent<string>('controller-event', { data: JSON.stringify(value), lastEventId: seq });
  expect(parsePayload(message(frame))).toEqual({ ...frame, seq: '9007199254740993' });
  expect(parsePayload(message(frame, '0'))).toBeNull();
  for (const value of [{ ...frame, operationId: id }, { ...frame, eventType: frame.event_type }, { ...frame, seq: '1' }, { ...frame, facts: { arbitraryCamelCase: 'literal' } }]) {
    expect(parsePayload(message(value))).toBeNull();
  }
  expect(parsePayload(new MessageEvent<string>('controller-event', { data: '{', lastEventId: '1' }))).toBeNull();
});
