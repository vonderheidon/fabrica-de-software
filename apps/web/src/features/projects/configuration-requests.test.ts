import { expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ConfigurationOptionsQuery, ConfigurationUpdate, PreparationUpdate, SettingsUpdate, type ProfileChanges, type PreparationChoices, type ProjectChanges } from '#contracts';
import { configurationCommand, configurationOptionsParams } from './configuration-requests.js';
import { changedChoices } from '../preparations/preparation-requests.js';

it('serializes global and project editor submissions using the actual shared request schemas', () => {
  const profiles: ProfileChanges = [{ action: 'create', profile: { name: 'Implementador', profile_type: 'implementer', executor: 'maestri-omp', provider: 'exact', model: 'exact', effort: 'high', guidance: '{"modelId":"texto literal"}' } }];
  const global = JSON.parse(JSON.stringify(configurationCommand(null, { time_defaults: { polling_interval_ms: 3 } }, profiles))) as unknown;
  expect(Value.Check(SettingsUpdate, global)).toBe(true);
  expect(global).toEqual({ changes: { time_defaults: { polling_interval_ms: 3 } }, profile_changes: profiles });
  const project = configurationCommand({ github_project: null, reviewer_profile_id: null, queue_order: { use_board_position: false } }, {}, profiles);
  expect(Value.Check(ConfigurationUpdate, project)).toBe(true);
  expect(JSON.stringify(project)).not.toContain('"checks"');
  expect(project).not.toHaveProperty('global_changes');
  expect(configurationCommand(null, {}, profiles)).toEqual({ changes: {}, profile_changes: profiles });
  expect(configurationCommand({}, {}, profiles)).toEqual({ project_changes: {}, profile_changes: profiles });
  expect(configurationCommand({}, {})).not.toHaveProperty('profile_changes');
  const staleQueueOrder = { queue_order: { use_board_position: false, priority_field_id: 'PRIORITY', priority_direction: 'desc' } } as unknown as ProjectChanges;
  expect(configurationCommand(staleQueueOrder, {})).toEqual({ project_changes: { queue_order: { use_board_position: false } } });
});

it('preserves selection and opaque cursors while serializing query names in snake_case', () => {
  const params = configurationOptionsParams({ owner_id: 'Owner á&=', github_project_id: 'Project/1', status_field_id: 'Field+1' }, 'opaque+/=');
  const query = Object.fromEntries(new URLSearchParams(params.toString()));
  expect(Value.Check(ConfigurationOptionsQuery, query)).toBe(true);
  expect(query).toEqual({ owner_id: 'Owner á&=', github_project_id: 'Project/1', status_field_id: 'Field+1', cursor: 'opaque+/=' });
});

it('submits only edited preparation choices, preserves text and leaves immutable retry identity out of PUT', () => {
  const before: PreparationChoices = { issue_id: 'ISSUE', delivery_mode: 'icr', guidance: '', overrides: {}, previous_attempt_id: 'f0fce308-07bb-49c0-b645-21bdcbe8ef30' };
  const guidance = '{"issueId":"literal do operador"}';
  const changes = changedChoices(before, { ...before, delivery_mode: 'pr', guidance, overrides: { base_branch: 'release', correction_limit: 0 } });
  expect(Value.Check(PreparationUpdate, { changes })).toBe(true);
  expect(changes).toEqual({ delivery_mode: 'pr', guidance, overrides: { base_branch: 'release', correction_limit: 0 } });
  expect(JSON.stringify(changes)).not.toContain('"checks"');
  expect(changedChoices(before, before)).toEqual({});
});
